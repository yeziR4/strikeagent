export class Prices {
 constructor(cfg,fetcher=fetch){this.cfg=cfg;this.fetcher=fetcher;this.values=new Map();this.inFlight=null;this.lastError=null}
 async refresh(){if(this.inFlight)return this.inFlight;this.inFlight=this.load();try{return await this.inFlight}finally{this.inFlight=null}}
 async load(){try{
  const r=await this.fetcher(this.cfg.base+'/price/v2/markPrice',{headers:{'User-Agent':'StrikePaperLab/0.1'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error(`Strike HTTP ${r.status}`);
  const raw=await r.json(),rows=Array.isArray(raw)?raw:Array.isArray(raw.data)?raw.data:[raw];let accepted=0;
  for(const v of rows){if(!this.cfg.symbols.includes(v.s))continue;const price=Number(v.p),timestamp=Number(v.E);if(!Number.isFinite(price)||price<=0||!Number.isFinite(timestamp)||Math.abs(Date.now()-timestamp)>this.cfg.priceMaxAge)continue;this.values.set(v.s,{symbol:v.s,price,timestamp});accepted++}
  if(!accepted)throw Error('Strike returned no fresh supported marks');this.lastError=null;
 }catch(e){this.lastError=e.message;throw e}}
 async get(symbol){if(!this.cfg.symbols.includes(symbol))throw Error('Unsupported market. Use '+this.cfg.symbols.map(s=>s.replace('-USD','')).join(', ')+'.');let p=this.values.get(symbol);if(!p||Date.now()-p.timestamp>2000){await this.refresh();p=this.values.get(symbol)}if(!p||Date.now()-p.timestamp>this.cfg.priceMaxAge)throw Error('Fresh Strike price unavailable. No paper trade executed.');return p}
}
