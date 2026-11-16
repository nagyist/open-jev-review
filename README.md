# Jev Review

A small local-first code-review workflow built with [OpenJev](https://github.com/alanhuangyoo/OpenJev) or [Kev](https://github.com/jaredpalmer/kev). It can review a Git diff or scan a complete codebase, follows the strongest structured signals through focused model calls, and presents the result in a quiet local dashboard.

![Jev Review dashboard](docs/dashboard.png)

## How It Works

The reviewer keeps orchestration in code and uses a local decision model for bounded judgments:

```text
Noul risk matrix
  -> Choice + Score file profiles
  -> Choice evidence selection
  -> Choice mechanism classification
  -> Score severity
  -> conditional Choice reviewer routing
```

- Exposes separate change-review and complete-codebase entry points.
- Uses changed or related tests as context when judging test gaps.
- Screens correctness, security, reliability, compatibility, and test coverage.
- Selects concrete diff hunks or source regions before scoring impact.
- Uses structured hints, counterexamples, and explicit decision boundaries.
- Applies thresholds and workflow policy in code.
- Shows large reports in collapsible dashboard sections.
- Binds the dashboard to `127.0.0.1` and never serves environment files.

## Quick Start

Requires Node.js 24+, Git, Docker with Compose, and enough memory and disk for the model. The first container start downloads model weights from Hugging Face (the default OpenJev 1.7B weights are approximately 3.5 GB); later starts reuse the named cache volume.

```bash
npm install
cp .env.example .env
# Set REVIEW_PROVIDER in .env to openjev or kev, then:
docker compose up --build -d
```

In another terminal:

```bash
# Review the current Git diff
npm run review:changes:save -- /path/to/git/repository

# Or scan every non-ignored source file under a scope
npm run review:codebase:save -- /path/to/git/repository-or-package
npm run dashboard
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

The container uses CPU inference and serves the 1.7B model by default. It may
take several minutes to download and load; check readiness with
`curl http://127.0.0.1:8009/v1/models`. Stop it with
`docker compose stop` and restart it with `docker compose up -d`.
See [solution.md](solution.md) for model selection, offline use, privacy,
resource requirements, and differences from hosted Jev.

## Provider and Model Selection

Copy `.env.example` to `.env`. OpenJev remains the default; to use Kev, set:

```dotenv
REVIEW_PROVIDER=kev
KEV_BASE_URL=http://127.0.0.1:8009
KEV_MODEL=jaredpalmer/kev-4b@v1.0
```

Use the same startup command for either provider:

```bash
docker compose up --build -d
```

Wait for `curl -f http://127.0.0.1:8009/v1/models` to succeed, then use the
same review commands. Compose defines one model service: changing
`REVIEW_PROVIDER` and rerunning the command replaces it with the selected
provider, rather than starting both. Only that provider's image is built and
its checkpoint loaded. Stop any old manually started model container using
port 8009 before switching to Compose.

| Environment variable | Purpose | Default |
| --- | --- | --- |
| `REVIEW_PROVIDER` | Selects both the client and Compose server: `openjev` or `kev` | `openjev` |
| `OPENJEV_BASE_URL` | OpenJev loopback HTTP origin | `http://127.0.0.1:8009` |
| `KEV_BASE_URL` | Kev loopback HTTP origin | `http://127.0.0.1:8009` |
| `REVIEW_MODEL` | Model name sent in API requests | `openjev-local` / `kev-latest` |
| `OPENJEV_MODEL` | Checkpoint loaded by the OpenJev Docker image | `alanhuangya/OpenJev-1.7B` |
| `KEV_MODEL` | Checkpoint loaded by the Kev Docker image | `jaredpalmer/kev-4b@v1.0` |

`REVIEW_MODEL` is an API name, not a server-side checkpoint switch. Kev serves
its loaded checkpoint under `kev-latest` (also `jev-latest`); change `KEV_MODEL`
and run `docker compose up --build -d` to load different weights. Compose and
the review commands load `.env` automatically. Leave `REVIEW_MODEL` unset
when switching providers to use each provider's default API name.
Compose mounts the selected provider's named model-cache volume to
reuse downloads across container recreation. Volumes still use Docker's data
disk; see [model cache storage](solution.md#model-cache-storage) for a
host-directory alternative.
`REVIEW_PROVIDER` selects the Docker build target and client together.
Invalid providers fail instead of starting another provider; blank API model
names also fail explicitly. There is no remote or cross-provider fallback.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run review:changes -- <path>` | Print a current-diff review as JSON |
| `npm run review:changes:save -- <path>` | Save a current-diff review for the dashboard |
| `npm run review:codebase -- <path>` | Print a complete codebase scan as JSON |
| `npm run review:codebase:save -- <path>` | Save a complete codebase scan for the dashboard |
| `npm run dashboard` | Start the local dashboard |
| `npm run check` | Typecheck, verify dependency flow, syntax-check the dashboard client, and run tests |

## Architecture

Everything lives under `src/`, arranged in layers that only depend downward:

```text
src/
  domain/      config.ts, types.ts, patch.ts   shared policy, report shapes, diff parsing
  adapters/    git.ts, repository-files.ts     change and complete-source discovery
               report-store.ts                 atomic report save/load
  review/      changes.ts, codebase.ts          mode-specific workflows
               *-judgments.ts, workflow.ts     Jev calls and shared staged orchestration
  cli/         review-*.ts, save-*.ts           explicit mode entry points
  dashboard/   server.ts, public/              local-only HTTP server and the plain client
```

Imports point toward lower layers only:

```text
{ cli, dashboard } -> review -> adapters -> domain
```

`scripts/check-dependencies.ts` fails `npm run check` on any upward import, any
import between `cli` and `dashboard`, or any cycle.

## Current Scope

This is an experiment in composing fast typed judgments into a review workflow. It does not yet integrate compiler diagnostics, static analyzers, repository indexing, or generated explanations. Findings are review prompts, not proof of a defect.

## License

[MIT](LICENSE)
