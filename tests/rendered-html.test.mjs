import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
test('new project ships without a client IFC or operational data',async()=>{
 const bundle=JSON.parse(await readFile('public/data/planejamento-ifc.json','utf8'));
 const budget=JSON.parse(await readFile('app/compras/budget-items.json','utf8'));
 assert.equal(bundle.schema_version,1);
 assert.deepEqual(bundle.wbs_rows,[]);
 assert.deepEqual(bundle.elements,[]);
 assert.deepEqual(bundle.sources.ifc_models,[]);
 assert.equal(budget.itemCount,0);
 assert.deepEqual(budget.items,[]);
 const files=await readdir('public',{recursive:true});
 assert.ok(!files.some(path=>path.toLowerCase().endsWith('.ifc')));
 const assets=await readdir('dist/client',{recursive:true});
 assert.ok(!assets.some(path=>path.toLowerCase().endsWith('.ifc')));
});
