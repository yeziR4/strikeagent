import {createHmac,timingSafeEqual} from 'node:crypto';
export const digest=(body,secret)=>'sha256='+createHmac('sha256',secret).update(body).digest('base64');
export function verifySignature(raw,headers,cfg){
 const modern=headers['x-twitter-webhooks-signature-oauth2'];const legacy=headers['x-twitter-webhooks-signature'];
 const secret=modern?cfg.clientSecret:cfg.consumerSecret;const received=modern||legacy;
 if(!secret||typeof received!=='string')return false;
 const expected=Buffer.from(digest(raw,secret)),actual=Buffer.from(received);return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function normalizeMention(body,cfg){
 const e=body?.data;if(e?.event_type!=='post.mention.create')return null;
 if(!cfg.botUserId)throw Error('BOT_USER_ID is required for X delivery');
 if(e.filter?.user_id!==cfg.botUserId)return null;
 const p=e.payload;
 if(!p||typeof p.id!=='string'||!/^\d{1,30}$/.test(p.id)||typeof p.author_id!=='string'||!/^\d{1,30}$/.test(p.author_id)||typeof p.text!=='string')throw Error('Invalid mention payload');
 if(p.author_id===cfg.botUserId)return null;
 if(!p.entities?.mentions?.some(m=>m.id===cfg.botUserId))return null;
 // Use only the author's own text; never quoted/replied-to posts as commands.
 return {postId:p.id,userId:p.author_id,text:p.text,receivedAt:Date.now(),eventId:e.event_uuid};
}
export async function publishReply(reply,token,fetcher=fetch){
 const r=await fetcher('https://api.x.com/2/tweets',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({text:reply.text,reply:{in_reply_to_tweet_id:reply.post_id}}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error(`X reply returned HTTP ${r.status}; inspect before retrying`);
 const result=await r.json();if(!result.data?.id)throw Error('X reply outcome unknown');return result.data.id;
}
