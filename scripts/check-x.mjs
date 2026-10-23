// Read-only credential check. Does not register subscriptions or post replies.
const token=process.env.X_USER_ACCESS_TOKEN;if(!token)throw Error('Set X_USER_ACCESS_TOKEN in .env first. Do not paste it in chat.');
const r=await fetch('https://api.x.com/2/users/me',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`X credential check returned HTTP ${r.status}`);const j=await r.json();console.log(JSON.stringify({id:j.data?.id,username:j.data?.username},null,2));
