import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import worker from '../dist/server/index.js';
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const f of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort())
    db.exec(await readFile('drizzle/' + f, 'utf8'));
const DB = { prepare(sql) { let args = []; const s = { bind(...a) { args = a; return s; }, async first() { return db.prepare(sql).get(...args) || null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { return db.prepare(sql).run(...args); } }; return s; }, async batch(a) { db.exec('BEGIN'); try {
        for (const s of a)
            await s.run();
        db.exec('COMMIT');
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    } } };
const blobs = new Map();
const env = { DB, BUCKET: { async put(k, b, o) { blobs.set(k, { body: b, ...o }); }, async get(k) { return blobs.get(k); }, async delete(k) { blobs.delete(k); } }, ASSETS: { fetch() { return new Response('asset'); } } };
async function call(path = '/api/feed', user = 'alice', body, origin) { const headers = new Headers(); if (user) {
    headers.set('oai-authenticated-user-id', user);
    headers.set('oai-authenticated-user-email', user + '@test.invalid');
} if (origin)
    headers.set('origin', origin); if (body && !(body instanceof FormData))
    headers.set('content-type', 'application/json'); const r = await worker.fetch(new Request('https://orbit.test' + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) }), env); return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() }; }
let r = await call();
assert.equal(r.status, 200);
assert.equal(r.data.posts.length, 3);
const form = new FormData();
form.set('body', 'Persistent test post #qa');
form.set('image', new Blob([await readFile('public/coast.jpg')], { type: 'image/jpeg' }), 'coast.jpg');
r = await call('/api/feed?action=post', 'alice', form);
assert.equal(r.status, 201);
const id = r.data.id;
r = await call('/api/feed');
let post = r.data.posts.find(p => p.id === id);
assert.equal(post.body, 'Persistent test post #qa');
assert.equal((await call('/media/' + post.image)).status, 200);
assert.equal((await call('/api/feed?action=like', null, { post: id, active: true })).status, 401);
assert.equal((await call('/api/feed?action=delete', 'bob', { post: id })).status, 403);
assert.equal((await call('/api/feed?action=like', 'alice', { post: id, active: true }, 'https://evil.test')).status, 403);
for (let i = 0; i < 2; i++)
    assert.equal((await call('/api/feed?action=like', 'bob', { post: id, active: true })).status, 200);
assert.equal((await call()).data.posts.find(p => p.id === id).likes, 1);
assert.equal((await call('/api/feed?action=comment', 'bob', { post: id, body: 'Nice photo!' })).status, 201);
assert.equal((await call('/api/feed?comments=' + id)).data.comments[0].body, 'Nice photo!');
assert.equal((await call('/api/feed?action=follow', 'bob', { target: 'alice', active: true })).status, 200);
assert.equal((await call('/api/feed?following=1', 'bob')).data.posts[0].id, id);
assert.equal((await call('/api/feed?action=profile', 'alice', { name: 'Alice', handle: 'alice_orbit', bio: 'Hello' })).status, 200);
assert.equal((await call('/api/feed?action=profile', 'bob', { name: 'Bob', handle: 'alice_orbit', bio: '' })).status, 409);
const bad = new FormData();
bad.set('body', 'bad image');
bad.set('image', new Blob(['<svg>bad</svg>'], { type: 'image/png' }), 'fake.png');
assert.equal((await call('/api/feed?action=post', 'alice', bad)).status, 400);
const tooLong = new FormData();
tooLong.set('body', 'x'.repeat(501));
assert.equal((await call('/api/feed?action=post', 'alice', tooLong)).status, 400);
assert.equal((await call('/api/feed?action=delete', 'alice', { post: id })).status, 200);
assert.equal(blobs.size, 0);
assert.equal((await call('/api/feed?comments=' + id)).data.comments.length, 0);
console.log('PASS: persistence, photo storage, authentication, ownership, cross-origin protection, idempotent likes, replies, follows, profile uniqueness, input validation, and delete cleanup.');
function photoForm(bytes) { const f = new FormData(); f.set('name', 'Alice'); f.set('handle', 'alice_orbit'); f.set('bio', 'Photo test'); f.set('avatar', new Blob([bytes], { type: 'image/jpeg' }), 'avatar.jpg'); return f; }
const photo = await readFile('public/coast.jpg');
assert.equal((await call('/api/feed?action=profile', null, photoForm(photo))).status, 401);
assert.equal((await call('/api/feed?action=profile', 'alice', photoForm('not an image'))).status, 400);
assert.equal((await call('/api/feed?action=profile', 'alice', photoForm(photo))).status, 200);
const firstAvatar = (await call()).data.me.avatar;
assert.ok(firstAvatar.startsWith('avatars/'));
assert.equal((await call('/media/' + firstAvatar)).status, 200);
assert.equal((await call('/api/feed?author=alice', 'bob')).data.profile.avatar, firstAvatar);
const avatarPost = new FormData();
avatarPost.set('body', 'Avatar on post');
const avatarPostId = (await call('/api/feed?action=post', 'alice', avatarPost)).data.id;
assert.equal((await call()).data.posts.find(p => p.id === avatarPostId).avatar, firstAvatar);
assert.equal((await call('/api/feed?action=profile', 'alice', photoForm(photo))).status, 200);
assert.equal((await call('/media/' + firstAvatar)).status, 404);
assert.equal(blobs.size, 1);
const replacement = (await call()).data.me.avatar;
assert.equal((await call('/api/feed?action=profile', 'alice', { name: 'Alice updated', handle: 'alice_orbit', bio: 'Preserve photo' })).status, 200);
assert.equal((await call()).data.me.avatar, replacement);
console.log('PASS: profile photo upload, validation, authentication, persistence, feed display, replacement cleanup, and preservation during text edits.');
// Saved collections are private and actions are idempotent.
assert.equal((await call('/api/feed?saved=1', null)).status, 401);
assert.equal((await call('/api/feed?activity=1', null)).status, 401);
for (let i = 0; i < 2; i++)
    assert.equal((await call('/api/feed?action=bookmark', 'alice', { post: avatarPostId, active: true })).status, 200);
