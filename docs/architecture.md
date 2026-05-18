# Signal Force Architecture

A real-time decision intelligence platform. One engine that turns customer signals into adaptive decisions across security, personalization, and engagement. The product is the engine, not any single feature.

## TL;DR

- **Rules-first**, AI when needed. 90% of decisions resolve via deterministic rules in memory. AI gets called only when rules abstain or when a novel pattern shows up.
- **Tiered storage**: browser, edge KV, Lambda memory, Redis, DAX, DynamoDB, S3. Reads collapse at the cheapest tier they can.
- **Three apps share one engine**: customer surface, decision engine, studio (admin + insights + AI rule proposer).
- **The studio loop closes the system**: AI runs nightly on the audit trail, suggests new rules, admin approves, rules go live, AI cost drops as rule coverage grows.
- **Hackathon stack** (now): three CDK stacks, single Lambda, DynamoDB, Bedrock Haiku 4.5, CloudWatch dashboard. Deployed and working.
- **Production stack** (post-event): split lanes, edge KV, Redis, Kinesis, batch pipeline. Roadmap below.

## Vision

Every customer interaction on a loyalty platform is a decision. Show a promotion or not. Flag a transfer or not. Greet with a personalized nudge or stay quiet. Today these decisions live in silos: fraud team owns one, marketing owns another, CRM owns a third. Signal Force unifies them.

A single engine watches the activity stream. Rules evaluate first, cheaply. AI handles novelty. Every decision is auditable. The studio shows the marketing team what is happening and lets them tune rules without a deploy. Over time the system gets smarter and cheaper at the same time.

## System overview

The full picture, all three apps, all the storage tiers, the studio loop, edge cache, batch pipeline, audit lake. This is where the platform is heading. The demo runs a tractable subset.

```mermaid
flowchart TB
  subgraph CustomerLayer["Customer surface"]
    direction LR
    Browser[Browser SPA<br/>localStorage cache]
    AppMobile[Mobile app<br/>future]
    SDK[Embedded SDK<br/>future]
  end

  subgraph EdgeLayer["Edge"]
    direction LR
    EdgeKV[(Edge KV<br/>per-user profile<br/>~10ms)]
    EdgeCache[CloudFront / Akamai<br/>cached decisions<br/>cached promotions]
    EdgeBot[Bot drop<br/>Akamai EdgeWorkers]
  end

  subgraph IngestLayer["Ingest"]
    direction LR
    API[API Gateway<br/>HTTP API]
    Stream[Kinesis Data Streams<br/>activity events]
  end

  subgraph EngineLayer["Decision engine"]
    direction TB
    Router[Decision router<br/>signal severity scorer]
    subgraph HotLane["Hot lane (~90% of traffic)"]
      direction LR
      LH[Lambda or Fargate<br/>warm rules cache]
      Rules[(Rule cache<br/>in-memory)]
      RedisHot[(Redis<br/>decision cache)]
      LH --- Rules
      LH --- RedisHot
    end
    subgraph WarmLane["Warm lane (~5-10%)"]
      direction LR
      LW[Lambda<br/>+ Bedrock client]
      PromptCache[(Prompt cache<br/>Anthropic feature)]
      LW --- PromptCache
    end
    subgraph ColdLane["Cold lane (batch)"]
      direction LR
      Glue[Glue / Step Functions<br/>nightly jobs]
    end
    Router --> LH
    Router --> LW
    Router --> Glue
  end

  subgraph StorageLayer["Storage"]
    direction LR
    DAX[(DAX<br/>DDB accelerator)]
    DDB[(DynamoDB<br/>UserProfile<br/>UserSession<br/>UserActivity<br/>DecisionStore<br/>UserState<br/>Promotion<br/>Rule)]
    S3[(S3 audit lake)]
    DAX --- DDB
    DDB -.->|Firehose| S3
  end

  subgraph AILayer["AI"]
    direction LR
    Bedrock[Bedrock<br/>Claude Haiku 4.5<br/>Converse API]
    BedrockPT[Bedrock<br/>Provisioned Throughput<br/>at scale]
    Bedrock --- BedrockPT
  end

  subgraph StudioLayer["Studio (admin + insights)"]
    direction TB
    StudioUI[Admin SPA<br/>/admin route]
    RuleEditor[Rule editor]
    Insights[Insights dashboard<br/>graphs from S3]
    Proposer[AI rule proposer<br/>weekly batch]
    StudioUI --- RuleEditor
    StudioUI --- Insights
    StudioUI --- Proposer
  end

  subgraph NotifyLayer["Notifications"]
    direction LR
    SNSFraud((SNS<br/>fraud alerts))
    SNSBudget((SNS<br/>budget alerts))
    Email[Email subscriptions]
    SNSFraud --> Email
    SNSBudget --> Email
  end

  subgraph ObsLayer["Observability"]
    CW[CloudWatch<br/>dashboards + alarms]
    Budgets[AWS Budgets<br/>25 / 100 / 200 USD]
  end

  Browser -->|reads| EdgeKV
  Browser -->|HTTPS| EdgeCache
  AppMobile -->|HTTPS| EdgeCache
  SDK -->|HTTPS| EdgeCache
  EdgeCache --> EdgeBot
  EdgeBot --> API
  API --> Router
  Browser -.->|emit events| Stream
  Stream --> Router

  LH --> DAX
  LW --> DAX
  LH --> DDB
  LW --> DDB

  LW --> Bedrock
  Glue --> Bedrock
  Glue --> S3

  StudioUI -->|reads| DDB
  StudioUI -->|reads| S3
  Proposer --> Bedrock
  Proposer --> DDB

  LW -->|HOLD or FLAG| SNSFraud
  Budgets -->|threshold| SNSBudget

  LH -.->|metrics| CW
  LW -.->|metrics| CW
  Router -.->|metrics| CW
```

