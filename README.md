# Beatify

A small music app: upload MP3s and play them in the browser.

Built with **Next.js 14 (App Router)**, **React 18**, **TypeScript**, **Tailwind CSS**, **shadcn/ui** and **zustand**. Files are stored in **AWS S3**, served through **CloudFront**, and song details are kept in **DynamoDB**.

## How it works

```
Browser ── POST /api/upload ──────► Next.js server ── presigns ──► S3 PUT URL (60 s)
Browser ── PUT mp3 (presigned) ───────────────────────────────────► S3
Browser ── POST /api/songs ───────► Next.js server ── checks the object in S3, saves ──► DynamoDB
Browser ── GET  /api/songs ───────► Next.js server ── scans ──────► DynamoDB
Browser ── plays url ─────────────────────────────────────────────► CloudFront

Browser ── POST /api/signup | /api/login ► Next.js server ── bcrypt + users table ──► DynamoDB
        ◄── Set-Cookie: beatify_session (httpOnly) ──
Browser ── GET /api/session (cookie) ──► Next.js server ── looks up session ──► DynamoDB
```

All AWS access happens on the server (`src/server/*`, guarded by `import "server-only"`). The browser never sees AWS credentials and never imports the AWS SDK.

### Login

- `POST /api/signup` hashes the password with **bcrypt** (cost 12) and stores only the hash. `POST /api/login` checks the password on the server; wrong password, unknown email and legacy accounts without a hash all get the same `401`.
- A successful login/signup creates a random 256-bit session token and sets it as an **httpOnly**, `SameSite=Lax` cookie (`Secure` in production), valid for 7 days. Only a SHA-256 hash of the token is stored in DynamoDB, so `POST /api/logout` can revoke it.
- Nothing auth-related is kept in `localStorage`. The zustand store (`src/store/store.ts`) only holds `username`/`premium` for the UI; the Navbar refills it from `GET /api/session` on page load.

## Project structure

```
src/
  app/
    page.tsx              Home: song list + player (loading / empty / error states)
    login/page.tsx        Login / sign-up form (shadcn/ui card)
    upload/page.tsx       Upload form
    contact/page.tsx      Contact page
    api/upload/route.ts   POST: validate request, return presigned S3 PUT URL
    api/songs/route.ts    GET: list songs · POST: verify upload and save song
    api/signup/route.ts   POST: create account, set session cookie
    api/login/route.ts    POST: check password, set session cookie
    api/logout/route.ts   POST: delete session, clear cookie
    api/session/route.ts  GET: current user from the session cookie
  components/             Navbar, MusicPlayer, VideoCard (song row)
  components/ui/          shadcn/ui components (button, card, input, label)
  lib/
    validation.ts         Shared validation (title, slug, S3 key, upload request, credentials)
    api-client.ts         Browser fetch helpers for the API routes
    types.ts              Shared types
    utils.ts              shadcn `cn()` helper
  store/store.ts          zustand store for the signed-in user (UI state only)
  server/                 Server-only code: AWS config/clients, songs, auth, HTTP helpers
tests/                    Vitest tests (validation + API and auth routes with mocked AWS)
```

## API

| Method & path      | Body                                               | Responses |
|--------------------|----------------------------------------------------|-----------|
| `POST /api/upload` | `{ "title": string, "contentType": "audio/mpeg", "size": number }` | `200 { uploadUrl, key }` · `400` invalid input · `503` AWS not configured |
| `POST /api/songs`  | `{ "title": string, "key": string }` (key from `/api/upload`) | `201 { song }` · `400` invalid input or bad upload · `503` · `500` |
| `GET /api/songs`   | none                                               | `200 { songs }` · `503` · `500` |
| `POST /api/signup` | `{ "email": string, "password": string }` (8+ chars, max 72 bytes) | `201 { user }` + cookie · `400` · `409` email taken · `503` · `500` |
| `POST /api/login`  | `{ "email": string, "password": string }`          | `200 { user }` + cookie · `400` · `401` · `503` · `500` |
| `POST /api/logout` | none (uses the cookie)                             | `200 { ok: true }`, cookie cleared |
| `GET /api/session` | none (uses the cookie)                             | `200 { user }` or `200 { user: null }` · `503` · `500` |

`user` is `{ "username": string, "premium": boolean }`; the password hash is never returned.

Rules: the title is 1 to 100 characters after trimming, the file must be `audio/mpeg`, and the size must be at most 15 MB. The S3 key is built on the server as `songs/<uuid>-<slugified-title>.mp3`. Before saving, `POST /api/songs` checks the object's real size and type in S3 (a presigned PUT URL can't enforce size). If the object is too big or the wrong type, it's deleted.

## Setup

Requirements: Node.js 18.17 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev                  # http://localhost:3000
```

### Environment variables

These are server-only. Do **not** prefix them with `NEXT_PUBLIC_`.

| Name                    | Example                                  |
|-------------------------|------------------------------------------|
| `AWS_ACCESS_KEY_ID`     | IAM user access key                      |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret                          |
| `AWS_REGION`            | `us-east-1`                              |
| `S3_BUCKET_NAME`        | `my-beatify-bucket`                      |
| `CLOUDFRONT_URL`        | `https://dxxxxxxxx.cloudfront.net`       |
| `DYNAMODB_TABLE`        | `musicwebapp`                            |
| `DYNAMODB_USERS_TABLE`  | `userprofiles`                           |

If any of them is missing, the site still builds and runs. The API routes return `503 {"error": "AWS is not configured..."}`, and the pages show a friendly message. Login/signup only need the three `AWS_*` variables and `DYNAMODB_USERS_TABLE`.

### AWS resources

- **DynamoDB songs table** with partition key `pk` (String) and sort key `sk` (String).
- **DynamoDB users table** with partition key `user_id` (String), no sort key. It holds both users (`user_id` = email) and sessions (`user_id` = `session#<sha256>`). Optionally enable DynamoDB TTL on the `expiresAt` attribute so expired sessions are deleted automatically.
- **S3 bucket** with a CORS rule that allows the browser to `PUT` uploads, for example:
  ```json
  [{ "AllowedOrigins": ["http://localhost:3000", "https://your-domain"],
     "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3000 }]
  ```
- **CloudFront distribution** with the bucket as its origin.
- **IAM user** with only these permissions:
  - `s3:PutObject`, `s3:GetObject` (needed for the HEAD check) and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/songs/*`
  - `dynamodb:Scan` and `dynamodb:PutItem` on the songs table
  - `dynamodb:GetItem`, `dynamodb:PutItem` and `dynamodb:DeleteItem` on the users table

## Scripts

| Command         | What it does                     |
|-----------------|----------------------------------|
| `npm run dev`   | Start the dev server             |
| `npm run build` | Production build                 |
| `npm run start` | Serve the production build       |
| `npm run lint`  | ESLint (`next lint`)             |
| `npm test`      | Vitest unit and API-route tests (AWS is mocked, no real AWS needed) |

## Known limitations

- The Upload button is only shown to signed-in users, but the upload API routes do **not** check the session yet, and every upload is credited to a fixed author name (`DEFAULT_AUTHOR` in `src/server/songs.ts`).
- Accounts created by the old client-side login (no `passwordHash`) cannot sign in; those users must sign up again (or have their row deleted first, since the email is the key).
- There's no password reset, email verification or rate limiting (including on `/api/login`).
- `GET /api/songs` scans the whole table, which is fine for a small library but won't scale.
- Uploads that reach S3 but are never saved with `POST /api/songs` (for example, if the tab is closed) stay in the bucket. An S3 lifecycle rule can clean them up.
