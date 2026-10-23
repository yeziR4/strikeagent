import http from 'node:http';import {pathToFileURL} from 'node:url';import {timingSafeEqual} from 'node:crypto';
import {DemoBudget} from './budget.mjs';
import {config} from './config.mjs';import {openStore,enqueue} from './store.mjs';import {Engine} from './engine.mjs';import {Prices} from './prices.mjs';import {digest,normalizeMention,verifySignature,publishReply} from './x.mjs';
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
export function createApp(cfg,{db=openStore(cfg.dbPath),prices=new Prices(cfg),publisher=publishReply}={}){
 const engine=new Engine(db,prices,cfg),budget=new DemoBudget(db);let running=false,timer;
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))};
 const admin=req=>cfg.adminToken.length>=32&&equal(req.headers.authorization||'','Bearer '+cfg.adminToken);
 async function work(){if(running)return;running=true;try{
  for(const e of db.prepare("SELECT * FROM events WHERE status='pending' ORDER BY received_at, rowid LIMIT 20").all()){
   db.prepare("UPDATE events SET status='processing',attempts=attempts+1 WHERE post_id=?").run(e.post_id);
   try{await engine.process(e)}catch(err){db.prepare("UPDATE events SET status='failed',error=? WHERE post_id=?").run('Internal processing error; inspect server',e.post_id);console.error('event processing failed',e.post_id,err.message)}
  }
  await engine.monitor();
  if(cfg.replyMode==='live'&&!await budget.allow())return;
  if(cfg.replyMode==='live')for(const r of db.prepare("SELECT * FROM replies WHERE status='draft' ORDER BY id LIMIT 10").all()){
   if(!await budget.allow(true))break;
   // A timeout can mean X accepted the post. Never retry an uncertain send automatically.
   db.prepare("UPDATE replies SET status='sending' WHERE id=?").run(r.id);
   try{const id=await publisher({...r,text:Array.from(r.text).slice(0,275).join('')},cfg.userToken);db.prepare("UPDATE replies SET status='sent',x_post_id=? WHERE id=?").run(id,r.id)}catch{db.prepare("UPDATE replies SET status='uncertain',error='Inspect X before retrying this reply' WHERE id=?").run(r.id)}
  }
 }finally{running=false}}
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{service:'Strike X Paper',mode:'paper',replyMode:cfg.replyMode,xConfigured:!!cfg.botUserId&&!!(cfg.clientSecret||cfg.consumerSecret),freshMarkets:[...prices.values?.values()||[]].filter(v=>Date.now()-v.timestamp<cfg.priceMaxAge).map(v=>v.symbol),priceError:prices.lastError||null});
  if(req.method==='GET'&&url.pathname==='/webhooks/x'){
   const token=url.searchParams.get('crc_token'),secret=cfg.clientSecret||cfg.consumerSecret;if(!secret)return json(res,503,{error:'Webhook secret not configured'});if(!token||token.length>2048)return json(res,400,{error:'Missing CRC token'});console.info('X webhook CRC answered');return json(res,200,{response_token:digest(token,secret)})
  }
  const isWebhook=req.method==='POST'&&url.pathname==='/webhooks/x';const isDemo=req.method==='POST'&&url.pathname==='/admin/mentions';
  if(url.pathname.startsWith('/admin/')&&!admin(req))return json(res,401,{error:'Operator authorization required'});
  if(req.method==='GET'&&url.pathname==='/admin/state')return json(res,200,{events:db.prepare('SELECT * FROM events ORDER BY received_at DESC LIMIT 30').all(),replies:db.prepare('SELECT * FROM replies ORDER BY id DESC LIMIT 30').all(),positions:db.prepare('SELECT * FROM positions ORDER BY id DESC LIMIT 30').all()});
  if(!isWebhook&&!isDemo)return json(res,404,{error:'Use /health or /webhooks/x'});
  let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>262144){json(res,413,{error:'Payload too large'});req.destroy();return}chunks.push(chunk)}const raw=Buffer.concat(chunks);
  if(isWebhook&&!verifySignature(raw,req.headers,cfg))return json(res,401,{error:'Invalid webhook signature'});
  let payload;try{payload=JSON.parse(raw.toString())}catch{return json(res,400,{error:'Invalid JSON'})}
  let event;if(isDemo){if(!/^[A-Za-z0-9_-]{1,60}$/.test(payload.postId||'')||!/^[A-Za-z0-9_-]{1,60}$/.test(payload.userId||'')||typeof payload.text!=='string'||payload.text.length>500)return json(res,400,{error:'Expected postId, userId, text'});event=payload}else{
   if(!cfg.botUserId)return json(res,503,{error:'BOT_USER_ID not configured'});try{event=normalizeMention(payload,cfg)}catch{return json(res,400,{error:'Invalid mention payload'})}
  }
  if(!event)return json(res,200,{ignored:true});
  if(db.prepare('SELECT 1 FROM events WHERE post_id=?').get(event.postId))return json(res,200,{duplicate:true});
  if(db.prepare('SELECT COUNT(*) AS n FROM events WHERE user_id=? AND received_at>?').get(event.userId,Date.now()-60000).n>=20)return json(res,429,{error:'User rate limit'});
  const added=enqueue(db,event);json(res,200,{accepted:added,postId:event.postId});setImmediate(()=>work().catch(e=>console.error('worker error',e.message)));
 }catch{if(!res.headersSent)json(res,500,{error:'Internal error'})}});
 server.requestTimeout=15000;server.headersTimeout=10000;
 async function start(){await prices.refresh().catch(()=>{});timer=setInterval(()=>{prices.refresh().then(()=>work()).catch(()=>work()).catch(e=>console.error('worker error',e.message))},cfg.pollMs);await new Promise(resolve=>server.listen(cfg.port,cfg.host,resolve));console.log(`Strike X Paper: http://${cfg.host}:${server.address().port} | replies=${cfg.replyMode} | paper only`);await work();return server.address()}
 async function stop(){clearInterval(timer);await new Promise(resolve=>server.close(resolve));while(running)await new Promise(resolve=>setTimeout(resolve,10));db.close()}
 return {server,db,engine,work,start,stop};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const app=createApp(config());await app.start();for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>app.stop().then(()=>process.exit(0)))}
