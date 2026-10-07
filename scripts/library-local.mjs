import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const hosting=JSON.parse(await readFile('.openai/hosting.json','utf8'));
await mkdir('.sites-runtime',{recursive:true});
await writeFile('.sites-runtime/library-local.json',JSON.stringify({name:'v2m-local-migrations',compatibility_date:'2026-10-07',d1_databases:[{binding:hosting.d1,database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:'../drizzle'}]}));
const args=['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','site-creator-d1','--local','--config','.sites-runtime/library-local.json','--persist-to',resolve('.wrangler/state')];
const result=spawnSync(process.execPath,args,{stdio:'inherit'});process.exitCode=result.status??1;
