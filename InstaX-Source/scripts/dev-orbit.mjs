import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir, unlink, stat, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
await mkdir('work/local-photos', { recursive: true });
const sqlite = new DatabaseSync('work/orbit.sqlite');
sqlite.exec('PRAGMA foreign_keys=ON');
sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
for (const file of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort()) {
    if (!sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(file)) {
        sqlite.exec(await readFile('drizzle/' + file, 'utf8'));
        sqlite.prepare('INSERT INTO local_migrations(name) VALUES (?)').run(file);
    }
}
const DB = { prepare(sql) { let args = []; const statement = { bind(...values) { args = values; return statement; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return { success: true, meta: sqlite.prepare(sql).run(...args) }; } }; return statement; }, async batch(statements) { sqlite.exec('BEGIN'); try {
        const out = [];
        for (const s of statements)
            out.push(await s.run());
        sqlite.exec('COMMIT');
        return out;
    }
    catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
    } } };
const BUCKET = { async put(key, bytes, opts) { const file = 'work/local-photos/' + key.replaceAll('/', '_'); await writeFile(file, bytes); await writeFile(file + '.json', JSON.stringify(opts)); }, async get(key) { try {
        const file = 'work/local-photos/' + key.replaceAll('/', '_');
        return { body: await readFile(file), ...JSON.parse(await readFile(file + '.json', 'utf8')) };
    }
    catch {
        return null;
    } }, async delete(key) { const file = 'work/local-photos/' + key.replaceAll('/', '_'); await unlink(file).catch(() => { }); await unlink(file + '.json').catch(() => { }); } };
const ASSETS = { async fetch(req) { const pathname = decodeURIComponent(new URL(req.url).pathname); const base = resolve('public'); const file = resolve(base, '.' + pathname); if (!file.startsWith(base + '\\') && !file.startsWith(base + '/'))
        return new Response('Not found', { status: 404 }); try {
        const types = { '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
        return new Response(await readFile(file), { headers: { 'Content-Type': types[extname(file)] || 'application/octet-stream' } });
    }
    catch {
        return new Response('Not found', { status: 404 });
    } } };
let worker, modified = 0;
const server = http.createServer(async (req, res) => { try {
    const origin = 'http://127.0.0.1:5173';
    const url = new URL(req.url, origin);
    if (['/signin-with-chatgpt', '/signout-with-chatgpt'].includes(url.pathname)) {
        const signingIn = url.pathname === '/signin-with-chatgpt';
        const dest = url.searchParams.get('return_to') || '/';
        res.writeHead(302, { 'Set-Cookie': `orbit_local=${signingIn ? 'yes' : ''}; HttpOnly; SameSite=Lax; Path=/${signingIn ? '' : '; Max-Age=0'}`, Location: dest.startsWith('/') && !dest.startsWith('//') ? dest : '/' });
        res.end();
        return;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value && !key.startsWith('oai-'))
            headers.set(key, Array.isArray(value) ? value.join(',') : value);
    }
    if (req.headers.cookie?.split(';').some(c => c.trim() === 'orbit_local=yes')) {
        headers.set('oai-authenticated-user-id', 'local-explorer');
        headers.set('oai-authenticated-user-email', 'explorer@local.test');
        headers.set('oai-authenticated-user-full-name', 'You');
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        total += chunk.length;
        if (total > 10 * 1024 * 1024) {
            res.writeHead(413);
            res.end('Too large');
            return;
        }
        chunks.push(chunk);
    }
    const modifiedNow = (await stat('dist/server/index.js')).mtimeMs;
    if (modifiedNow !== modified) {
        worker = (await import('../dist/server/index.js?version=' + modifiedNow)).default;
        modified = modifiedNow;
    }
    const request = new Request(url, { method: req.method, headers, ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: Buffer.concat(chunks), duplex: 'half' }) });
    const response = await worker.fetch(request, { DB, BUCKET, ASSETS });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
}
catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end('Local preview error');
} });
server.listen(5173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:5173/'));