The diagram is intentionally dense. Read it in three passes:

1. Follow a customer event: Browser to Edge to API to Router to Hot Lane to DDB and back.
2. Follow a suspicious event: same up to Router, then Warm Lane to Bedrock to SNS plus DDB write.
3. Follow the studio loop: DDB to S3 to Proposer to Bedrock to suggested rules to Studio UI to admin approval to Rule table to next request hot-lane evaluation.

## Three apps

```
+--------------------+      +---------------------+      +----------------------+
| Customer surface   |      | Decision engine     |      | Studio (admin+ops)   |
|                    |      |                     |      |                      |
| Renders decisions: |<---->| Returns typed       |<---->| Rule editor          |
| popups, nudges,    | API  | response per event: | API  | Promotion editor     |
| holds, offers.     |      | { risk, offers,     |      | Insights graphs      |
|                    |      |   nudge, action }   |      | AI rule proposer     |
| Bonvoy app in prod |      |                     |      | Audit log            |
| SPA in demo.       |      | Rules-first, LLM    |      |                      |
+--------------------+      | only when rules     |      | SPA /admin route     |
                            | abstain.            |      +----------------------+
                            +---------------------+
```

| App | Built where (demo) | Built where (production) |
|---|---|---|
| Customer surface | `apps/frontend/` `/login`, `/dashboard` routes | Bonvoy app or SDK embedded on partner sites |
| Decision engine | `apps/backend/src/handler.js` Lambda | Split into hot + warm + cold lanes, see below |
| Studio | `apps/frontend/src/pages/admin/` route in same SPA | Separate app, Cognito-protected |

## Rules-first engine: AI when needed, not by default

The central insight. Most decisions are not novel. Past patterns repeat. Make rules first-class.

### Flow

```mermaid
flowchart TB
  Req[Decision request<br/>/decisions/evaluate]
  Req --> Hot{Decision cache<br/>hit? Redis}
  Hot -->|yes| ReturnCached[Return cached decision]
  Hot -->|no| LoadRules[Load rules from in-memory cache<br/>refresh from DDB every 10 min]
  LoadRules --> Evaluate[Evaluate rules in priority order<br/>each rule returns:<br/>match + confidence + action]
  Evaluate --> Confident{Any rule<br/>matches with<br/>high confidence?}
  Confident -->|yes ~90%| Det[Deterministic decision<br/>typed response]
  Confident -->|no ~10%| NeedsLLM[Call Bedrock Converse<br/>with structured prompt<br/>= user context + matched rules + ambiguity reason]
  NeedsLLM --> LLMOut[LLM returns:<br/>action + nudge text + rationale]
  Det --> WriteAudit[Write DecisionStore<br/>rule_matched + score + action]
  LLMOut --> WriteAudit
  WriteAudit --> CacheStore[Store in Redis<br/>5 min TTL]
  CacheStore --> Respond[Return to caller]
  ReturnCached --> Respond
```

### Rule shape

Rules live in a `Rule` DDB table. JSON shape:

