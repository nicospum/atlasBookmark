const assert=require('node:assert/strict'),XLSX=require('xlsx'),fs=require('node:fs');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:3107';
async function json(url,options){const r=await fetch(base+url,options);const b=await r.json();assert.ok(r.ok,JSON.stringify(b));return b;}
const post=(body,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function run(){
for(let i=0;i<30;i++){try{await json('/api/status');break;}catch(e){if(i===29)throw e;await new Promise(r=>setTimeout(r,500));}}
const fixture=JSON.stringify({items:[{url:'https://x.com/atlas_test/status/910000000000000001',caption:'Prueba de integración: diseño con Figma y React.',authorName:'Atlas · prueba',authorHandle:'@atlas_test'},{url:'https://www.instagram.com/p/ATLAS_TEST/',caption:'Un libro de fotografía y viajes.',authorName:'Atlas · prueba',authorHandle:'@atlas_test'}]});
async function upload(){const form=new FormData();form.set('file',new File([fixture],'integracion.json',{type:'application/json'}));return json('/api/import',{method:'POST',body:form});}
const first=await upload();assert.equal(first.added,2);assert.equal((await upload()).duplicates,2);
let items=(await json('/api/items')).items;assert.equal(items.length,2);
await json('/api/items',post({ids:[items[0].id],reviewed:true,topics:['Prueba','Diseño']},'PATCH'));
await json('/api/analyze',post({id:items[1].id}));
items=(await json('/api/items')).items;assert.ok(items[0].reviewed);assert.ok(items[1].analyzedAt);
const exp=await json('/api/export',post({sheets:['Resumen','Todos','Por tema','Por fuente'],columns:['Texto completo','Fuente','Temas','URL Original'],ids:items.map(i=>i.id)}));
const response=await fetch(base+'/api/export?id='+exp.id);assert.equal(response.status,200);
const bytes=Buffer.from(await response.arrayBuffer());const wb=XLSX.read(bytes,{type:'buffer'});
assert.equal(wb.SheetNames.length,4);assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Todos).length,2);
assert.equal((await json('/api/export')).history[0].id,exp.id);
const bad=await fetch(base+'/api/items',{...post({ids:[]},'PATCH'),headers:{'Content-Type':'application/json',Origin:'https://evil.example'}});assert.equal(bad.status,400);
const html=await(await fetch(base)).text();assert.ok(html.includes('Atlas de Guardados'));
console.log('INTEGRATION PASS: importación HTTP, deduplicación, edición, análisis, exportación XLSX, historial y protección de origen.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
