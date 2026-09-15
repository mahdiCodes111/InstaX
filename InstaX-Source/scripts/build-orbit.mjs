import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
const html=await readFile('src/index.html','utf8');const worker=(await readFile('src/worker.js','utf8')).replace("'__ORBIT_HTML__'",JSON.stringify(html));
await writeFile('dist/server/index.js',worker);await cp('public','dist/client',{recursive:true});await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/.openai/drizzle',{recursive:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'orbit',main:'index.js',compatibility_date:'2026-06-01',assets:{directory:'../client',binding:'ASSETS',run_worker_first:true},d1_databases:[{binding:'DB',database_name:'orbit-local',database_id:'local-orbit',migrations_dir:'../.openai/drizzle'}],r2_buckets:[{binding:'BUCKET',bucket_name:'orbit-photos'}]},null,2));
console.log('Orbit frontend, Worker backend, and database migrations built.');