```json
{
  "ruleId": "r_high_velocity_transfer",
  "version": 3,
  "priority": 100,
  "active": true,
  "trigger": "transactions/transfer",
  "conditions": [
    { "field": "context.transfersLast1h", "op": "gt", "value": 5 },
    { "field": "context.amount", "op": "gt_multiple_of_user_avg", "value": 10 }
  ],
  "action": "HOLD",
  "confidence": 0.95,
  "nudge_template": "We paused this transfer for review. Please verify in app.",
  "createdBy": "admin@signal-force",
  "createdAt": "2026-05-19T10:00:00Z",
  "stats": { "matched_30d": 412, "false_positive_rate": 0.02 }
}
```

Rule evaluator walks each active rule for the trigger in priority order. If all conditions match and confidence >= threshold (default 0.85), the engine returns the rule's action deterministically. Otherwise it falls through to the warm lane.

### Why this saves money

- **Real-time AI calls drop by 90%**. From 100M/day to ~10M/day in the optimized model.
- **Rule changes do not require code deploys**. Admin edits a rule in the studio, the engine picks it up within 10 minutes.
- **Decisions are explainable**. Every audit row says which rule fired or why the LLM was called.
- **A/B testing rules is trivial**. Toggle `active`, observe stats, revert if needed.

## Storage tiering

The cost story is shaped by storage as much as compute. Most reads stop early.

```mermaid
flowchart LR
  C[Browser] -->|free, instant| L1[(localStorage<br/>UI state<br/>recently shown offers<br/>preferences)]
  C -->|~10ms| L2[(Edge KV<br/>per-account profile<br/>tier, segment<br/>~$0.10/M reads)]
  L2 --> L3[(Lambda in-memory<br/>active rules<br/>active promotions<br/>refreshed every 10 min)]
  L3 --> L4[(Redis ElastiCache<br/>decision cache<br/>promotion match cache<br/>5 min TTL)]
  L4 --> L5[(DAX<br/>DDB accelerator<br/>microsecond reads)]
  L5 --> L6[(DynamoDB<br/>permanent state<br/>UserProfile, UserSession,<br/>UserActivity, DecisionStore,<br/>UserState, Promotion, Rule)]
  L6 --> L7[(S3 audit lake<br/>via Firehose<br/>~$0.023/GB)]
```

| Tier | Use for | Cost per million reads | Latency |
|---|---|---|---|
| Browser localStorage | UI state, last 10 actions, preferences, recently shown offers | $0 | instant |
| Edge KV | User profile, tier, segment, eligibility cache | ~$0.10 | ~10ms |
| Lambda in-memory | Active rules, active promotions | $0 (free during warm) | ~1ms |
| Redis | Decision cache, promotion match cache | ~$0.50 | <5ms |
| DAX | UserProfile, UserState hot reads | ~$1.00 | microsecond |
| DynamoDB | Audit, writes, less-frequent reads | ~$1.25 reads / $1.25/M writes | ~5-10ms |
| S3 | Audit lake, analytics raw | ~$0.40 | seconds (Athena) |

What does not move:
- **Trust signals** (geo, device fingerprint, fraud flags) live server-side only. Never trust the browser.
- **Audit trail** is append-only on DDB, replicated to S3 via Firehose.
- **Rules and promotions** are server-side authoritative. Browser only caches the rendered decision, not the rule.

## Studio loop: AI improving rules over time

This is the loop that compounds value. AI cost drops as rule coverage grows.

```mermaid
flowchart LR
  DDB[(DecisionStore<br/>+ UserActivity)] -->|nightly Firehose| S3[(S3 analytics)]
  S3 --> Glue[Glue ETL<br/>feature engineering]
  Glue --> Patterns[Pattern extraction<br/>frequent novel decisions<br/>that called LLM]
  Patterns --> Propose[Bedrock<br/>analyze patterns,<br/>propose rule candidates]
  Propose --> Suggest[Suggested rules<br/>+ insight summary<br/>+ projected coverage]
  Suggest --> StudioUI[Studio UI<br/>admin review queue]
  StudioUI -->|approve| RuleDDB[(Rule table)]
  StudioUI -->|reject + reason| RejectLog[(Rejected suggestions<br/>feed back to model)]
  RuleDDB -.->|cold start reload| Engine[Decision engine<br/>next request]
  Engine -.->|new audit data| DDB
```

The loop:

