import test from 'node:test';import assert from 'node:assert/strict';import {createApp} from '../src/server.mjs';import {openStore} from '../src/store.mjs';import {config} from '../src/config.mjs';import {digest} from '../src/x.mjs';
test('HTTP integration: CRC, signature, durable queue, draft, duplicate, operator auth',async()=>{
 const cfg=config({PORT:'0',BOT_HANDLE:'StrikePractice',BOT_USER_ID:'99',X_CLIENT_SECRET:'fixture-secret',ADMIN_TOKEN:'a'.repeat(32)});const prices={values:new Map(),get:async symbol=>({symbol,price:60000,timestamp:Date.now()}),refresh:async()=>{}};let posts=0;
 const app=createApp(cfg,{db:openStore(':memory:'),prices,publisher:async()=>{posts++;return '456'}});const addr=await app.start();const root='http://127.0.0.1:'+addr.port;
 try{
  let r=await fetch(root+'/webhooks/x?crc_token=challenge');assert.equal((await r.json()).response_token,digest('challenge','fixture-secret'));
  const body=JSON.stringify({data:{event_type:'post.mention.create',event_uuid:'evt',filter:{user_id:'99'},payload:{id:'123',author_id:'42',text:'@StrikePractice paper long BTC $100 2x',entities:{mentions:[{id:'99'}]}}}});
  r=await fetch(root+'/webhooks/x',{method:'POST',body});assert.equal(r.status,401);
  const headers={'Content-Type':'application/json','X-Twitter-Webhooks-Signature-OAuth2':digest(body,cfg.clientSecret)};
  r=await fetch(root+'/webhooks/x',{method:'POST',headers,body});assert.equal((await r.json()).accepted,true);await app.work();
  r=await fetch(root+'/webhooks/x',{method:'POST',headers,body});assert.equal((await r.json()).duplicate,true);
  r=await fetch(root+'/admin/state');assert.equal(r.status,401);
  r=await fetch(root+'/admin/state',{headers:{Authorization:'Bearer '+cfg.adminToken}});const s=await r.json();assert.equal(s.positions.length,1);assert.equal(s.replies[0].status,'draft');assert.equal(posts,0);
 }finally{await app.stop()}
});
