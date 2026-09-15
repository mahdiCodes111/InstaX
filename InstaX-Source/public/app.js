const paths = { bookmark: '<path d="M6 3h12v19l-6-4-6 4Z"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>', orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-40 12 12)"/>', home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z"/>', explore: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>', photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>', heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>', comment: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5A9 9 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0Z"/>', arrow: '<path d="M7 17 17 7M7 7h10v10"/>', search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>', plus: '<path d="M12 4v16M4 12h16"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>' };
const icon = (name) => `<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avatarContent = p => p?.avatar ? `<img src="/media/${esc(p.avatar)}" alt="${esc(p.name)}’s profile photo">` : initials(p?.name || 'You');
const initials = name => esc((name || 'You').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase());
const state = { unread: 0, notifications: [], through: 0, focusPost: '', me: null, posts: [], people: [], profile: null, view: 'Home', tab: 'For you', q: '', author: '', draft: '', file: null, preview: '', busy: false, error: '', hasMore: false, loaded: false };
const comments = new Map();
let requestNumber = 0;
function route() { const u = new URL(location.href); state.view = u.pathname.startsWith('/profile') ? 'Profile' : u.pathname === '/explore' ? 'Explore' : u.pathname === '/saved' ? 'Saved' : u.pathname === '/activity' ? 'Activity' : 'Home'; state.focusPost = u.searchParams.get('post') || ''; state.author = u.searchParams.get('user') || ''; state.q = u.searchParams.get('q') || ''; state.tab = u.searchParams.get('following') === '1' ? 'Following' : 'For you'; }
function navigate(view, author = '', q = '', focusPost = '') { state.focusPost = focusPost; state.posts = []; state.loaded = false; state.view = view; state.author = author; state.q = q; state.tab = 'For you'; const p = new URLSearchParams(); if (author)
    p.set('user', author); if (q)
    p.set('q', q); if (focusPost)
    p.set('post', focusPost); history.pushState({}, '', (view === 'Home' ? '/' : view === 'Explore' ? '/explore' : view === 'Saved' ? '/saved' : view === 'Activity' ? '/activity' : '/profile') + (p.size ? '?' + p : '')); render(); window.scrollTo(0, 0); return load(); }
async function api(action, payload) { const response = await fetch('/api/feed?action=' + action, { method: 'POST', headers: payload instanceof FormData ? {} : { 'Content-Type': 'application/json' }, body: payload instanceof FormData ? payload : JSON.stringify(payload) }); const data = await response.json(); if (!response.ok)
    throw Error(data.error || 'Please try again.'); return data; }
function showError(message) { state.error = message; const e = document.querySelector('#error'); if (e) {
    e.hidden = false;
    e.textContent = message;
} }
async function load(more = false) {
    const n = ++requestNumber;
    const p = new URLSearchParams();
    if (state.q)
        p.set('q', state.q);
    if (state.focusPost)
        p.set('post', state.focusPost);
    if (state.view === 'Saved')
        p.set('saved', '1');
    if (state.view === 'Profile')
        p.set('author', state.author || state.me?.id || '__me__');
    if (state.tab === 'Following')
        p.set('following', '1');
    const recommended = state.view === 'Home' && state.tab === 'For you' && !state.focusPost && !state.q;
    if (recommended) { p.set('recommend', '1'); if (more) p.set('seen',state.posts.map(post=>post.id).join(',')); }
    if (more && state.posts.length && !recommended) {
        p.set('before', state.posts.at(-1).created);
        p.set('beforeId', state.posts.at(-1).id);
    }
    try {
        const r = await fetch('/api/feed?' + p);
        const d = await r.json();
        if (!r.ok)
            throw Error(d.error);
        if (n !== requestNumber)
            return;
        state.me = d.me;
        state.unread = d.unread || 0;
        state.people = d.people;
        if (state.view === 'Activity' && state.me) {
            const ar = await fetch('/api/feed?activity=1');
            const activity = await ar.json();
            if (!ar.ok)
                throw Error(activity.error);
            if (n !== requestNumber)
                return;
            state.notifications = activity.notifications;
            state.unread = activity.unread;
            state.through = activity.through;
        }
        state.profile = d.profile;
        state.posts = more ? [...state.posts, ...d.posts] : d.posts;
        state.hasMore = d.hasMore;
        state.loaded = true;
        state.error = '';
        if (state.view === 'Profile' && !state.author && d.me && p.get('author') === '__me__') {
            state.author = d.me.id;
            return load();
        }
        render();
    }
    catch (e) {
        if (n !== requestNumber)
            return;
        state.loaded = true;
        showError(e.message);
    }
}
function profileButton(p) { return `<button class="person-button" data-action="profile" data-id="${esc(p.author || p.id)}"><b>${esc(p.name)}</b><p>@${esc(p.handle)}${p.sample ? ' · Sample' : ''}</p></button>`; }
function postCard(p) { const image = p.image?.startsWith('uploads/') ? '/media/' + p.image : p.image; const reply = comments.get(p.id); return `<article class="post" id="post-${esc(p.id)}"><div class="post-head"><button class="avatar ${p.author === 'sample-alex' ? 'orange' : ''}" data-action="profile" data-id="${esc(p.author)}" aria-label="View ${esc(p.name)}’s profile">${avatarContent(p)}</button><div>${profileButton(p)}</div><span class="tag">${p.sample ? 'Sample post' : new Date(p.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>${p.recommendationReason ? `<p class="recommendation-reason">${esc(p.recommendationReason)}</p>` : ''}${p.body ? `<p>${esc(p.body)}</p>` : ''}${image ? `<img class="post-image" src="${esc(image)}" alt="${p.id === 'sample-coast' ? 'Turquoise ocean waves along a rocky coastline' : p.id === 'sample-city' ? 'Looking up between blue glass skyscrapers' : 'Photo shared by ' + esc(p.name)}" loading="lazy">` : ''}${p.id === 'sample-coast' ? '<a class="photo-credit" href="https://unsplash.com/photos/OXf5OUvpOnI" target="_blank" rel="noreferrer">Photo: Erik Mclean / Unsplash</a>' : p.id === 'sample-city' ? '<a class="photo-credit" href="https://unsplash.com/photos/trZOl9WiZ_Y" target="_blank" rel="noreferrer">Photo: Mathias Reding / Unsplash</a>' : ''}<div class="post-actions"><button data-action="like" data-id="${esc(p.id)}" aria-label="${p.liked ? 'Unlike' : 'Like'} post" aria-pressed="${!!p.liked}" class="${p.liked ? 'liked' : ''}">${icon('heart')} ${p.likes}</button><button data-action="comments" data-id="${esc(p.id)}" aria-label="View replies" aria-expanded="${!!reply}">${icon('comment')} ${p.comments}</button><button data-action="bookmark" data-id="${esc(p.id)}" class="bookmark-button ${p.saved ? 'saved' : ''}" aria-label="${p.saved ? 'Unsave' : 'Save'} post" aria-pressed="${!!p.saved}">${icon('bookmark')}</button>${state.me?.id === p.author ? `<button class="remove" data-action="delete" data-id="${esc(p.id)}" aria-label="Delete your post">${icon('trash')}</button>` : ''}</div>${reply ? `<section class="replies" aria-label="Replies">${reply.map(c => `<div class="comment"><b>${esc(c.name)} · @${esc(c.handle)}</b>${esc(c.body)}</div>`).join('') || '<p class="sample">Start the conversation.</p>'}${state.me ? `<form class="reply" data-post="${esc(p.id)}"><input name="body" maxlength="500" placeholder="Write a reply…" aria-label="Reply" required><button class="primary">Reply</button></form>` : '<a class="signin-link" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in to reply ↗</a>'}</section>` : ''}</article>`; }
function composer() { return `<section class="composer"><div class="avatar mine">${avatarContent(state.me)}</div><form id="composer" class="compose-body"><textarea id="draft" name="body" maxlength="500" aria-label="Write a post" placeholder="A thought, a moment, a little of both.">${esc(state.draft)}</textarea>${state.preview ? `<div class="attachment"><img class="preview-image" src="${esc(state.preview)}" alt="Your attached photo"><button type="button" data-action="remove-photo" class="mini-button">Remove photo</button></div>` : ''}<input type="file" id="photo" accept="image/jpeg,image/png,image/webp" hidden><div class="compose-actions"><button type="button" class="quiet" data-action="photo">${icon('photo')} Photo</button><span class="sample" id="count">${state.draft.length}/500</span><button class="primary" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Posting…' : 'Post'} ${icon('arrow')}</button></div>${!state.me && state.loaded ? '<a class="signin-link" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in with ChatGPT to post ↗</a>' : ''}</form></section>`; }
function profilePanel() { const p = state.profile; if (!p)
    return `<section class="empty">${state.loaded ? 'This profile is unavailable.' : 'Loading your profile…'}${!state.me ? '<p><a class="signin-link" href="/signin-with-chatgpt?return_to=/profile" target="_top">Sign in with ChatGPT ↗</a></p>' : ''}</section>`; return `<section class="profile-head"><div class="avatar">${avatarContent(p)}</div><h2>${esc(p.name)}</h2><span>@${esc(p.handle)}${p.sample ? ' · Sample creator' : ''}</span><p>${esc(p.bio) || 'A new perspective in the making.'}</p><p><b>${p.followers}</b> followers &nbsp; <b>${p.following}</b> following</p>${p.id === state.me?.id ? '<button class="mini-button" data-action="edit-profile">Edit profile</button>' : `<button class="primary" data-action="follow" data-id="${esc(p.id)}" data-active="${!p.followed}">${p.followed ? 'Following' : 'Follow'}</button>`}</section>`; }
function activityPanel() {
    if (!state.me)
        return '<section class="empty">Sign in to see likes, replies, and new followers.<a class="signin-link" href="/signin-with-chatgpt?return_to=/activity" target="_top">Sign in ↗</a></section>';
    return `<section class="activity-panel"><div class="activity-toolbar"><div><h2>Your conversations, continued.</h2><p>Recent likes, replies, and new followers.</p></div><button class="mini-button" data-action="refresh">Refresh</button></div>${state.unread ? '<button class="mini-button mark-read" data-action="read-activity">Mark all as read</button>' : ''}${state.notifications.length ? state.notifications.map(n => `<article class="activity-item ${n.read ? '' : 'unread'}"><button class="avatar" data-action="profile" data-id="${esc(n.actor)}" aria-label="View ${esc(n.name)}’s profile">${avatarContent(n)}</button><div><button class="person-button" data-action="profile" data-id="${esc(n.actor)}"><b>${esc(n.name)}</b></button><p>${n.type === 'like' ? 'liked your post' : n.type === 'comment' ? 'replied to your post' : 'started following you'} <span>· ${new Date(n.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></p>${n.post ? `<button class="activity-preview" data-action="activity-post" data-id="${esc(n.post)}">${esc((n.preview || 'Photo post').slice(0, 110))} ↗</button>` : ''}</div>${n.read ? '' : '<span class="unread-dot" aria-label="Unread"></span>'}</article>`).join('') : '<div class="empty"><h3>You’re all caught up.</h3><p>When someone follows you or interacts with your posts, it will appear here.</p></div>'}<p class="sample">Showing your latest 100 notifications.</p></section>`;
}
function render() { document.querySelector('#app').innerHTML = `<a class="skip-link" href="#main-content">Skip to content</a><div class="shell"><aside class="sidebar"><a class="brand" href="/">${icon('orbit')} InstaX</a><nav aria-label="Main navigation">${[['home', 'Home'], ['explore', 'Explore'], ['bookmark', 'Saved'], ['bell', 'Activity'], ['user', 'Profile']].map(([i, v]) => `<button class="${state.view === v ? 'active' : ''}" data-action="nav" data-view="${v}" ${state.view === v ? 'aria-current="page"' : ''}>${icon(i)}<span>${v}</span>${v === 'Activity' && state.unread ? `<span class="notification-badge" aria-label="${state.unread} unread notifications">${state.unread > 99 ? '99+' : state.unread}</span>` : ''}</button>`).join('')}</nav><button class="primary" data-action="create">${icon('plus')} Create a post</button><div class="account"><div class="avatar mine">${avatarContent(state.me)}</div><div><b>${esc(state.me?.name || 'Welcome to InstaX')}</b><br>${state.me ? `<a class="sample" href="/signout-with-chatgpt?return_to=/" target="_top">Sign out</a>` : '<a class="sample" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in ↗</a>'}</div></div><div class="sidebar-foot">A little more connected.<br><small>© 2026 InstaX</small></div></aside><main id="main-content" tabindex="-1"><header><div><span class="eyebrow">YOUR DAILY INSTAX</span><h1>${state.view}</h1></div><span class="live-label">A space for your people</span></header><div id="error" class="error" role="alert" ${!state.error ? 'hidden' : ''}>${esc(state.error)}</div>${state.view === 'Activity' ? activityPanel() : state.view === 'Home' ? `<div class="tabs" role="tablist" aria-label="Feed"><button role="tab" aria-selected="${state.tab === 'For you'}" class="${state.tab === 'For you' ? 'selected' : ''}" data-action="tab" data-tab="For you">For you</button><button role="tab" aria-selected="${state.tab === 'Following'}" class="${state.tab === 'Following' ? 'selected' : ''}" data-action="tab" data-tab="Following">Following</button></div>${composer()}${state.tab === 'For you' && !state.focusPost ? '<p class="feed-hint">Picked for you from your likes, saves, and follows.</p>' : ''}${state.focusPost ? '<div class="focused-post-bar">Viewing one post <button class="mini-button" data-action="nav" data-view="Home">Back to feed</button></div>' : ''}` : state.view === 'Explore' ? `<form class="search" id="explore-search">${icon('search')}<input name="q" value="${esc(state.q)}" placeholder="Search posts, people, or #topics" aria-label="Search InstaX"><button aria-label="Search">${icon('arrow')}</button></form><div class="topic-chips">${['EverydayFrames', 'CreativeEnergy', 'OutsideMore'].map(t => `<button data-action="topic" data-topic="#${t}">#${t}</button>`).join('')}</div>` : state.view === 'Saved' ? '<section class="saved-intro"><h2>Worth coming back to.</h2><p>Your private collection of saved posts.</p></section>' : profilePanel()}${state.view === 'Activity' ? '' : `<div class="section-line"><b>${state.view === 'Saved' ? 'Saved posts' : state.view === 'Profile' ? 'Posts' : state.tab === 'Following' ? 'From your people' : state.q ? 'Search results' : 'On InstaX'}</b><span>Fresh perspectives, all in one place</span></div><div id="feed">${state.posts.map(postCard).join('') || `<section class="empty">${!state.loaded ? 'Loading InstaX…' : state.view === 'Saved' ? 'Save a post using its bookmark button. Only you can see this collection.' : state.tab === 'Following' ? 'Follow a few people to bring their posts here.' : state.q ? 'No posts match that search. Try another word.' : state.view === 'Profile' ? 'No posts yet. Your next moment starts here.' : 'It’s quiet here. Share the first thought.'}</section>`}</div>${state.hasMore ? '<button class="mini-button load-more" data-action="more">Load more</button>' : ''}`}</main><aside class="right"><form class="search" id="side-search">${icon('search')}<input name="q" placeholder="Search InstaX" aria-label="Search InstaX"><button aria-label="Search">${icon('arrow')}</button></form><section class="welcome"><span class="eyebrow">MAKE ROOM FOR CONNECTION</span><h2>Your people.<br>Your perspective.</h2><p>Share the everyday. Find something unexpected.</p>${icon('orbit')}</section><section class="discover"><h3>Find your next obsession ${icon('arrow')}</h3>${['EverydayFrames', 'CreativeEnergy', 'OutsideMore'].map((t, i) => `<button class="topic" data-action="topic" data-topic="#${t}"><span>0${i + 1}</span><b>#${t}<small>${['The beauty in between', 'Ideas worth sharing', 'Take the scenic route'][i]}</small></b></button>`).join('')}</section><section class="people"><h3>Find your people</h3>${state.people.filter(p => p.id !== state.me?.id).slice(0, 3).map(p => `<div class="person-row"><div class="avatar">${avatarContent(p)}</div>${profileButton(p)}<button class="mini-button" data-action="follow" data-id="${esc(p.id)}" data-active="${!p.followed}">${p.followed ? 'Following' : 'Follow'}</button></div>`).join('')}</section><div class="right-foot">A place for photos, thoughts, and everything in between.</div></aside></div><dialog id="edit-dialog"><form id="profile-form" class="profile-form"><div class="dialog-head"><h2>Edit profile</h2><button type="button" data-action="close-dialog" aria-label="Close">${icon('close')}</button></div><div class="profile-photo-editor"><div class="avatar" id="profile-photo-preview">${avatarContent(state.me)}</div><div><button type="button" class="mini-button photo-picker" data-action="choose-avatar">Change photo</button><input id="profile-photo" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" hidden><p class="sample">JPEG, PNG, or WebP · up to 8 MB</p><p id="photo-status" class="sample" aria-live="polite"></p></div></div><label>Name<input name="name" maxlength="50" value="${esc(state.me?.name)}" required></label><label>Handle<input name="handle" minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]{3,24}" value="${esc(state.me?.handle)}" required></label><label>Bio<textarea name="bio" maxlength="160">${esc(state.me?.bio)}</textarea></label><p id="profile-error" class="error" hidden></p><button class="primary">Save profile</button></form></dialog>`; }
async function mutate(button, action, payload) { if (!state.me) {
    showError('Sign in with ChatGPT to join the conversation.');
    return;
} button.disabled = true; try {
    await api(action, payload);
    await load();
    const selector = '[data-action="' + CSS.escape(button.dataset.action || '') + '"]' + (button.dataset.id ? '[data-id="' + CSS.escape(button.dataset.id) + '"]' : '');
    document.querySelector(selector)?.focus({ preventScroll: true });
}
catch (e) {
    showError(e.message);
    button.disabled = false;
} }
document.addEventListener('click', async (event) => { const b = event.target.closest('[data-action]'); if (!b)
    return; const a = b.dataset.action; const id = b.dataset.id; if (a === 'nav')
    navigate(b.dataset.view); if (a === 'bookmark') {
    const p = state.posts.find(x => x.id === id);
    await mutate(b, 'bookmark', { post: id, active: !p.saved });
} if (a === 'refresh')
    load(); if (a === 'read-activity')
    await mutate(b, 'notifications-read', { through: state.through }); if (a === 'activity-post')
    navigate('Home', '', '', id); if (a === 'profile')
    navigate('Profile', id); if (a === 'topic')
    navigate('Explore', '', b.dataset.topic); if (a === 'create') {
    await navigate('Home');
    document.querySelector('#draft')?.focus();
} if (a === 'tab') {
    state.tab = b.dataset.tab;
    history.replaceState({}, '', state.tab === 'Following' ? '/?following=1' : '/');
    render();
    load();
} if (a === 'photo')
    document.querySelector('#photo').click(); if (a === 'remove-photo') {
    if (state.preview)
        URL.revokeObjectURL(state.preview);
    state.file = null;
    state.preview = '';
    render();
} if (a === 'like') {
    const p = state.posts.find(x => x.id === id);
    await mutate(b, 'like', { post: id, active: !p.liked });
} if (a === 'follow')
    await mutate(b, 'follow', { target: id, active: b.dataset.active === 'true' }); if (a === 'delete' && confirm('Delete this post? This cannot be undone.'))
    await mutate(b, 'delete', { post: id }); if (a === 'more')
    load(true); if (a === 'comments') {
    if (comments.has(id)) {
        comments.delete(id);
        render();
    }
    else {
        b.disabled = true;
        try {
            const r = await fetch('/api/feed?comments=' + encodeURIComponent(id));
            const d = await r.json();
            if (!r.ok)
                throw Error(d.error);
            comments.set(id, d.comments);
            render();
            document.querySelector(`#post-${CSS.escape(id)} .reply input`)?.focus();
        }
        catch (e) {
            showError(e.message);
            b.disabled = false;
        }
    }
} if (a === 'edit-profile')
    document.querySelector('#edit-dialog').showModal(); if (a === 'close-dialog')
    document.querySelector('#edit-dialog').close(); });
document.addEventListener('input', e => { if (e.target.id === 'draft') {
    state.draft = e.target.value;
    document.querySelector('#count').textContent = state.draft.length + '/500';
} });
document.addEventListener('change', e => { if (e.target.id !== 'photo')
    return; const f = e.target.files[0]; if (!f)
    return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 8 * 1024 * 1024) {
    showError('Choose a JPEG, PNG, or WebP photo up to 8 MB.');
    e.target.value = '';
    return;
} if (state.preview)
    URL.revokeObjectURL(state.preview); state.file = f; state.preview = URL.createObjectURL(f); render(); });
document.addEventListener('submit', async (e) => { const form = e.target; e.preventDefault(); if (form.id === 'side-search' || form.id === 'explore-search') {
    navigate('Explore', '', new FormData(form).get('q'));
    return;
} if (form.id === 'composer') {
    if (!state.me) {
        showError('Sign in with ChatGPT to post. Your draft is still here.');
        return;
    }
    if (state.busy)
        return;
    const data = new FormData();
    data.set('body', state.draft);
    if (state.file)
        data.set('image', state.file);
    state.busy = true;
    render();
    try {
        await api('post', data);
        state.draft = '';
        state.file = null;
        if (state.preview)
            URL.revokeObjectURL(state.preview);
        state.preview = '';
        state.busy = false;
        state.tab = 'For you';
        await load();
    }
    catch (e) {
        state.busy = false;
        render();
        showError(e.message);
    }
    return;
} if (form.classList.contains('reply')) {
    const button = form.querySelector('button');
    button.disabled = true;
    try {
        await api('comment', { post: form.dataset.post, body: new FormData(form).get('body') });
        const r = await fetch('/api/feed?comments=' + encodeURIComponent(form.dataset.post));
        const d = await r.json();
        if (!r.ok)
            throw Error(d.error);
        comments.set(form.dataset.post, d.comments);
        await load();
    }
    catch (e) {
        showError(e.message);
        button.disabled = false;
    }
    return;
} if (form.id === 'profile-form') {
    const button = form.querySelector('button.primary');
    button.disabled = true;
    try {
        await api('profile', new FormData(form));
        await load();
    }
    catch (e) {
        const out = document.querySelector('#profile-error');
        out.hidden = false;
        out.textContent = e.message;
        button.disabled = false;
    }
} });
window.addEventListener('popstate', () => { route(); render(); load(); });
route();
render();
load();
const context = document.modelContext;
if (context?.registerTool) {
    const controller = new AbortController();
    Promise.resolve(context.registerTool({ name: 'search_orbit_posts', title: 'Search InstaX', description: 'Search posts by text, creator, or hashtag and show the matching feed.', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 100 } }, required: ['query'], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, async execute(input) { if (!input || typeof input.query !== 'string' || input.query.length > 100)
            throw Error('A search query of at most 100 characters is required.'); state.view = 'Explore'; state.q = input.query; state.author = ''; state.tab = 'For you'; history.pushState({}, '', '/explore?q=' + encodeURIComponent(input.query)); await load(); if (state.error)
            throw Error(state.error); return { count: state.posts.length, posts: state.posts.map(p => ({ id: p.id, body: p.body, author: p.name })) }; } }, { signal: controller.signal })).catch(() => { });
    window.addEventListener('pagehide', () => controller.abort(), { once: true });
}
let profilePreviewURL = '';
document.addEventListener('change', event => {
    if (event.target.id !== 'profile-photo')
        return;
    const file = event.target.files[0];
    if (!file)
        return;
    const error = document.querySelector('#profile-error');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
        error.hidden = false;
        error.textContent = 'Choose a JPEG, PNG, or WebP photo up to 8 MB.';
        event.target.value = '';
        return;
    }
    error.hidden = true;
    if (profilePreviewURL)
        URL.revokeObjectURL(profilePreviewURL);
    profilePreviewURL = URL.createObjectURL(file);
    const img = document.createElement('img');
    img.src = profilePreviewURL;
    img.alt = 'New profile photo preview';
    document.querySelector('#profile-photo-preview').replaceChildren(img);
    document.querySelector('#photo-status').textContent = 'New photo selected. Save profile to apply it.';
});
document.addEventListener('click', event => { if (event.target.closest('[data-action="choose-avatar"]'))
    document.querySelector('#profile-photo').click(); });
document.addEventListener('keydown', event => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'For you' : event.key === 'End' ? 'Following' : tab.dataset.tab === 'For you' ? 'Following' : 'For you';
    state.tab = next;
    history.replaceState({}, '', next === 'Following' ? '/?following=1' : '/');
    load().then(() => document.querySelector('[data-tab="' + next + '"]')?.focus());
});
