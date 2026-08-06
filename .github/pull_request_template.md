## What changed

<!-- Summarize the outcome and keep the PR focused. -->

## Why

<!-- Link the issue, ticket, ADR, or accepted requirement. -->

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Additional relevant local verification is described below

## Boundaries and safety

- [ ] No secret, credential, real endpoint, or unmasked personal data was committed
- [ ] No real write, send, pause, retry, cutover, or production reconfiguration was introduced
- [ ] Integrations remain mock-only unless an approved ADR and cutover explicitly say otherwise
- [ ] Jobs remain inventory-only; no production cron was changed
- [ ] `packages/*` do not import `apps/*`, and `apps/web` and `apps/api` communicate only through HTTP plus `packages/shared`
- [ ] New or changed mutable agent behavior is locally audited through the agreed contracts

## Handoff / review notes

<!-- List commits, commands run, risks, follow-ups, and the reviewers needed. -->
