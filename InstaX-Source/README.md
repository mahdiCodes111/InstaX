# InstaX

A responsive social web app combining photo posts and short conversations.

## Included

- Text posts (500 characters) and JPEG, PNG, or WebP photos (8 MB maximum).
- For you and Following feeds, search, hashtags, and paginated posts.
- Profiles with editable names, unique handles, bios, and follow counts.
- Likes, replies, following, and owner-only post deletion.
- Server-side identity checks and input validation; persistent SQL records and object storage.
- Three clearly marked sample posts with credited photographs.

## Run locally

Requires Node.js 24 or newer. The app's build and local server use Node built-ins, so no dependency installation is needed to try the app.

```sh
node scripts/build-orbit.mjs
node scripts/dev-orbit.mjs
```

Open http://127.0.0.1:5173. Local sign-in creates a development-only identity. Local records and uploads are saved under `work/`. This identity simulation is absent from the production Worker.

## Source map

- `src/index.html`: frontend document.
- `public/app.js`: frontend navigation, forms, feeds, and interaction handlers.
- `public/style.css`: desktop and mobile styling.
- `src/worker.js`: backend HTTP endpoints, authorization, validation, and storage operations.
- `db/schema.ts` and `drizzle/`: database schema and generated, versioned migrations.
- `scripts/build-orbit.mjs`: produces the deployable frontend and Worker.
- `scripts/dev-orbit.mjs`: local SQLite and file-storage adapters.
- `tests/backend.mjs`: backend integration checks.

The retained starter dependencies support optional schema tooling. To change the schema, install the locked dependencies and run `npm run db:generate`. It appends migrations; do not rewrite migrations already deployed.

## Backend contract

- `GET /api/feed`: feed, current profile, suggested profiles, and follower counts. Query parameters: `q`, `author`, `following=1`, and `before`.
- `GET /api/feed?comments=POST_ID`: most recent 100 replies.
- `POST /api/feed?action=post`: multipart fields `body` and optional `image`.
- `POST /api/feed?action=profile`: JSON `name`, `handle`, and `bio`.
- `POST /api/feed?action=like`: JSON `post` and boolean `active`.
- `POST /api/feed?action=follow`: JSON `target` and boolean `active`.
- `POST /api/feed?action=comment`: JSON `post` and `body`.
- `POST /api/feed?action=delete`: JSON `post`; only its author may delete it.
- `GET /media/uploads/UUID`: stored post image.

Writes require a trusted platform identity. Hosted sign-in is provided by Sites/ChatGPT, using the platform's authenticated headers. An arbitrary deployment must put an authenticated gateway in front of this Worker and strip untrusted identity headers; do not expose it directly with client-supplied identity headers.

## Deployment

Cloudflare-compatible ESM Worker plus static assets, D1 binding `DB`, and R2 binding `BUCKET`. Sites manages hosted identity, storage provisioning, migrations, and access. The initial hosted app is owner-private. Sharing it with other people requires changing the site's audience.

## Validation

```sh
node scripts/build-orbit.mjs
node tests/backend.mjs
```

The checks cover persistence, image storage, unauthorized writes, ownership, cross-origin requests, repeated likes, replies, following, unique handles, malformed uploads, length limits, and deletion cleanup. Browser checks cover post creation, reload persistence, desktop/phone layouts, and valid/invalid WebMCP search.

This is a functional first version. It does not include direct messages, video, push notifications, or a moderation/admin system.

## Portfolio additions

Private saved posts and an activity inbox are now available from the navigation. Bookmarks survive reloads and are scoped to the signed-in user. Likes, replies, and follows generate recipient-only activity events; the inbox supports unread counts and marking existing events as read. Activity refreshes on navigation or with Refresh.

Feed pagination uses both the timestamp and post ID to handle ties. Notification creation is transactional with its associated action. The expanded integration checks verify privacy boundaries, duplicate suppression, rollback on a notification failure, and cascading cleanup.

Additional endpoints:

- `GET /api/feed?saved=1`: the current user's saved posts.
- `GET /api/feed?activity=1`: the current user's most recent 100 notifications, unread count, and read watermark.
- `GET /api/feed?post=POST_ID`: a single post in feed format.
- `POST /api/feed?action=bookmark`: JSON `post` and boolean `active`.
- `POST /api/feed?action=notifications-read`: JSON `through` from the activity response.
- Pagination uses `before` and `beforeId` together.

See [Architecture](docs/ARCHITECTURE.md) for design decisions, security boundaries, tests, and production gaps. `.github/workflows/ci.yml` configures Node 24 build/syntax/integration checks. The app's active browser code is plain JavaScript; retained starter dependencies do not imply the UI is implemented in React.

## Simple recommendation algorithm

“For you” calls `GET /api/feed?recommend=1`. It ranks the newest 200 posts using:

- Freshness: `8 / (1 + ageInHours / 24)`.
- Engagement: `min(4, log2(1 + likes + 2 × replies))`.
- Followed author: +4 points.
- Matching hashtags: up to +6 points, based on the viewer's latest 100 liked/saved posts. Saves count twice; repeated hashtags within a post count once.
- Already liked or saved: −3 points to give unseen content more room.

Each result includes a plain-language reason. New users receive freshness/engagement recommendations. Following, search, profiles, and saved posts keep chronological order. Load more passes displayed IDs in `seen` to prevent duplicates while ranking is recalculated; it is bounded to the newest 200 candidates, not a full-history or frozen-snapshot feed. No machine-learning model or external tracking is used.

Tests verify follow/hashtag boosts, capped popularity, viewer isolation, cold-start behavior, deduplicated pagination, and chronological-filter fallback.