assert.equal((await call('/api/feed?saved=1', 'alice')).data.posts.length, 1);
assert.equal((await call('/api/feed?saved=1', 'bob')).data.posts.length, 0);
assert.equal((await call('/api/feed?post=' + avatarPostId, 'alice')).data.posts[0].saved, 1);
assert.equal((await call('/api/feed?post=' + avatarPostId, 'bob')).data.posts[0].saved, 0);
assert.equal((await call('/api/feed?action=bookmark', 'bob', { post: 'missing', active: true })).status, 404);
// Each recipient sees only their own activity; repeated likes produce one event.
let oldActivity = (await call('/api/feed?activity=1', 'alice')).data;
await call('/api/feed?action=notifications-read', 'alice', { through: oldActivity.through });
for (let i = 0; i < 2; i++)
    await call('/api/feed?action=like', 'bob', { post: avatarPostId, active: true });
await call('/api/feed?action=comment', 'bob', { post: avatarPostId, body: 'A real conversation' });
let activity = (await call('/api/feed?activity=1', 'alice')).data;
assert.equal(activity.notifications.filter(n => n.post === avatarPostId && n.type === 'like').length, 1);
assert.equal(activity.notifications.filter(n => n.post === avatarPostId && n.type === 'comment').length, 1);
assert.equal(activity.unread, 2);
assert.equal((await call('/api/feed?activity=1', 'bob')).data.notifications.length, 0);
await call('/api/feed?action=notifications-read', 'bob', { through: activity.through });
assert.equal((await call('/api/feed?activity=1', 'alice')).data.unread, 2);
await call('/api/feed?action=notifications-read', 'alice', { through: activity.through });
assert.equal((await call('/api/feed?activity=1', 'alice')).data.unread, 0);
await call('/api/feed?action=like', 'alice', { post: avatarPostId, active: true });
assert.equal((await call('/api/feed?activity=1', 'alice')).data.unread, 0);
await call('/api/feed?action=like', 'bob', { post: avatarPostId, active: false });
assert.equal((await call('/api/feed?activity=1', 'alice')).data.notifications.filter(n => n.post === avatarPostId && n.type === 'like').length, 0);
// Failed notification inserts must roll back their associated action.
db.exec("CREATE TRIGGER reject_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'test notification failure'); END");
const originalError = console.error;
console.error = () => { };
try {
    assert.equal((await call('/api/feed?action=like', 'bob', { post: avatarPostId, active: true })).status, 503);
}
finally {
    console.error = originalError;
    db.exec('DROP TRIGGER reject_notification');
}
assert.equal(db.prepare('SELECT count(*) AS count FROM likes WHERE user=? AND post=?').get('bob', avatarPostId).count, 0);
// Keyset cursor includes the ID, so equal timestamps never drop records.
const sameTime = Date.now() - 5000;
for (let i = 0; i < 35; i++)
    db.prepare('INSERT INTO posts (id,author,body,image,created,sample) VALUES (?,?,?,?,?,0)').run('tie-' + String(i).padStart(3, '0'), 'alice', 'pagination-fixture', '', '' + sameTime);