1. Engine writes every decision to DecisionStore (rule_matched, LLM_called, action, latency, cost).
2. Nightly Firehose batches DDB writes into S3.
3. Glue extracts patterns from cases that hit the LLM (these are the novel cases that we paid for).
4. A separate Bedrock call (cold lane, batch) analyzes the clustered novel cases and proposes new rule candidates with projected coverage and confidence.
5. Studio UI shows the admin a queue of suggested rules with stats: "this rule would have handled 412 of the last 1000 LLM-called decisions with 95% confidence, saving an estimated $X/month."
6. Admin reviews, approves, or rejects with a reason (rejection feeds back into the proposer).
7. Approved rules go live. Engine picks them up on the next 10-min cache refresh.
8. The next batch of audit data shows fewer LLM calls. Loop tightens.

The studio is also where the AI generates **insights graphs**:
- Decision volume per surface, per action
- Rule hit rate per rule (which rules earn their keep)
- Novel pattern frequency over time (is the world changing?)
- Fraud catch rate vs false positive rate
- Promotion conversion by segment

## Demo architecture (what we ship for the hackathon)

A tractable subset of the full picture. Three CDK stacks. One Lambda. No edge KV, no Redis, no Kinesis. Rules cached in Lambda memory. LLM called when rules abstain.

```mermaid
flowchart LR
  subgraph Surfaces["Customer + Studio (same SPA)"]
    SPA[Browser SPA<br/>customer routes]
    Admin[Browser SPA<br/>/admin route]
  end

  SPA -->|HTTPS| API[API Gateway<br/>HTTP API]
  Admin -->|HTTPS| API
  API --> Lambda[Lambda handler.js<br/>Node 18 arm64<br/>rules cache in memory]

  Lambda --> UP[(UserProfile)]
  Lambda --> US[(UserSession)]
  Lambda --> UA[(UserActivity TTL)]
  Lambda --> DS[(DecisionStore)]
  Lambda --> ST[(UserState)]
  Lambda --> PROM[(Promotion)]
  Lambda --> RULE[(Rule)]

  Lambda -->|when rules abstain| Bedrock[Bedrock Claude Haiku 4.5]
  Lambda -->|fraud HOLD or FLAG| SNS((SNS fraud alerts))
  SNS --> Email[demo inbox]

  Lambda -.-> CW[CloudWatch dashboard]
  Budgets[AWS Budgets] -.-> BudgetSNS((SNS budget))
  BudgetSNS --> Owner[owner inbox]
```

Seven DynamoDB tables now: the original five plus `Promotion` and `Rule`. Both new tables land in the next runtime-stack PR.

## Production architecture (where this grows)

The shape it takes at Bonvoy scale.

```mermaid
flowchart TB
  subgraph EdgeProd["Edge"]
    Akamai[Akamai EdgeWorkers<br/>bot drop, cached decisions]
    EdgeKV[(Edge KV<br/>per-account profile)]
  end

  subgraph IngestProd["Ingest"]
    APIProd[API Gateway HTTP API]
    K[Kinesis Data Streams<br/>activity events]
  end

  subgraph RouterProd["Router"]
    R[Lambda router]
  end

  subgraph EngineProd["Engine lanes"]
    direction TB
    Hot[Fargate hot lane<br/>warm rules + Redis]
    Warm[Lambda warm lane<br/>+ Bedrock + prompt cache]
    Cold[Glue / Step Functions<br/>nightly batch]
  end

  subgraph StoreProd["Storage"]
    direction LR
    DAXProd[(DAX)]
    DDBProd[(DynamoDB)]
    RedisProd[(Redis)]
    S3Prod[(S3 audit lake)]
  end

  subgraph AIProd["AI"]
    BedrockProd[Bedrock<br/>Provisioned Throughput]
    SageMakerProd[SageMaker Feature Store<br/>+ custom small model<br/>for fraud classification]
  end

  Akamai --> EdgeKV
  Akamai --> APIProd
  APIProd --> R
  APIProd --> K
  K --> R
  R --> Hot
  R --> Warm
  R --> Cold
  Hot --> RedisProd
  Hot --> DAXProd
  Warm --> DAXProd
  Warm --> BedrockProd
  Cold --> S3Prod
  Cold --> BedrockProd
  DAXProd --> DDBProd
  DDBProd -.->|Firehose| S3Prod
  Cold --> SageMakerProd
  SageMakerProd --> Warm
```

