import {generateSQLiteDrizzleJson,generateSQLiteMigration} from 'drizzle-kit/api';
import * as schema from '../db/schema.ts';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
let journal;try{journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'))}catch{journal={version:'7',dialect:'sqlite',entries:[]}}
const previous=journal.entries.at(-1);const empty=previous?JSON.parse(await readFile('drizzle/meta/'+String(previous.idx).padStart(4,'0')+'_snapshot.json','utf8')):await generateSQLiteDrizzleJson({});
const current=await generateSQLiteDrizzleJson(schema,empty.id);const sql=await generateSQLiteMigration(empty,current);if(!sql.length){console.log('Schema is unchanged.');process.exit(0)}
const idx=journal.entries.length;const prefix=String(idx).padStart(4,'0');const tag=prefix+'_orbit';await mkdir('drizzle/meta',{recursive:true});
await writeFile('drizzle/'+tag+'.sql',sql.join('\n--> statement-breakpoint\n'),{flag:'wx'});await writeFile('drizzle/meta/'+prefix+'_snapshot.json',JSON.stringify(current,null,2),{flag:'wx'});journal.entries.push({idx,version:'6',when:Date.now(),tag,breakpoints:true});await writeFile('drizzle/meta/_journal.json',JSON.stringify(journal,null,2));console.log(sql.join('\n'));
