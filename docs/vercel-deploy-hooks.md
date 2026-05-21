# Vercel deploy hooks for the team

Two ways teammates trigger a production deploy without touching the Vercel dashboard:

## Path 1: Merge to main (default, automatic)

Open a PR, get review, squash-merge into `main`. The `.github/workflows/deploy-vercel.yml` workflow fires the deploy hook automatically.

This is what most pushes should use.

## Path 2: Manual trigger from GitHub Actions UI

For when you need to redeploy without a code change (e.g. you flipped an env var on Vercel, or the last build failed for a transient reason).

1. GitHub repo → **Actions** tab
2. Left sidebar → **Deploy Vercel**
3. Top right → **Run workflow** → pick `main` → optionally write a reason → **Run workflow**
4. Workflow runs in seconds, fires the deploy hook, prints the Vercel job id in the run summary.

Anyone with write access to the repo can use this. No Vercel account access required.

## Path 3: Direct curl (advanced)

If you want to fire from a script or another service:

```bash
curl --request POST "$VERCEL_DEPLOY_HOOK_URL"
```

Get the URL from a teammate or from Vercel **Settings → Git → Deploy Hooks** (treat it like a credential).

## One-time setup (already done)

1. Vercel Settings → Git → Deploy Hooks → created `prod-main` hook targeting `main`.
2. GitHub repo Settings → Secrets and variables → Actions → added `VERCEL_DEPLOY_HOOK_URL` secret with the URL.
3. `.github/workflows/deploy-vercel.yml` workflow in this repo wires it up.

## Why this beats default Vercel auto-deploy

- Preview deploys for every PR push burn Vercel build minutes. We've disabled those in `vercel.json` (`ignoreCommand` skips non-production builds).
- The auth between GitHub and Vercel via the deploy hook is a single-purpose URL stored as a GitHub secret. No Vercel personal token, no Vercel teammate seats needed for the rest of the team.
- The GitHub Action run shows up in the repo's Actions tab, so every deploy has an attributable trigger record.

## Troubleshooting

**Workflow fails with "VERCEL_DEPLOY_HOOK_URL secret is not set":**
The secret wasn't added or got rotated. Re-add it in GitHub repo Settings.

**Workflow succeeds but Vercel didn't deploy:**
The hook may be pointing at the wrong branch in Vercel, or Vercel's `ignoreCommand` is cancelling. Check the Vercel dashboard for the actual build status. Confirm `VERCEL_ENV=production` is set when the hook fires (deploy hooks default to production).

**The hook URL got leaked:**
Vercel → Settings → Git → Deploy Hooks → delete the leaked hook, create a new one, update the GitHub secret.
