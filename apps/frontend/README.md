# Codefest 2026 Frontend

Vite + React 18 + TypeScript + Tailwind CSS demo UI for the loyalty and fraud platform.

## Setup

```bash
cp .env.example .env
# Edit .env with your API base URL and credentials
npm install
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server at http://localhost:5173 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm run typecheck` | TypeScript check without emit |

## Stack

- Vite 5.x
- React 18.x
- TypeScript 5.x (strict mode)
- Tailwind CSS 3.x
- React Router 6.x
- Lucide React (icons)
- Native `fetch` (no axios)

## Env vars

See `.env.example` for required variables.

## Notes

- All API calls go through `src/lib/api.ts` (`apiFetch`)
- Types live in `src/lib/types.ts`, no `any` allowed
- Pages: `/login`, `/dashboard`
