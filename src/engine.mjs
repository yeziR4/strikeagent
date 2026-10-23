import {parseCommand,HELP} from './commands.mjs';import {transaction} from './store.mjs';
export const units=v=>Math.round(v*1e6);const usd=u=>'$'+(u/1e6).toFixed(2);const fmt=v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:4});
class UserError extends Error {}
export function formatReply(text){const suffix='\nTrade on Strike: https://app.strikefinance.org';const budget=275-Array.from(suffix).length;const chars=Array.from(text);return (chars.length>budget?chars.slice(0,budget-1).join('')+'…':text)+suffix}
export class Engine {
 constructor(db,prices,cfg){Object.assign(this,{db,prices,cfg})}
 account(user){this.db.prepare('INSERT OR IGNORE INTO accounts VALUES(?,?,?)').run(user,units(this.cfg.startingBalance),Date.now());return this.db.prepare('SELECT * FROM accounts WHERE user_id=?').get(user)}
 positions(user){return this.db.prepare('SELECT * FROM positions WHERE user_id=? AND closed_at IS NULL ORDER BY id').all(user)}
 quoteClose(p,mark){const sign=p.side==='long'?1:-1;const exit=mark*(1-sign*this.cfg.slippageBps/10000);const fee=units(p.quantity*exit*this.cfg.feeBps/10000);const pnl=units(sign*p.quantity*(exit-p.entry))-fee;return {exit,pnl:Math.max(-p.margin,pnl),fee}}
 finish(event,text){text=formatReply(text);this.db.prepare("UPDATE events SET status='done',error=NULL WHERE post_id=?").run(event.post_id);this.db.prepare('INSERT INTO replies(post_id,text) VALUES(?,?)').run(event.post_id,text);return text}
 async process(event){
  if(this.db.prepare('SELECT 1 FROM replies WHERE post_id=?').get(event.post_id))return;
  let cmd;try{cmd=parseCommand(event.text,this.cfg.botHandle)}catch(e){return transaction(this.db,()=>this.finish(event,e.message))}
  let marks={};try{
   if(cmd.type==='price')marks[cmd.symbol]=await this.prices.get(cmd.symbol);
   if(cmd.type==='open'){if(cmd.leverage>this.cfg.maxLeverage)throw Error(`Maximum leverage is ${this.cfg.maxLeverage}x.`);marks[cmd.symbol]=await this.prices.get(cmd.symbol)}
   if(cmd.type==='close'){const p=this.db.prepare('SELECT * FROM positions WHERE id=? AND user_id=? AND closed_at IS NULL').get(Number(cmd.id.slice(1)),event.user_id);if(!p)throw Error('No open paper position with that ID belongs to you.');marks[p.symbol]=await this.prices.get(p.symbol)}
   if(cmd.type==='portfolio'){for(const p of this.positions(event.user_id))marks[p.symbol]=await this.prices.get(p.symbol)}
  }catch(e){return transaction(this.db,()=>this.finish(event,`PAPER: ${e.message}`))}
  return transaction(this.db,()=>{
   if(this.db.prepare('SELECT 1 FROM replies WHERE post_id=?').get(event.post_id))return;
   const a=this.account(event.user_id);
   try{
    if(cmd.type==='help')return this.finish(event,HELP);
    if(cmd.type==='markets')return this.finish(event,`PAPER markets: ${this.cfg.symbols.map(s=>s.replace('-USD','')).join(', ')}. Fresh Strike marks. Leverage 1–${this.cfg.maxLeverage}x; up to ${this.cfg.maxOpen} open positions. Try price BTC.`);
    if(cmd.type==='price')return this.finish(event,`Strike ${cmd.symbol} mark: $${fmt(marks[cmd.symbol].price)}. Updated ${new Date(marks[cmd.symbol].timestamp).toISOString().slice(11,19)} UTC. Try paper long ${cmd.symbol.replace('-USD','')} $100 2x.`);
    if(cmd.type==='history'){const rows=this.db.prepare('SELECT id,side,symbol,pnl FROM positions WHERE user_id=? AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 3').all(a.user_id);return this.finish(event,'PAPER history: '+(rows.length?rows.map(p=>`P${p.id} ${p.side} ${p.symbol.replace('-USD','')} net ${usd(p.pnl)}`).join(' | '):'No closed positions yet. Close your own position with close P1.'))}
    if(cmd.type==='stats'){const rows=this.db.prepare('SELECT pnl FROM positions WHERE user_id=? AND closed_at IS NOT NULL').all(a.user_id);return this.finish(event,`PAPER stats: ${rows.length} closed | ${rows.filter(p=>p.pnl>0).length} wins | net realized ${usd(rows.reduce((n,p)=>n+p.pnl,0))} | ${this.positions(a.user_id).length} open. Simulated fees/slippage included.`)}
    if(cmd.type==='open'){
     const list=this.positions(a.user_id);if(list.length>=this.cfg.maxOpen)throw new UserError(`Maximum ${this.cfg.maxOpen} open positions. Close one first.`);
     const margin=units(cmd.margin),notional=cmd.margin*cmd.leverage,fee=units(notional*this.cfg.feeBps/10000);if(margin+fee>a.balance)throw new UserError('Insufficient virtual balance, including entry fee.');
     const q=marks[cmd.symbol],sign=cmd.side==='long'?1:-1,entry=q.price*(1+sign*this.cfg.slippageBps/10000),quantity=notional/entry;
     const result=this.db.prepare('INSERT INTO positions(user_id,symbol,side,margin,leverage,quantity,entry,entry_fee,opened_at) VALUES(?,?,?,?,?,?,?,?,?)').run(a.user_id,cmd.symbol,cmd.side,margin,cmd.leverage,quantity,entry,fee,Date.now());
     this.db.prepare('UPDATE accounts SET balance=balance-? WHERE user_id=?').run(margin+fee,a.user_id);
     return this.finish(event,`PAPER P${result.lastInsertRowid}: ${cmd.side.toUpperCase()} ${cmd.symbol} | margin ${usd(margin)} | ${cmd.leverage}x (${usd(units(notional))} exposure) | simulated entry $${fmt(entry)} | fee ${usd(fee)}.`);
    }
    if(cmd.type==='close'){
     const p=this.db.prepare('SELECT * FROM positions WHERE id=? AND user_id=? AND closed_at IS NULL').get(Number(cmd.id.slice(1)),a.user_id);if(!p)throw new UserError('Position already closed.');
     const result=this.settle(p,marks[p.symbol].price,'user');return this.finish(event,`PAPER ${cmd.id} closed at $${fmt(result.exit)}. Net trade PnL ${usd(result.pnl-p.entry_fee)} including simulated fees/slippage. Virtual funds ${usd(this.db.prepare('SELECT balance FROM accounts WHERE user_id=?').get(a.user_id).balance)}.`);
    }
    const list=this.positions(a.user_id);let equity=a.balance;for(const p of list)equity+=p.margin+this.quoteClose(p,marks[p.symbol].price).pnl;
    const positions=list.map(p=>`P${p.id} ${p.side} ${p.symbol.replace('-USD','')}`).join('; ');
    return this.finish(event,`PAPER portfolio: est. equity ${usd(equity)} | available ${usd(a.balance)} | ${list.length} open${positions?' — '+positions:''}. Est. exit costs included; funding excluded.`);
   }catch(e){if(e instanceof UserError)return this.finish(event,'PAPER: '+e.message);throw e}
  });
 }
 settle(p,mark,reason){const r=this.quoteClose(p,mark);this.db.prepare('UPDATE accounts SET balance=balance+? WHERE user_id=?').run(p.margin+r.pnl,p.user_id);this.db.prepare('UPDATE positions SET closed_at=?,exit=?,pnl=?,reason=? WHERE id=? AND closed_at IS NULL').run(Date.now(),r.exit,r.pnl-p.entry_fee,reason,p.id);return r}
 async monitor(){const list=this.db.prepare('SELECT * FROM positions WHERE closed_at IS NULL').all();for(const p of list){try{const q=await this.prices.get(p.symbol);if(this.quoteClose(p,q.price).pnl<=-p.margin)transaction(this.db,()=>{const current=this.db.prepare('SELECT * FROM positions WHERE id=? AND closed_at IS NULL').get(p.id);if(current)this.settle(current,q.price,'simulated-margin-exhaustion')})}catch{ /* Never settle against stale/unavailable prices. */ }}}
}
