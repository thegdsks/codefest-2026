# Signal Force API - Client codegen

The spec lives at `docs/openapi.yaml` (OpenAPI 3.1). FE devs can use it to
generate TypeScript types and a typed fetch client without adding runtime
dependencies to the frontend bundle.

## Generating TypeScript types

Run once from the repo root. Writes a types-only file; no runtime code.

```bash
npx --yes openapi-typescript@latest docs/openapi.yaml \
  -o apps/frontend/src/api/openapi-types.ts
```

Commit the generated file. Re-run whenever `docs/openapi.yaml` changes (see
below for the workflow).

## Using the generated types with openapi-fetch

`openapi-fetch` is a tiny fetch wrapper (< 2 kB) that uses the generated types
for request and response type inference.

```bash
# Install once as a project dependency (it is a runtime dep, not dev-only):
npm install openapi-fetch
```

Basic usage in `apps/frontend/src/api/client.ts`:

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './openapi-types';

export const apiClient = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  headers: {
    Authorization: `Basic ${btoa('demoClient:demoSecret')}`,
  },
});
```

Typed call example:

```typescript
const { data, error } = await apiClient.GET('/user/profile', {
  params: { query: { userId: 'USER#001' } },
});

if (error) {
  console.error(error.error.code, error.error.message);
} else {
  console.log(data.data.tier); // TypeScript knows the shape
}
```

## Keeping the spec in sync

There is no CI check yet that enforces spec-code sync. Manually re-generate
types after any change to `apps/backend/src/handler.js` or `apps/backend/src/admin.js`.

Suggested local workflow:

1. Change the handler.
2. Update `docs/openapi.yaml` to match.
3. Run the `openapi-typescript` command above.
4. Commit all three files together.

## Admin endpoints

Admin endpoints are marked `x-internal-only: true` in the spec. If you add a
doc-generation step later, filter on that extension to produce a customer-facing
spec that excludes `/admin/*` paths.

## Postman import

The OpenAPI spec at `docs/openapi.yaml` is the canonical Postman source for this
project. There is no separate `*.postman_collection.json` file in the repo.

To import: open Postman, click "Import", choose "File" or paste the raw
`docs/openapi.yaml` content. Postman will generate a collection with one request
per operation, pre-populated with example values from the spec.

Gateway auth (`demoClient:demoSecret`) should be set as a Basic Auth collection
variable so it applies to all requests. Bearer tokens must be set manually on
customer-route requests after a `POST /auth/login` + `POST /auth/mfa/verify` flow.