What changes:
- **Edge layer added**: Akamai EdgeWorkers + Edge KV for per-account profile cache.
- **Engine split**: Fargate for the hot lane (warm rule cache, persistent Redis connections). Lambda for the warm LLM lane (sporadic, fine to cold-start). Glue for cold batch.
- **DAX in front of DDB**: microsecond reads on the hot tables.
- **Bedrock Provisioned Throughput**: commit to a base TPS for 30-70% discount.
- **SageMaker Feature Store**: real-time features for fraud classification, fed by Kinesis.
- **Custom fraud model on SageMaker**: trained on DecisionStore replay set, replaces some Bedrock calls with cheaper inference for the well-understood fraud branch.

## Cost model

### Demo (1k API calls over the event)

| Service | Cost |
|---|---|
| Lambda, API Gateway, DynamoDB (all free tier) | $0.00 |
| Bedrock Claude Haiku 4.5 (500 calls) | ~$0.80 |
| SNS, CloudWatch, S3 (free tier) | $0.00 |
| AWS Budgets | ~$0.10 |
| **Total** | **~$1.00** |

The $250 cap is not at risk. Even 10x volume lands under $5.

### Production (Bonvoy scale, 200M members, 100M decisions/day)

Naive (everything goes to LLM):

| Lane | Calls/day | Per-decision | Yearly |
|---|---|---|---|
| Naive LLM on every call | 100M | $0.001 | $36.5M |

That is the naive number. Now apply the architecture:

| Layer | Daily | Yearly |
|---|---|---|
| Edge + browser cache (50% of reads stop here) | $50 | $18K |
| Lambda + rules in-memory (~90% of decisions resolve here) | $5,000 | $1.8M |
| Lambda + LLM (~5-10% of decisions, novel cases) | $1,000 | $365K |
| DAX + DDB | $500 | $182K |
| Redis | $300 | $110K |
| Glue + nightly Bedrock for pattern mining + rule proposing | $500 | $182K |
| S3 + Athena audit | $200 | $73K |
| Infra (Lambda, Kinesis, networking) | $500 | $182K |
| **Total raw** | **$8,050** | **~$2.9M** |

Apply further optimization:
- **Bedrock Provisioned Throughput** on the warm lane: 30-50% off LLM. Saves ~$150K/year.
- **Prompt caching** (Anthropic feature): 50% hit rate. Saves ~$100K/year.
- **Studio loop reducing LLM share** from 5% to 2% over 6 months: saves ~$220K/year.
- **Tighter rule coverage** in well-understood domains (fraud, basic personalization): saves ~$100K/year.

**Realistic optimized total: $2.0M to 2.5M per year** for the entire decision layer at full Bonvoy scale.

For context: enterprise loyalty programs lose tens to hundreds of millions per year to fraud alone. Personalization revenue lift typically 5-15% of conversion. Either alone covers this number many times over. The studio loop means the LLM share, the largest single cost line, shrinks over time as the system learns its patterns.

## Endpoints (demo set)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Username + password, Basic Auth client cred |
| POST | `/auth/mfa` | Static OTP verification |
| GET | `/dashboard` | User summary, recent activity, recent decisions |
| POST | `/transactions/transfer` | Points transfer with fraud check |
| **POST** | **`/decisions/evaluate`** | **Unified endpoint, takes user + event + context, returns `{ risk, offers, nudge, action, ruleMatched, llmCalled }`** |
| GET | `/admin/decisions` | Audit trail of recent decisions |
| GET | `/admin/rules` | List active rules |
| POST | `/admin/rules` | Create or update a rule |
| GET | `/admin/promotions` | List promotions |
| POST | `/admin/promotions` | Create or update a promotion |
| GET | `/admin/insights` | AI-generated insights (graphs data, suggested rules) |

`/decisions/evaluate` is the central endpoint. It replaces three separate calls (fraud check, offers, nudge) with one and returns whether a rule fired or the LLM was called. The studio uses the same audit data to compute insights.

## Decision flows

### Unified evaluate, rules-first

