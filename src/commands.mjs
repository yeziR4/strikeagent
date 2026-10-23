export const HELP='PAPER commands: paper long BTC $100 2x | paper short ETH $50 1x | portfolio | close P1 | price BTC | markets | history | stats. $ = virtual margin.';
export function parseCommand(text,handle){
 if(typeof text!=='string'||text.length>500)throw Error('Use a short paper-trading command.');
 const mention=new RegExp(`^\\s*@${handle}\\b\\s*`,'i');if(!mention.test(text))throw Error(`Start with @${handle}.`);
 const s=text.replace(mention,'').trim();
 if(/^help$/i.test(s))return {type:'help'};
 if(/^(markets|history|stats)$/i.test(s))return {type:s.toLowerCase()};
 const price=s.match(/^price\s+([A-Z]{2,12})(?:-USD)?$/i);if(price)return {type:'price',symbol:price[1].toUpperCase()+'-USD'};
 if(/^(portfolio|positions|balance)$/i.test(s))return {type:'portfolio'};
 let m=s.match(/^close\s+(P[1-9]\d{0,8})$/i);if(m)return {type:'close',id:m[1].toUpperCase()};
 m=s.match(/^paper\s+(long|short)\s+([A-Z]{2,12})(?:-USD)?\s+\$?(\d{1,6}(?:\.\d{1,2})?)\s+([1-5])x$/i);
 if(m){const margin=Number(m[3]);if(margin<1||margin>10000)throw Error('Virtual margin must be $1–$10,000.');return {type:'open',side:m[1].toLowerCase(),symbol:m[2].toUpperCase()+'-USD',margin,leverage:Number(m[4])}}
 throw Error(HELP);
}
