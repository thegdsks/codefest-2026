# Signal Force Frontend

Next.js 15 + React 19 + TypeScript + Tailwind CSS demo UI for the loyalty and fraud platform.

## Setup

```bash
cp .env.example .env.local
# Edit .env.local with your API base URL and credentials
npm install
npm run dev
```

## Scripts

| Command             | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Start dev server at http://localhost:3001 (Turbopack) |
| `npm run build`     | Production build                                      |
| `npm run start`     | Serve production build on port 3001                   |
| `npm run typecheck` | TypeScript check without emit                         |

## Stack

- Next.js 15.x (App Router, Turbopack)
- React 19.x
- TypeScript 5.x (strict mode)
- Tailwind CSS 3.x
- Lucide React (icons)
- Native `fetch` (no axios)

## Env vars

See `.env.example` for required variables. Prefix is `NEXT_PUBLIC_` (replaces `VITE_`).

## Structure

```
app/
  layout.tsx        root layout (header + nav shell)
  page.tsx          redirects / -> /login
  login/page.tsx    login form
  dashboard/page.tsx dashboard view
components/
  nav.tsx           active-aware header nav (client component)
lib/
  api.ts            apiFetch helper (Basic Auth + correlation ID)
  types.ts          shared API envelope and domain types
```

## Notes

- All API calls go through `lib/api.ts` (`apiFetch`)
- Types live in `lib/types.ts`, no `any` allowed
- Pages with interactivity are marked `'use client'`
- The backend runs on port 3000; this dev server runs on 3001