```
client                Lambda                       DDB                              Bedrock        SNS
  | POST /decisions/evaluate { userId, event, context }
  +-------------------->| check Redis decision cache (5 min TTL)
  |                     |   hit -> return cached, done
  |                     |   miss:
  |                     | load rules from in-memory cache
  |                     |   if stale (>10 min) reload from Rule table
  |                     +---------------------------->|
  |                     |<----------------------------+
  |                     | read UserState, recent UserActivity
  |                     +---------------------------->|
  |                     |<----------------------------+
  |                     | evaluate rules in priority order
  |                     |
  |                     | if any rule matches with confidence >= 0.85:
  |                     |   action = rule.action
  |                     |   nudge = rule.nudge_template
  |                     |   offers = match Promotion table by user segment
  |                     |   write DecisionStore (rule_matched=ruleId)
  |                     |   cache in Redis
  |                     |   skip LLM
  |                     |
  |                     | else (rules abstain, ~10% of cases):
  |                     |   call Bedrock Converse ----------------------------------->|
  |                     |   prompt = compact context + matched-but-low-confidence rules + ambiguity reason
  |                     |   response = { action, nudge, rationale, suggested_rule_pattern }
  |                     |<-------------------------------------------------------------+
  |                     |   write DecisionStore (rule_matched=null, llm_called=true)
  |                     |   if action in (HOLD, FLAG):
  |                     |     publish to fraud-alert SNS -------------------------------------->|
  |                     |   cache in Redis
  |                     |
  |                     +-------------------------->| write DecisionStore
  |<--------------------+ 200 { risk, offers, nudge, action, decisionId, ruleMatched, llmCalled }
```

### Studio nightly rule proposing

```
cron (1:00 AM UTC)
  -> Glue ETL job: read S3 audit lake, extract decisions from last 24h where llm_called=true
  -> bucket by similarity (event type, action, context cluster)
  -> for each bucket with size > N (e.g., 50 cases):
       -> Bedrock call: "given these 50 cases, propose a rule that would handle them deterministically. Return JSON {conditions, action, confidence, projected_coverage}"
       -> write proposal to RuleSuggestion table with status=PENDING
  -> studio UI shows pending suggestions to admin
       -> approve: write to Rule table, set status=APPROVED
       -> reject + reason: keep in suggestions with status=REJECTED, feeds back to next batch prompt
```

### Admin live rule edit

```
admin                 Lambda                       DDB
  | PUT /admin/rules/r_high_velocity_transfer { ... }
  +-------------------->| validate JSON shape
  |                     | PutItem on Rule table (version bumps)
  |                     +---------------------------->|
  |<--------------------+ 200 { ruleId, version }

The change is live for new requests within 10 minutes (rule cache refresh interval).
A hot-reload endpoint can be added later if real-time is needed.
```

## Stacks

Three CDK stacks. All on `main`.

| Stack | Status | Contents |
|---|---|---|
| `signal-force-dynamodb` | built | UserProfile, UserSession, UserActivity (TTL), DecisionStore, UserState. **Promotion** and **Rule** tables added in next runtime-stack PR. |
| `signal-force-budgets` | built | 3 monthly budgets (25 / 100 / 200 USD) with SNS email alerts |
| `signal-force-runtime` | built | Lambda + HTTP API + IAM + Bedrock perms + fraud-alert SNS topic + CloudWatch dashboard |

## Service selection (demo stack)

### Compute: Lambda Node.js 18 arm64

For the demo. For production the hot lane moves to Fargate (warm rule cache, persistent Redis connections, no cold starts). Lambda stays for the warm LLM lane and the cold batch jobs.

Python is the next major rewrite for the engine (better Powertools, SageMaker integration, larger LLM ecosystem). Not for the demo.

### API: API Gateway HTTP API

HTTP API, not REST. Cheaper, faster, sufficient.

### Storage: DynamoDB on-demand

Seven tables (existing five plus Promotion and Rule). PAY_PER_REQUEST. RemovalPolicy.DESTROY for the demo. Production flips to RETAIN and adds DAX.

### LLM: Bedrock Claude Haiku 4.5 via Converse API

- Model ID: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (US cross-region inference profile).
- Called only when rules abstain or on the nightly studio batch.
- Production adds Provisioned Throughput at scale.

### Frontend hosting

S3 static hosting for the demo. CloudFront optional polish.

## Decision log

Each decision is closed. Reopening requires written rationale in a PR description.

