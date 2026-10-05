# Agent guide — plugga-os

This guide is the operating contract for humans and coding agents contributing to
the repository. Read the accepted [ADRs](adr/README.md) before changing platform
boundaries, persistence, authentication, integrations, channels, audit behavior,
or jobs.

## Non-negotiable safety boundary

All Block A work is local or CI-only. Do not access, write to, configure, send
through, pause, retry, migrate, or cut over any real Bitrix, OMIE, PluggaMob/OCPP,
PagBank, WhatsApp, Telegram, OpenClaw, cron, or production service.

- Never commit secrets, credentials, real endpoints, production payloads, or
  unmasked personal data. Use `.env.example` placeholders only.
- Real customer data (CNPJ, CPF, consumer-unit numbers, customer names) never goes
  into git, specs or docs. Use the synthetic range documented in
  `specs/002-fundacao-solida/quickstart.md`; CI runs `scripts/scan-dados-cliente.mjs`
  and fails on a hit.
- All integration registrations and adapters are `mock`. No production SDK or
  real network adapter belongs in Block A.
- WhatsApp and Telegram handlers are no-op mocks. They may validate and audit a
  local request, but must never deliver a message.
- Jobs are an inventory only. There is no real scheduler control, pause, retry,
  migration, or cutover.
- A future real read, write, send, or cutover requires its own approved decision,
  feature gate, operational approval, and review before code is enabled.

If a request crosses this boundary, stop and escalate it to the ORCHESTRATOR and
ARCHITECT before making changes.

## Repository boundaries

The repository is a pnpm + Turborepo monorepo:

```text
apps/web        Next.js application
apps/api        NestJS modular monolith
packages/shared Framework-free contracts, DTOs, enums and event names
packages/config Shared tooling configuration only
```

Dependency rules:

1. `apps/*` may depend on `packages/*`; `packages/*` never import `apps/*`.
2. Web and API do not import one another. They communicate over HTTP using
   contracts from `packages/shared`.
3. API modules expose intentional public interfaces. Do not import another
   module's controller, repository, Prisma client, or internal implementation.
   Only `*repository*` implementations may import `PrismaService`; every consuming
   Nest module must import `PrismaModule` explicitly.
4. Block A contains only health/config, core auth/RBAC abstractions, audit,
   mock integrations, and job inventory. Do not add a business domain without an
   approved plan.
5. Do not add Kafka, Kubernetes, microservices, or an external queue/broker.

## Spec-driven development (Spec Kit)

Features are specified with [GitHub Spec Kit](https://github.com/github/spec-kit).
The project rules that every plan is checked against live in
[`.specify/memory/constitution.md`](../.specify/memory/constitution.md); they
summarize this guide and the accepted ADRs.

```text
.specify/memory/constitution.md   project principles (the gate for every plan)
.specify/templates/               spec, plan, tasks and checklist templates
.specify/scripts/bash/            helper scripts called by the skills
.claude/skills/speckit-*/         Claude Code skills (/speckit-specify, ...)
specs/NNN-short-name/             one folder per feature: spec.md, plan.md, tasks.md
```

Flow for a new feature or relevant change (small obvious fixes skip it):

1. `/speckit-specify <what and why>` creates `specs/NNN-short-name/spec.md`.
2. `/speckit-clarify` when the spec has open questions; record owner decisions
   with their date.
3. `/speckit-plan <stack and constraints>` writes `plan.md` (plus `research.md`,
   `data-model.md`, `contracts/`, `quickstart.md` when useful) and runs the
   Constitution Check.
4. `/speckit-tasks`, then `/speckit-analyze` to catch gaps before coding.
5. `/speckit-implement`, then `/speckit-converge` until it reports converged.
6. Open the PR citing the spec folder; the usual gates below still apply.

Specs are written in Brazilian Portuguese. A decision that changes platform
boundaries, persistence, auth, integrations, audit or jobs still becomes an ADR
in `docs/adr/`; the spec links to it. Completed feature folders are historical
records: later changes open a new feature. To change the principles, run
`/speckit-constitution` and review the diff like any other governance change.

Other agents can use the same `.specify/` files: install the CLI with
`uv tool install specify-cli` and add an integration with
`specify integration install <key>` (e.g. `codex`, `cursor-agent`).

## Local workflow

1. Copy the public placeholders: `cp .env.example .env`.
2. Install the Node version from `.nvmrc` and enable Corepack.
3. Run `corepack install` followed by `pnpm install --frozen-lockfile`.
4. Start local dependencies with `docker compose up -d`.
5. Follow the root README for migrations, seed, development, and health checks.

Protected local endpoints use the development auth stub only when
`DEV_AUTH_ENABLED=true`. Supply a synthetic identity through `x-dev-principal`
and comma-separated roles through `x-dev-roles`. These headers carry no secret
and are never production authentication.

Before handing work off, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run narrower package tests while iterating, but the root commands are the Gate B
contract. Sanitize any log or screenshot before sharing it.

## Branch flow: `develop` and `main`

Decision of the owner (2026-10-05): work lands on `develop`; `main` is production.

- Every change branch is created from `develop` and its pull request targets `develop`.
  CI must be green. Merging into `develop` never publishes anything.
- `main` only receives a promotion pull request `develop` → `main`, one per delivered
  slice or coherent block, listing what goes with it. The owner approves and merges it.
  That merge is what triggers the `Deploy` workflow.
- `main` is protected on GitHub (required pull request, required CI check, no force
  push) and the `production` environment requires the owner's approval (tasks T025 and
  T026, owner-only settings).
- Urgent fixes for production may target `main` directly, then `main` is merged back
  into `develop` right away.
- Migrations, `[VPS]`/`[DONO]` tasks and history rewrites still need the owner's explicit
  approval, on whichever branch they land.

## Change discipline

- Keep commits and pull requests small and scoped to one package or concern.
- Preserve unrelated work in a shared or dirty worktree.
- Update `packages/shared` first when an HTTP contract changes, then update its
  consumers without importing application internals.
- Treat `event_log` and `agent_actions` as append-only. Corrections are new
  records, not mutations of audit history.
- Use UTC timestamps in storage. Calendar behavior and presentation use
  `America/Manaus`.
- Seed and fixtures must be synthetic and contain no credentials.
- Never run a migration against a non-local database from this repository.

## Handoff format

Every implementation handoff must include:

- branch name and commit hashes;
- changed files or pull requests and their purpose;
- exact verification commands and results;
- migrations or local setup steps, if any;
- interpretations, deviations, unresolved risks, and blockers;
- an explicit readiness statement for the next owner.

The ARCHITECT must review platform boundary, schema, auth, integration, audit, or
job-control changes before they are merged to `main`.
