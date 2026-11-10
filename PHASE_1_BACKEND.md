# Phase 1 backend foundation

## What is in place

- MongoDB native driver connection cached across Next.js development reloads.
- Student registration and sign-in APIs, bcrypt password hashes, seven-day opaque sessions with only an HMAC digest stored in MongoDB, and an HTTP-only, SameSite=Lax cookie.
- Login and registration throttles stored in MongoDB, unique normalized email index, session expiry TTL index, and server-side ownership checks.
- Owner-scoped course CRUD APIs. Course IDs are MongoDB ObjectIds, and all reads/updates/archive operations include the verified session's student ID in the database filter.
- Dashboard authentication gate and MongoDB course listing/creation UI.
- Existing local study workspaces migrate to MongoDB after the student signs in. The server attaches the authenticated account ID, creates a related course with an unset examination year (the old prototype did not record a year), then subsequent workspace changes sync to MongoDB. The browser copy is removed only after successful migration.

## MongoDB collections and indexes

`users` stores `fullName`, normalized unique `email`, `passwordHash`, student `role`, account status and timestamps. `sessions` stores an HMAC token digest, user ObjectId, expiry and creation time. `courses` stores student ID, title, subject, WAEC examination year, status and timestamps. `studyWorkspaces` stores the legacy workspace data linked to its authenticated student and course. `authRateLimits` stores short-lived request counters.

Indexes are initialized by the application: unique `users.email`; unique session token digest and TTL on `sessions.expiresAt`; `courses(studentId,status,updatedAt)` plus unique migration identity; `studyWorkspaces(studentId,courseId)` and `(studentId,legacyId)`; and TTL plus unique bucket key for auth rate limits.

## Configure and run

1. Create a MongoDB Atlas cluster or use a MongoDB server. Create a database user with access limited to the Cognify database, allow the application host in the network access list, and copy its connection URI.
2. Copy `.env.example` to `.env.local`. Set `MONGODB_URI`, `MONGODB_DATABASE`, `AUTH_SECRET`, and `AUTH_URL`. Generate the secret with `openssl rand -base64 48`. Use `http://localhost:3000` for local `AUTH_URL`; production must use the canonical HTTPS origin.
3. Run `npm install` and then `npm run dev`. The MongoDB collections and indexes are created on the first API request. For production use `npm run build` and `npm start` with the same server-only environment variables.

The Mongo URI and auth secret are read only by server code. Never prefix them with `NEXT_PUBLIC_`. In production the session cookie is marked Secure.

## Manual verification checklist

1. Register a new student with a name, email and password of at least ten characters. Confirm a user record appears and contains `passwordHash`, not a plaintext password.
2. Refresh. The same account should remain signed in; inspect browser storage to confirm there is an HTTP-only `cognify_session` cookie and no auth token in localStorage.
3. Sign out and sign in again with the same credentials. Wrong credentials should return the same generic error.
4. Create a course and refresh. It should remain in the course list with the same MongoDB ID.
5. Create a second student in a separate browser session. Request the first student's course ID from the second session at `GET /api/courses/{id}`, `PATCH /api/courses/{id}`, and `DELETE /api/courses/{id}`. Each should return 404 and leave the first student's course unchanged.
6. With a browser profile containing old `waec-prep-study-workspaces-v1` data, sign in. Confirm workspaces migrate and appear in MongoDB and the old localStorage entry is removed only after successful migration.

## Existing prototype data

The existing workspace key is inspected only after successful authentication. It is migrated to `studyWorkspaces` and related WAEC course records. The earlier UI-generated syllabus/topic content remains marked as prototype data; this phase does not claim it came from real syllabus processing. Examination year is left unset rather than inferred.

## Remaining limitations

This app supports student accounts only. The previous teacher/student role toggle was demo-only and is removed as an authentication mechanism; teachers/admins need an explicit provisioned-account and role policy before they are enabled. Password reset and email verification are not part of this phase. The built-in Mongo-backed rate counter works across app instances sharing this database, but production deployments should still enforce edge/network throttling. Phase 2 document uploads and Phase 3 OCR are not part of this backend phase.