1. **CDK TypeScript over CloudFormation YAML.** Type safety, L2 constructs, cdk diff workflow.
2. **HTTP API over REST API.** Cheaper, faster, sufficient.
3. **Single Lambda for the demo, tiered compute at scale.** Hot lane to Fargate, warm to Lambda, cold to Glue.
4. **Bedrock Claude Haiku via Converse API.** Cheap at hackathon scale, optimizable with Provisioned Throughput at production scale.
5. **Static MFA OTP over Cognito for the demo.** Half day saved. Cognito JWT (no MFA) is the next upgrade.
6. **Rules-first engine. AI when rules abstain.** 90% of decisions resolve via deterministic rules. LLM share drops over time as the studio loop adds rules.
7. **Three apps, one repo, one backend, two frontends (or two routes).** Customer + studio share the SPA in the demo. Production splits.
8. **Node.js for the demo, Python at the next major rewrite.** Better ML/LLM ecosystem.
9. **No Step Functions, Kinesis, EventBridge in the demo.** All correct at scale. None earn complexity at demo traffic.
10. **Tiered storage: browser, edge KV, Lambda memory, Redis, DAX, DDB, S3.** Reads stop at the cheapest tier they can.
11. **Studio AI runs in batch, not real-time.** Nightly pattern mining and rule proposing. Admin approval gate before live.
12. **Pre-cached LLM outputs over real-time LLM** for personalization. Daily batch generates offer variants per segment. Render-time pick is deterministic.

## Hackathon scope vs out-of-scope

In scope for the demo:

- Unified `/decisions/evaluate` endpoint with rules-first evaluation
- `Rule` and `Promotion` DDB tables, in-memory rule cache in the Lambda
- Studio SPA route with audit log, rule editor, promotion editor
- AI insights panel in the studio (one Bedrock call generates a written insight on the current audit data)
- Three demo scenarios (clean user, suspicious transfer, admin rule change taking effect live)

Intentionally out of scope, listed so the next person knows:

- Cognito User Pools with TOTP MFA (half day, no judge value)
- CloudFront + WAF in front of HTTP API (no L2 construct for HTTP API)
- Akamai EdgeWorkers + Edge KV (production only)
- Redis ElastiCache (production only, demo runs without)
- DAX (production only, demo runs without)
- Kinesis Data Streams (production only)
- Step Functions for transfer review workflows
- SageMaker Feature Store + custom fraud model (production only)
- Bedrock Provisioned Throughput (production only)
- Nightly batch pipeline for rule proposing (production only, demo runs a mock that returns a pre-canned suggestion)

## Operational notes

- Region: us-east-1.
- Bedrock model access must be enabled in the Bedrock console for Anthropic Claude Haiku 4.5 in us-east-1 before the Lambda can call it.
- Set `BUDGET_ALERT_EMAIL` and `FRAUD_ALERT_EMAIL` before `cdk deploy`.
- Confirm both SNS subscription emails after the first deploy.
- CloudWatch log groups have 1-day retention by default.
- Rule cache TTL in Lambda is 10 minutes. Set lower for faster admin feedback during the demo.

## Post-event upgrade path

Order of work if this becomes a real product:

1. Add `Promotion` and `Rule` tables to the dynamodb stack.
2. Implement rule evaluator in Lambda with in-memory cache + 10-min refresh.
3. Build the studio SPA route with rule editor + audit viewer + insights panel.
4. Split the engine: hot lane to Fargate, keep warm on Lambda.
5. Add Redis ElastiCache for the decision cache.
6. Add DAX in front of DDB.
7. Cognito User Pools for real auth on customer and admin surfaces.
8. Kinesis Data Streams for activity ingestion. Firehose to S3 for audit lake.
9. Nightly Glue + Bedrock pipeline for rule proposing.
10. SageMaker Feature Store. Custom fraud classifier trained on DecisionStore replay set.
11. CloudFront + WAF in front of customer surface. Akamai EdgeWorkers if Marriott already runs Akamai.
12. Bedrock Provisioned Throughput.
13. Secrets Manager + KMS for credentials and at-rest encryption.
14. Multi-region failover. Year two.

## References

- API Gateway HTTP API + Lambda + DynamoDB: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-dynamo-db.html
- Bedrock Converse API + cost attribution: https://docs.aws.amazon.com/bedrock/latest/userguide/cost-management.html
- Bedrock Provisioned Throughput: https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html
- Anthropic prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- DDoS resiliency whitepaper: https://docs.aws.amazon.com/whitepapers/latest/aws-best-practices-ddos-resiliency/protecting-api-endpoints-bp4.html
- CDK API reference: https://docs.aws.amazon.com/cdk/api/v2/
- DAX: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.html
- json-rules-engine (one option for the rule evaluator): https://github.com/CacheControl/json-rules-engine
