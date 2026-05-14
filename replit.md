# Career Compass

A mobile app for Zambian students to find and manage WIL (Work-Integrated Learning) placements, track job applications, discover networking events, and upload career documents.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/mobile run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Mobile: Expo (React Native) — `artifacts/mobile`
- AI: Gemini via `@workspace/integrations-gemini-ai`
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/storage.ts` — file content extraction via Gemini (no GCS/cloud storage)
- `artifacts/api-server/src/routes/ai.ts` — all AI-powered endpoints (company discovery, interview prep, events, etc.)
- `artifacts/mobile/app/(tabs)/` — main tab screens (Home, Companies, Applications, Contacts/Events, Profile, Docs)
- `artifacts/mobile/app/company-detail.tsx` — company detail screen (AI research, interview prep, letter writer)
- `artifacts/mobile/app/doc-viewer.tsx` — document viewer (handles local file:// URIs via expo-sharing)
- `artifacts/mobile/context/AppContext.tsx` — global state (profile, applications, contacts, docs, events)
- `artifacts/mobile/utils/notifications.ts` — local push notification helpers
- `.github/workflows/build-apk.yml` — GitHub Actions EAS Build for APK

## Architecture decisions

- **No cloud storage**: Documents are stored in `FileSystem.documentDirectory/career-compass-docs/` on the device. Content is sent as base64 to `POST /api/storage/extract-content` for Gemini text extraction only.
- **Local file URIs**: `StoredDocument.objectPath` stores a local `file://` URI, not a GCS/S3 path.
- **Gemini AI key**: Set via `GEMINI_API_KEY` env var; the `@workspace/integrations-gemini-ai` client prefers this over the Replit proxy when available.
- **Push notifications**: Local notifications only (expo-notifications) — no push server required. Triggered in the Contacts/Events tab when new networking events are fetched.
- **Company detail navigation**: `companies.tsx` passes the full company object as JSON URL param to `/company-detail`.

## Product

- Home tab: personalised greeting, stats overview, upcoming events, quick-action shortcuts
- Companies tab: AI-discovered WIL companies, track button, "Details" button → full detail screen with AI research, interview prep, and letter-writing modal
- Applications tab: Kanban-style tracking of placement applications
- Events/Contacts tab: AI-fetched networking events for Zambia, contact CRM, local push notifications when new events are found
- Docs tab: Upload PDFs/images, extract AI insights, store locally, open/share with expo-sharing
- Profile tab: Display name, photo, degree, city, career goals; full reset with double-confirm

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do NOT import `zod` directly in `api-server` — it's not in its dependencies. Use manual JS validation or import via `@workspace/api-zod`.
- `objectStorage.ts` and `objectAcl.ts` are orphaned (no longer imported) but kept to avoid breaking the TS build; `@google-cloud/storage` is still installed.
- `expo-notifications` v55 requires `shouldShowBanner` and `shouldShowList` in the handler response (iOS 14+).
- Use `expo-sharing` to open local `file://` documents from the doc viewer on Android/iOS.
- EAS build profile `preview` → APK (internal); `production` → AAB.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
