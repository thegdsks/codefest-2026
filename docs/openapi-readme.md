# Signal Force API - Client codegen

Last updated: 2026-05-21

The spec lives at `docs/openapi.yaml` (OpenAPI 3.1). Frontend devs can use it to generate
TypeScript types and a typed fetch client without adding runtime dependencies to the bundle.

## Generating TypeScript types

Run once from the repo root. Writes a types-only file; no runtime code.

```bash
npx --yes openapi-typescript@latest docs/openapi.yaml \
  -o apps/frontend/src/api/openapi-types.ts
```

Commit the generated file. Re-run whenever `docs/openapi.yaml` changes.

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
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
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

There is no CI check that enforces spec-code sync. Manually re-generate
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

A ready-to-use Postman collection and environment live in `docs/postman/`:

- `docs/postman/signal-force.postman_collection.json` - Postman v2.1 collection,
  one folder per API surface (Auth, Customer, Engagement, Admin, AI, Demo).
- `docs/postman/signal-force.postman_environment.json` - environment with
  pre-filled production values.

### Quick import steps

1. Open Postman.
2. Click **Import** (top-left).
3. Drag `signal-force.postman_collection.json` onto the import dialog, then
   repeat for `signal-force.postman_environment.json`.
4. Select the **Signal Force - Production** environment from the environment
   dropdown (top-right corner).
5. Open **Auth > Login**, click **Send**. The test script captures `mfaSessionId`
   automatically.
6. Open **Auth > MFA Verify**, click **Send**. The test script captures
   `bearerToken` automatically.
7. All customer and engagement requests now work without further manual setup.

### Variables

| Variable | Source | Notes |
|---|---|---|
| `baseUrl` | Environment | Default: production API Gateway URL |
| `clientId` | Environment | `demoClient` |
| `clientSecret` | Environment (secret) | `demoSecret` |
| `basicAuth` | Computed at runtime | Set by collection pre-request script |
| `bearerToken` | Captured by test script | Populated by Auth/MFA Verify |
| `userId` | Environment | Default: `USER#031` (maya031) |

### Using the OpenAPI spec instead

If you prefer to generate a collection from the spec, open Postman, click
"Import", choose "File" or paste the raw `docs/openapi.yaml` content. Postman
generates one request per operation from the spec. You will need to configure
the `basicAuth` and `bearerToken` variables manually on the generated collection.

---

Related: [api-quickstart.md](./api-quickstart.md)
