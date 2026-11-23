# Setup guide

Do these once. Items marked **you** can only be done in your own dashboards.

## 1. Supabase (sign-in codes)

1. **Authentication → Providers → Email:** enabled.
2. **Authentication → Email Templates:** edit both **Confirm signup** and **Magic Link** so the email shows the code. Put `{{ .Token }}` in the body, for example:
   ```html
   <h2>Your chatZ code</h2>
   <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>It expires in 10 minutes. If you did not ask for it, ignore this email.</p>
   ```
   New users receive the first template, returning users the second.
3. **Authentication → SMTP Settings:** set your own SMTP (Resend, Brevo, Gmail app password, ...). The built-in mail service is for testing: very low hourly limit, and on new projects it may only deliver to your own team's addresses. **Without custom SMTP real users will not receive codes.**
4. **Authentication → Rate limits / settings:** OTP length 6 (if you pick another length set `VITE_OTP_LENGTH` in the frontend), expiry 600 s.
5. **Authentication → URL Configuration:** Site URL = your deployed web address.
6. **JWT signing:** the API reads the project's public keys from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`. If your project still uses the legacy shared secret (HS256), set `SUPABASE_JWT_SECRET` in the backend.

## 2. Neon database

Create a project, copy the **pooled** connection string into `DATABASE_URL`. Migrations run automatically on start (`AUTO_MIGRATE=true`); you can also run `npm run migrate`. Neon pauses idle databases; the API retries the first query after a wake-up.

## 3. Neon object storage (photos, videos, files)

1. Create a bucket in the Neon console (the S3 endpoint you were given looks like `https://<id>.storage.<region>.aws.neon.tech`).
2. Put these in `backend/.env`:
   ```text
   AWS_ENDPOINT_URL_S3=https://...
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-2
   S3_BUCKET=<your bucket name>        # <- required, uploads stay off until this is set
   ```
3. Files are uploaded **through the API**, so the bucket needs no CORS rules. Chat files are streamed by the API (`STORAGE_DELIVERY=proxy`). If your storage supports presigned URLs and you want browsers to download straight from it, set `STORAGE_DELIVERY=presign`.
4. Keep the access keys only in the backend environment. Never put them in the frontend.

## 4. Environment variables

Backend (`backend/.env`, see `.env.example`): `CLIENT_ORIGIN`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FILE_URL_SECRET` (32+ random characters), the S3 variables, `TRUST_PROXY=1` behind Render/Railway/Fly.

Frontend (`frontend/.env`): `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. On Netlify set them under *Site configuration → Environment variables* and redeploy. (Next.js style `NEXT_PUBLIC_*` names are not read by Vite.)

## 5. Deploy

- **Web:** Netlify, using `netlify.toml` (base `frontend`).
- **API:** any host that keeps WebSockets open and runs one instance: Render, Railway, Fly.io, a VPS. Build with `npm run build`, start with `npm start` (or use `backend/Dockerfile`, built from the repo root).
- Set `CLIENT_ORIGIN` to your web address (comma separate several).

## 6. First-run checklist (things that could not be tested without your accounts)

Tick these once after deploying; each takes a minute.

- [ ] `GET <api>/health` returns `{"ok":true,"db":true,"storage":true,...}` (storage is `false` until the bucket is set).
- [ ] Sign up with a real email: the email arrives with a 6-digit code, the code signs you in, onboarding creates your profile.
- [ ] Sign out, then sign in by **username**: a code arrives, you get in.
- [ ] Upload a profile photo in onboarding or Settings, and it shows everywhere.
- [ ] Send a photo and a video to a friend: both play, the video can seek.
- [ ] Open two browsers with two accounts, send each other messages: they arrive live, read ticks update, typing shows.
- [ ] Delete a test account from Settings → Account.

Known caveat: deleting an account removes everything in chatZ, but the Supabase sign-in record stays (removing it needs the Supabase service key, which chatZ never stores). Signing in with that email again starts a fresh profile.
