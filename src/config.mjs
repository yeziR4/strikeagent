export function config(env=process.env){
 const num=(key,fallback,min,max)=>{const n=Number(env[key]??fallback);if(!Number.isFinite(n)||n<min||n>max)throw Error(`Invalid ${key}`);return n};
 const replyMode=env.X_REPLY_MODE||'draft';if(!['draft','live'].includes(replyMode))throw Error('X_REPLY_MODE must be draft or live');
 if(replyMode==='live'&&(!env.X_USER_ACCESS_TOKEN||env.X_AUTOMATION_APPROVED!=='true'))throw Error('Live replies require X_USER_ACCESS_TOKEN and X_AUTOMATION_APPROVED=true');
 const botHandle=env.BOT_HANDLE||'StrikeAGentt';if(!/^[A-Za-z0-9_]{1,15}$/.test(botHandle))throw Error('Invalid BOT_HANDLE');
 return {port:num('PORT',4180,0,65535),host:env.HOST||'127.0.0.1',dbPath:env.DB_PATH||'./data/paper.sqlite',botHandle,botUserId:env.BOT_USER_ID||'',clientSecret:env.X_CLIENT_SECRET||'',consumerSecret:env.X_CONSUMER_SECRET||'',userToken:env.X_USER_ACCESS_TOKEN||'',adminToken:env.ADMIN_TOKEN||'',replyMode,base:env.STRIKE_BASE_URL||'https://api.strikefinance.org',symbols:(env.SYMBOLS||'BTC-USD,ETH-USD,SOL-USD,ADA-USD').split(','),startingBalance:num('STARTING_BALANCE',10000,1,1000000),feeBps:num('FEE_BPS',5,0,100),slippageBps:num('SLIPPAGE_BPS',5,0,100),maxLeverage:num('MAX_LEVERAGE',5,1,5),maxOpen:num('MAX_OPEN_POSITIONS',5,1,20),priceMaxAge:num('PRICE_MAX_AGE_MS',15000,1000,60000),pollMs:num('POLL_MS',5000,2000,60000)};
}
