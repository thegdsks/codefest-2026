# @signal-force/engagement-sdk

Captures behavioural signals and renders contextual interventions (banners, modals, tooltips) based on rules evaluated server-side.

## Install

```bash
npm install @signal-force/engagement-sdk
```

React is a peer dependency (`^18 || ^19`).

## Quickstart

```tsx
import { EngagementProvider } from '@signal-force/engagement-sdk/react';

const config = {
  baseUrl: 'https://api.example.com',
  getAuthHeader: () => `Bearer ${localStorage.getItem('token') ?? ''}`,
};

export default function App({ children }: { children: React.ReactNode }) {
  return (
    <EngagementProvider config={config}>
      {children}
    </EngagementProvider>
  );
}
```

The provider automatically:
- Captures rage-clicks, dwell-without-action, abandoned flow steps, repeated queries, and points-balance stare events
- Polls `/interventions/pending` every 2 seconds
- Renders the matching surface (banner, modal, or tooltip) when an intervention is returned

## Manual event tracking

```tsx
import { useEngagement } from '@signal-force/engagement-sdk/react';

function SearchBar() {
  const { trackSearch } = useEngagement();

  function handleSearch(query: string) {
    trackSearch(query);
    // ... your search logic
  }

  return <input onChange={(e) => handleSearch(e.target.value)} />;
}
```

## Points balance marker

Add `data-signal="points_balance"` to your points display element to activate the balance-stare detector:

```tsx
<span data-signal="points_balance">{user.pointsBalance.toLocaleString()} pts</span>
```

## Custom surfaces

Override any default surface by passing a `surfaces` prop:

```tsx
import { EngagementProvider } from '@signal-force/engagement-sdk/react';
import type { Intervention } from '@signal-force/engagement-sdk';

function MyBanner({ intervention, onDismiss }: { intervention: Intervention; onDismiss: () => void }) {
  return (
    <div className="my-banner">
      <p>{intervention.message}</p>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

<EngagementProvider
  config={config}
  surfaces={{ nudge_banner: MyBanner }}
>
  {children}
</EngagementProvider>
```

## Config reference

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | API base URL (no trailing slash) |
| `getAuthHeader` | `() => string` | Returns the `Authorization` header value |
| `dwellThresholdMs` | `number` | Milliseconds before dwell-no-action fires (default 30000) |
| `pollIntervalMs` | `number` | How often to poll `/interventions/pending` (default 2000) |
| `flushIntervalMs` | `number` | How often to flush buffered events (default 5000) |
| `onRouteChange` | `(cb: (path: string) => void) => () => void` | Subscribe to route changes for abandoned-flow detection |
