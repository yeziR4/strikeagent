// Demo guard: count uncertain sends as spent; stop delivery as well as posting.
export class DemoBudget {
 constructor(db,env=process.env,fetcher=fetch){this.db=db;this.env=env;this.fetcher=fetcher;this.paused=false;this.reason=null;db.exec('CREATE TABLE IF NOT EXISTS runtime(key TEXT PRIMARY KEY,value TEXT NOT NULL)')}
 async pause(reason){this.paused=true;this.reason=reason;const id=this.env.X_MENTION_SUBSCRIPTION_ID;if(id&&this.env.X_APP_BEARER_TOKEN){const r=await this.fetcher('https://api.x.com/2/activity/subscriptions/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+this.env.X_APP_BEARER_TOKEN},signal:AbortSignal.timeout(10000)});if(!r.ok&&r.status!==404)throw Error('Could not pause X subscription: '+r.status)}console.info('Demo paused:',reason);return false}
 async allow(force=false){
  if(this.paused)return false;
  const max=Number(this.env.X_MAX_REPLY_ATTEMPTS||19),attempts=this.db.prepare("SELECT COUNT(*) n FROM replies WHERE status IN ('sent','sending','uncertain')").get().n;
  if(attempts>=max)return this.pause('reply attempt limit reached');
  if(!this.env.X_DEMO_BUDGET_USD)return true;
  if(!force&&Date.now()-(this.checkedAt||0)<60000)return true;
  const r=await this.fetcher('https://api.x.com/2/usage/credits',{headers:{Authorization:'Bearer '+this.env.X_APP_BEARER_TOKEN},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Budget check failed: '+r.status);
  const balance=Number((await r.json()).data?.total_balance);if(!Number.isFinite(balance))throw Error('Invalid credit balance');
  this.db.prepare('INSERT OR IGNORE INTO runtime VALUES(?,?)').run('demo_start_balance',String(balance));
  const baseline=Number(this.db.prepare('SELECT value FROM runtime WHERE key=?').get('demo_start_balance').value),budget=Number(this.env.X_DEMO_BUDGET_USD);
  if(!(budget>0))throw Error('Invalid demo budget');
  if(balance<=Math.max(1,baseline-budget)+0.4)return this.pause('credit reserve reached');
  this.checkedAt=Date.now();
  return true;
 }
}
