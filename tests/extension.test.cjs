const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),{test}=require('node:test');
const script=fs.readFileSync('browser-extension/capture.js','utf8');
async function simulate(platform){
const store={},url=platform==='x'?'https://x.com/alice/status/123':'https://www.instagram.com/p/ABC/';
const link={href:url};
const article=platform==='x'?{querySelector:s=>s==='time'?{dateTime:'2026-01-01T00:00:00Z',closest:()=>link}:s==='[data-testid="User-Name"]'?{innerText:'Alice\n@alice'}:s==='[data-testid="tweetText"]'?{innerText:'Texto original visible'}:null,querySelectorAll:s=>s==='[data-testid="tweetPhoto"] img'?[{src:'https://pbs.twimg.com/a.jpg'}]:[]}:{querySelector:s=>s==='h1'?{innerText:'Caption visible de Instagram'}:s==='header a'?{textContent:'Alice'}:null,querySelectorAll:()=>[]};
const ctx={URL,Date,Set,Promise,Error,console,setTimeout:(f)=>setTimeout(f,0),location:new URL(url),window:{scrollY:100,innerHeight:800,scrollBy:()=>{}},document:{querySelectorAll:s=>platform==='x'&&s==='article[data-testid="tweet"]'?[article]:[],querySelector:()=>article},chrome:{storage:{local:{get:async keys=>typeof keys==='string'?{[keys]:store[keys]}:Object.fromEntries(keys.map(k=>[k,store[k]])),set:async object=>Object.assign(store,object)}}},alert:()=>{throw Error('Unexpected alert')}};
vm.createContext(ctx);vm.runInContext(script,ctx);
for(let i=0;i<100&&ctx.__atlasRunning;i++)await new Promise(r=>setTimeout(r,2));
assert.equal(ctx.__atlasRunning,false);return store['atlas-capture-'+platform];
}
test('extension captures X text and persists a checkpoint',async()=>{const s=await simulate('x');assert.equal(s.count,1);const item=Object.values(s.items)[0];assert.equal(item.caption,'Texto original visible');assert.equal(item.authorHandle,'@alice');assert.equal(item.savedAt,undefined);assert.equal(item.mediaUrls.length,1);});
test('extension captures Instagram individual caption without inventing saved time',async()=>{const s=await simulate('instagram');assert.equal(s.count,1);const item=Object.values(s.items)[0];assert.equal(item.caption,'Caption visible de Instagram');assert.equal(item.sourceUrl,'https://www.instagram.com/p/ABC/');assert.equal(item.savedAt,undefined);});

