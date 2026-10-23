import {config} from '../src/config.mjs';import {openStore,enqueue} from '../src/store.mjs';import {Engine} from '../src/engine.mjs';import {Prices} from '../src/prices.mjs';
const cfg=config({BOT_HANDLE:'StrikeAGentt'}),db=openStore(':memory:');
const fixture=process.argv.includes('--fixture');let value=60000;
const prices=fixture?{get:async symbol=>({symbol,price:value,timestamp:Date.now()})}:new Prices(cfg);
const engine=new Engine(db,prices,cfg);
console.log(fixture?'OFFLINE FIXTURE DEMO — invented BTC price, not live.':'LIVE STRIKE DATA / VIRTUAL POSITIONS / NO X POSTS');
for(const [i,text] of ['paper long BTC $100 2x','portfolio','close P1','portfolio'].entries()){
 const event={postId:'demo-'+i,userId:'demo-user',text:'@StrikeAGentt '+text};enqueue(db,event);await engine.process(db.prepare('SELECT * FROM events WHERE post_id=?').get(event.postId));console.log('> '+event.text);console.log(db.prepare('SELECT text FROM replies WHERE post_id=?').get(event.postId).text);if(fixture)value+=1000;
}
db.close();
