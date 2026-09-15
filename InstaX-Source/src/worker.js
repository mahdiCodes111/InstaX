// Build injects the HTML; all identity decisions stay in this server module.
const HTML = '__ORBIT_HTML__';
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
class Problem extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
function database(env) { if (!env.DB)
    throw new Problem('The feed is temporarily unavailable. Please try again.', 503); return env.DB; }
function identity(request) { const id = request.headers.get('oai-authenticated-user-id'); if (!id || !request.headers.get('oai-authenticated-user-email'))
    return null; let name = request.headers.get('oai-authenticated-user-full-name'); if (name && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try {
        name = decodeURIComponent(name);
    }
    catch {
        name = null;
    }
} return { id, name: (name || 'New explorer').slice(0, 50) }; }
async function seed(db) {
    if (await db.prepare("SELECT id FROM profiles WHERE id='sample-jamie'").first())
        return;
    await db.batch([
        db.prepare('INSERT OR IGNORE INTO profiles (id,name,handle,bio,sample) VALUES (?,?,?,?,1)').bind('sample-jamie', 'Jamie Lee', 'jamiecreates', 'Collecting moments, chasing the coast. Sample creator.'),
        db.prepare('INSERT OR IGNORE INTO profiles (id,name,handle,bio,sample) VALUES (?,?,?,?,1)').bind('sample-alex', 'Alex Studio', 'alexstudio', 'Design, little discoveries, and good questions. Sample creator.'),
        db.prepare('INSERT OR IGNORE INTO profiles (id,name,handle,bio,sample) VALUES (?,?,?,?,1)').bind('sample-nora', 'Nora Chen', 'norasees', 'Finding a new angle on the everyday. Sample creator.'),
        db.prepare('INSERT OR IGNORE INTO posts (id,author,body,image,created,sample) VALUES (?,?,?,?,?,1)').bind('sample-coast', 'sample-jamie', 'The best part of getting lost is what you find along the way. Taking the long way home today. 🌊\n\n#EverydayFrames #OutsideMore', '/coast.jpg', 1789387200000),
        db.prepare('INSERT OR IGNORE INTO posts (id,author,body,image,created,sample) VALUES (?,?,?,?,?,1)').bind('sample-thought', 'sample-alex', 'Hot take: your best ideas usually happen after you close your laptop.\n\nWhat’s one thing that helped you reset this week? #CreativeEnergy', '', 1789383600000),
        db.prepare('INSERT OR IGNORE INTO posts (id,author,body,image,created,sample) VALUES (?,?,?,?,?,1)').bind('sample-city', 'sample-nora', 'A reminder to look up every once in a while. There’s a whole other city above eye level. #EverydayFrames', '/city.jpg', 1789380000000)
    ]);
}
async function account(db, user) { if (!user)
    return null; await db.prepare('INSERT OR IGNORE INTO profiles (id,name,handle,bio,sample) VALUES (?,?,?,?,0)').bind(user.id, user.name, 'explorer_' + (await hash(user.id)).slice(0, 12), '').run(); return db.prepare('SELECT * FROM profiles WHERE id=?').bind(user.id).first(); }
async function hash(str) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)))].map(x => x.toString(16).padStart(2, '0')).join(''); }
function text(value, max, label, allowEmpty = false) { if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()))
    throw new Problem(`${label} must be ${allowEmpty ? 'at most' : 'between 1 and'} ${max} characters.`); return value.trim(); }
async function readJSON(req) { const raw = await req.text(); if (raw.length > 10000)
    throw new Problem('That request is too large.', 413); try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error();
    return value;
}
catch {
    throw new Problem('Please send a valid request.');
} }