const page1 = (await call('/api/feed?q=pagination-fixture')).data;
assert.equal(page1.posts.length, 30);
assert.equal(page1.hasMore, true);
const last = page1.posts.at(-1);
const page2 = (await call('/api/feed?q=pagination-fixture&before=' + last.created + '&beforeId=' + last.id)).data;
assert.equal(page2.posts.length, 5);
assert.equal(new Set([...page1.posts, ...page2.posts].map(p => p.id)).size, 35);
await call('/api/feed?action=delete', 'alice', { post: avatarPostId });
assert.equal((await call('/api/feed?saved=1', 'alice')).data.posts.length, 0);
assert.equal((await call('/api/feed?activity=1', 'alice')).data.notifications.filter(n => n.post === avatarPostId).length, 0);
console.log('PASS: private bookmarks, activity isolation, duplicate suppression, self-notification prevention, mark-as-read, transactional rollback, cursor pagination ties, and cascading cleanup.');
// Recommendation ranking remains explainable, bounded, and viewer-specific.
const {rankPosts}=await import('../dist/server/index.js');
const rankingNow=Date.now();
const base={body:'#Photography',likes:0,comments:0,liked:0,saved:0,created:rankingNow,author:'bob'};
let ranked=rankPosts([{...base,id:'fresh'},{...base,id:'followed',author:'creator',created:rankingNow-4*3600000}],{now:rankingNow,followed:new Set(['creator'])});
assert.equal(ranked[0].id,'followed');assert.equal(ranked[0].recommendationReason,'From someone you follow');
ranked=rankPosts([{...base,id:'unrelated',body:'#food'},{...base,id:'matching',created:rankingNow-4*3600000}],{now:rankingNow,interests:new Map([['#photography',2]])});
assert.equal(ranked[0].id,'matching');assert.match(ranked[0].recommendationReason,/#photography/);
ranked=rankPosts([{...base,id:'seen',liked:1},{...base,id:'new'}],{now:rankingNow});assert.equal(ranked[0].id,'new');
assert.ok(rankPosts([{...base,id:'popular',likes:1000000,comments:1000000}],{now:rankingNow})[0].recommendationScore<=12);
for(const [id,body] of [['interest-a','#photography inspiration'],['interest-b','#Photography new picture'],['interest-c','#food new meal']])db.prepare('INSERT INTO posts (id,author,body,image,created,sample) VALUES (?,?,?,?,?,0)').run(id,'bob',body,'',rankingNow);
await call('/api/feed?action=bookmark','alice',{post:'interest-a',active:true});
let recommendations=(await call('/api/feed?recommend=1','alice')).data;
const match=recommendations.posts.find(p=>p.id==='interest-b');const unrelated=recommendations.posts.find(p=>p.id==='interest-c');assert.ok(match.recommendationScore>unrelated.recommendationScore);assert.match(match.recommendationReason,/#photography/);
const cold=(await call('/api/feed?recommend=1','carol')).data;assert.equal(cold.posts.find(p=>p.id==='interest-b').recommendationScore,cold.posts.find(p=>p.id==='interest-c').recommendationScore);
const seenIds=recommendations.posts.map(p=>p.id);const nextRecommendations=(await call('/api/feed?recommend=1&seen='+encodeURIComponent(seenIds.join(',')),'alice')).data;
assert.ok(nextRecommendations.posts.every(p=>!seenIds.includes(p.id)));assert.ok((await call('/api/feed?recommend=1',null)).data.posts.length>0);
assert.ok((await call('/api/feed?recommend=1&following=1','bob')).data.posts.every(p=>p.recommendationScore===undefined));
assert.ok((await call('/api/feed?recommend=1&q=photography','alice')).data.posts.every(p=>p.recommendationScore===undefined));
console.log('PASS: follow and hashtag ranking, engagement caps, discovery penalty, viewer isolation, cold start, nonduplicating load-more, and chronological filter fallback.');