// Small, explainable heuristic recommender; no machine-learning model or tracking.
function hashtags(body) {
    return [...new Set((body.match(/#[\p{L}\p{N}_]+/gu) || []).map(tag => tag.toLowerCase()))];
}
export function rankPosts(posts, { followed = new Set(), interests = new Map(), now = Date.now(), userId = '' } = {}) {
    return posts.map(post => {
        const ageHours = Math.max(0, (now - post.created) / 3600000);
        const freshness = 8 / (1 + ageHours / 24);
        const engagement = Math.min(4, Math.log2(1 + Number(post.likes) + 2 * Number(post.comments)));
        const followsAuthor = followed.has(post.author);
        const matches = hashtags(post.body).filter(tag => interests.has(tag));
        const affinity = Math.min(6, matches.reduce((sum, tag) => sum + Math.min(2, interests.get(tag)), 0));
        const interacted = Boolean(post.liked || post.saved);
        const score = freshness + engagement + (followsAuthor ? 4 : 0) + affinity - (interacted ? 3 : 0);
        const recommendationReason = post.author === userId ? 'Your post' : matches.length ? 'Based on your interest in ' + matches[0] : followsAuthor ? 'From someone you follow' : engagement >= 2 ? 'Popular in the community' : 'A fresh perspective';
        return { ...post, recommendationScore: Math.round(score * 1000) / 1000, recommendationReason };
    }).sort((a, b) => b.recommendationScore - a.recommendationScore || b.created - a.created || b.id.localeCompare(a.id));
}

async function api(req, env, url) {
    const db = database(env);
    const user = identity(req);
    await seed(db);
    const me = await account(db, user);
    if (req.method === 'GET') {
        const unread = me ? Number((await db.prepare('SELECT count(*) AS count FROM notifications WHERE recipient=? AND read=0').bind(me.id).first()).count) : 0;
        if (url.searchParams.get('activity') === '1') {
            if (!me)
                throw new Problem('Sign in to see your activity.', 401);
            const through = Date.now();
            const result = await db.prepare('SELECT n.*,p.name,p.handle,p.avatar,s.body AS preview FROM notifications n JOIN profiles p ON p.id=n.actor LEFT JOIN posts s ON s.id=n.post WHERE n.recipient=? ORDER BY n.created DESC,n.id DESC LIMIT 100').bind(me.id).all();
            return json({ notifications: result.results, unread, through });
        }
        const selectedPost = (url.searchParams.get('post') || '').slice(0, 100);
        const saved = url.searchParams.get('saved') === '1';
        if (saved && !me)
            throw new Problem('Sign in to see your saved posts.', 401);
        if (url.searchParams.has('comments')) {
            const post = url.searchParams.get('comments');
            const rows = await db.prepare('SELECT c.*,p.name,p.handle FROM comments c JOIN profiles p ON p.id=c.user WHERE c.post=? ORDER BY c.created DESC LIMIT 100').bind(post).all();
            return json({ comments: rows.results.reverse() });
        }
        const q = (url.searchParams.get('q') || '').slice(0, 100);
        const author = url.searchParams.get('author') || '';
        const following = url.searchParams.get('following') === '1';
        const before = Number(url.searchParams.get('before')) || Date.now() + 1000;
        const beforeId = url.searchParams.get('beforeId') || '\uffff';
        let result = await db.prepare(`SELECT p.*,u.name,u.handle,u.avatar,(SELECT count(*) FROM likes l WHERE l.post=p.id) AS likes,(SELECT count(*) FROM comments c WHERE c.post=p.id) AS comments,EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.user=?) AS liked,EXISTS(SELECT 1 FROM bookmarks b WHERE b.post=p.id AND b.user=?) AS saved FROM posts p JOIN profiles u ON u.id=p.author WHERE (p.created<? OR (p.created=? AND p.id<?)) AND (?='' OR p.author=?) AND (?='' OR instr(lower(p.body || ' ' || u.name || ' ' || u.handle),lower(?))>0) AND (?=0 OR EXISTS(SELECT 1 FROM follows f WHERE f.user=? AND f.target=p.author)) AND (?=0 OR EXISTS(SELECT 1 FROM bookmarks b WHERE b.user=? AND b.post=p.id)) AND (?='' OR p.id=?) ORDER BY p.created DESC,p.id DESC LIMIT 31`).bind(me?.id || '', me?.id || '', before, before, beforeId, author, author, q, q, following ? 1 : 0, me?.id || '', saved ? 1 : 0, me?.id || '', selectedPost, selectedPost).all();

        const recommend = url.searchParams.get('recommend') === '1' && !q && !author && !following && !saved && !selectedPost;
        if (recommend) {
            const excluded = (url.searchParams.get('seen') || '').split(',').filter(Boolean);
            if (excluded.length > 200 || excluded.some(id => id.length > 100)) throw new Problem('Refresh the feed to see more recommendations.');
            const seen = new Set(excluded);
            const candidates = await db.prepare('SELECT p.*,u.name,u.handle,u.avatar,(SELECT count(*) FROM likes l WHERE l.post=p.id) AS likes,(SELECT count(*) FROM comments c WHERE c.post=p.id) AS comments,EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.user=?) AS liked,EXISTS(SELECT 1 FROM bookmarks b WHERE b.post=p.id AND b.user=?) AS saved FROM posts p JOIN profiles u ON u.id=p.author ORDER BY p.created DESC,p.id DESC LIMIT 200').bind(me?.id || '', me?.id || '').all();
            const followed = new Set(); const interests = new Map();
            if (me) {
                const follows = await db.prepare('SELECT target FROM follows WHERE user=?').bind(me.id).all();
                for (const row of follows.results) followed.add(row.target);
                const history = await db.prepare('SELECT p.body,EXISTS(SELECT 1 FROM bookmarks b WHERE b.post=p.id AND b.user=?) AS saved FROM posts p WHERE EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.user=?) OR EXISTS(SELECT 1 FROM bookmarks b WHERE b.post=p.id AND b.user=?) ORDER BY p.created DESC,p.id DESC LIMIT 100').bind(me.id,me.id,me.id).all();
                for (const post of history.results) for (const tag of hashtags(post.body)) interests.set(tag,(interests.get(tag)||0)+(post.saved?2:1));
            }
            result = { results: rankPosts(candidates.results, { followed, interests, userId: me?.id || '' }).filter(post => !seen.has(post.id)) };
        }
        const people = await db.prepare('SELECT p.*,EXISTS(SELECT 1 FROM follows f WHERE f.user=? AND f.target=p.id) AS followed,(SELECT count(*) FROM follows f WHERE f.target=p.id) AS followers,(SELECT count(*) FROM follows f WHERE f.user=p.id) AS following FROM profiles p ORDER BY p.sample ASC,p.name LIMIT 50').bind(me?.id || '').all();
        let profile = null;
        if (author)
            profile = await db.prepare('SELECT p.*,EXISTS(SELECT 1 FROM follows f WHERE f.user=? AND f.target=p.id) AS followed,(SELECT count(*) FROM follows f WHERE f.target=p.id) AS followers,(SELECT count(*) FROM follows f WHERE f.user=p.id) AS following FROM profiles p WHERE p.id=?').bind(me?.id || '', author).first();
        return json({ me, unread, posts: result.results.slice(0, 30), hasMore: result.results.length > 30, people: people.results, profile });
    }
    if (req.method !== 'POST')
        throw new Problem('Method not allowed.', 405);
    if (!me)
        throw new Problem('Sign in to join the conversation.', 401);
    const origin = req.headers.get('origin');
    if ((origin && origin !== url.origin) || req.headers.get('sec-fetch-site') === 'cross-site')
        throw new Problem('This request could not be verified.', 403);
    const action = url.searchParams.get('action');
    if (action === 'post') {
        if (Number(req.headers.get('content-length')) > 9 * 1024 * 1024)
            throw new Problem('Photos must be 8 MB or smaller.', 413);
        const raw = await req.arrayBuffer();
        if (raw.byteLength > 9 * 1024 * 1024)
            throw new Problem('Photos must be 8 MB or smaller.', 413);
        const form = await new Request(req.url, { method: 'POST', headers: req.headers, body: raw }).formData();
        const body = text(form.get('body') || '', 500, 'Post', true);
        const file = form.get('image');
        let image = '';
        const id = crypto.randomUUID();
        if (file && typeof file !== 'string' && file.size) {
            if (file.size > 8 * 1024 * 1024)
                throw new Problem('Photos must be 8 MB or smaller.', 413);
            const bytes = new Uint8Array(await file.arrayBuffer());
            let type = '';
            if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
                type = 'image/jpeg';
            if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
                type = 'image/png';
            if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
                type = 'image/webp';
            if (!type)
                throw new Problem('Choose a JPEG, PNG, or WebP photo.');
            if (!env.BUCKET)
                throw new Problem('Photo uploads are temporarily unavailable.', 503);
            image = 'uploads/' + id;
            await env.BUCKET.put(image, bytes, { httpMetadata: { contentType: type } });
        }
        if (!body && !image)
            throw new Problem('Add a thought or photo before posting.');
        try {
            await db.prepare('INSERT INTO posts (id,author,body,image,created,sample) VALUES (?,?,?,?,?,0)').bind(id, me.id, body, image, Date.now()).run();
        }
        catch (e) {
            if (image)
                await env.BUCKET.delete(image);
            throw e;
        }
        return json({ id }, 201);
    }
    if (action === 'profile') {
        let input, photo = null;
        if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
            if (Number(req.headers.get('content-length')) > 9 * 1024 * 1024)
                throw new Problem('Profile photos must be 8 MB or smaller.', 413);
            const raw = await req.arrayBuffer();
            if (raw.byteLength > 9 * 1024 * 1024)
                throw new Problem('Profile photos must be 8 MB or smaller.', 413);
            const form = await new Request(req.url, { method: 'POST', headers: req.headers, body: raw }).formData();
            input = Object.fromEntries(form);
            photo = form.get('avatar');
        }
        else
            input = await readJSON(req);
        const name = text(input.name, 50, 'Name');
        const handle = text(input.handle, 24, 'Handle').toLowerCase();
        const bio = text(input.bio || '', 160, 'Bio', true);
        if (!/^[a-z0-9_]{3,24}$/.test(handle))
            throw new Problem('Use 3–24 letters, numbers, or underscores for your handle.');
        let avatar = me.avatar || '';
        let uploaded = '';
        if (photo && typeof photo !== 'string' && photo.size) {
            if (photo.size > 8 * 1024 * 1024)
                throw new Problem('Profile photos must be 8 MB or smaller.', 413);
            const bytes = new Uint8Array(await photo.arrayBuffer());
            let type = '';
            if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
                type = 'image/jpeg';
            if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10)
                type = 'image/png';
            if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
                type = 'image/webp';
            if (!type)
                throw new Problem('Choose a JPEG, PNG, or WebP profile photo.');
            if (!env.BUCKET)
                throw new Problem('Photo uploads are temporarily unavailable.', 503);
            uploaded = 'avatars/' + crypto.randomUUID();
            await env.BUCKET.put(uploaded, bytes, { httpMetadata: { contentType: type } });
            avatar = uploaded;
        }
        try {
            await db.prepare('UPDATE profiles SET name=?,handle=?,bio=?,avatar=? WHERE id=?').bind(name, handle, bio, avatar, me.id).run();
        }
        catch (e) {
            if (uploaded)
                await env.BUCKET.delete(uploaded);
            if (String(e).includes('UNIQUE'))
                throw new Problem('That handle is taken. Try another.', 409);
            throw e;
        }
        if (uploaded && me.avatar)
            await env.BUCKET.delete(me.avatar).catch(e => console.error('Old avatar cleanup failed', e));
        return json({ ok: true, avatar });
    }
    const input = await readJSON(req);
    if (action === 'notifications-read') {
        if (!Number.isSafeInteger(input.through) || input.through < 0 || input.through > Date.now())
            throw new Problem('Invalid activity timestamp.');
        await db.prepare('UPDATE notifications SET read=1 WHERE recipient=? AND created<=?').bind(me.id, input.through).run();
        return json({ ok: true });
    }
    if (action === 'follow') {
        const target = text(input.target, 200, 'Profile');
        if (target === me.id)
            throw new Problem('You cannot follow yourself.');
        if (!await db.prepare('SELECT id FROM profiles WHERE id=?').bind(target).first())
            throw new Problem('Profile not found.', 404);
        if (typeof input.active !== 'boolean')
            throw new Problem('Choose follow or unfollow.');
        const notificationId = await hash(JSON.stringify(['follow', me.id, target]));
        await db.batch([
            db.prepare(input.active ? 'INSERT OR IGNORE INTO follows (user,target) VALUES (?,?)' : 'DELETE FROM follows WHERE user=? AND target=?').bind(me.id, target),
            input.active ? db.prepare('INSERT OR IGNORE INTO notifications (id,recipient,actor,type,post,created,read) VALUES (?,?,?,?,NULL,?,0)').bind(notificationId, target, me.id, 'follow', Date.now()) : db.prepare('DELETE FROM notifications WHERE id=? AND actor=?').bind(notificationId, me.id)
        ]);
        return json({ ok: true });
    }
    const post = text(input.post, 100, 'Post ID');
    const existing = await db.prepare('SELECT * FROM posts WHERE id=?').bind(post).first();
    if (!existing)
        throw new Problem('This post no longer exists.', 404);
    if (action === 'bookmark') {
        if (typeof input.active !== 'boolean')
            throw new Problem('Choose save or unsave.');
        await (input.active ? db.prepare('INSERT OR IGNORE INTO bookmarks (user,post,created) VALUES (?,?,?)').bind(me.id, post, Date.now()) : db.prepare('DELETE FROM bookmarks WHERE user=? AND post=?').bind(me.id, post)).run();
        return json({ ok: true });
    }
    if (action === 'like') {
        if (typeof input.active !== 'boolean')
            throw new Problem('Choose like or unlike.');
        const statements = [db.prepare(input.active ? 'INSERT OR IGNORE INTO likes (user,post) VALUES (?,?)' : 'DELETE FROM likes WHERE user=? AND post=?').bind(me.id, post)];
        if (existing.author !== me.id) {
            const notificationId = await hash(JSON.stringify(['like', me.id, post]));
            statements.push(input.active ? db.prepare('INSERT OR IGNORE INTO notifications (id,recipient,actor,type,post,created,read) VALUES (?,?,?,?,?,?,0)').bind(notificationId, existing.author, me.id, 'like', post, Date.now()) : db.prepare('DELETE FROM notifications WHERE id=? AND actor=?').bind(notificationId, me.id));
        }
        await db.batch(statements);
        return json({ ok: true });
    }
    if (action === 'comment') {
        const body = text(input.body, 500, 'Reply');
        const id = crypto.randomUUID();
        const now = Date.now();
        const statements = [db.prepare('INSERT INTO comments (id,user,post,body,created) VALUES (?,?,?,?,?)').bind(id, me.id, post, body, now)];
        if (existing.author !== me.id)
            statements.push(db.prepare('INSERT INTO notifications (id,recipient,actor,type,post,created,read) VALUES (?,?,?,?,?,?,0)').bind(id, existing.author, me.id, 'comment', post, now));
        await db.batch(statements);
        return json({ id }, 201);
    }
    if (action === 'delete') {
        if (existing.author !== me.id)
            throw new Problem('You can only delete your own posts.', 403);
        await db.prepare('DELETE FROM posts WHERE id=? AND author=?').bind(post, me.id).run();
        if (existing.image.startsWith('uploads/'))
            await env.BUCKET.delete(existing.image);
        return json({ ok: true });
    }
    throw new Problem('Unknown action.', 404);
}
export default { async fetch(request, env) {
        const url = new URL(request.url);
        try {
            if (url.pathname === '/api/feed')
                return await api(request, env, url);
            if (url.pathname.startsWith('/media/')) {
                const key = url.pathname.slice(7);
                if (!/^(uploads|avatars)\/[a-f0-9-]{36}$/.test(key))
                    return new Response('Not found', { status: 404 });
                if (!await database(env).prepare(key.startsWith('avatars/') ? 'SELECT id FROM profiles WHERE avatar=?' : 'SELECT id FROM posts WHERE image=?').bind(key).first())
                    return new Response('Not found', { status: 404 });
                const object = await env.BUCKET.get(key);
                if (!object)
                    return new Response('Not found', { status: 404 });
                return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private,max-age=3600' } });
            }
            if (url.pathname === '/' || url.pathname === '/explore' || url.pathname === '/saved' || url.pathname === '/activity' || url.pathname.startsWith('/profile'))
                return new Response(HTML, { headers: { 'Content-Type': 'text/html;charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" } });
            return env.ASSETS.fetch(request);
        }
        catch (error) {
            if (!(error instanceof Problem))
                console.error('Orbit request failed', error);
            return json({ error: error instanceof Problem ? error.message : 'Something went wrong. Your changes were not confirmed. Please try again.' }, error instanceof Problem ? error.status : 503);
        }
    } };
