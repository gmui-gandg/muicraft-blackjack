# MuiCraft Blackjack project guidance

Read `docs/PRD.md`, `MISSION.md`, and `engineering.md` before planning work.
PRD section 3 and rule profile `classic-six-deck-s17-v1` govern game behavior.

## Scope and architecture

- Implement one reviewed milestone at a time. Begin with M0 only after its task is
  approved; the PRD's example prompt is context, not authorization to implement it.
- Use React, strict TypeScript, Vite, CSS Modules, and CSS motion. Keep game rules
  in pure TypeScript without React imports. Use deterministic deck injection in tests.
- Preserve six decks, S17, opening peeks, natural 3:2, same-rank single split,
  one-card split aces, split 21 at 1:1, and engine-enforced action eligibility.
- Persist only settled bankroll and versioned preferences; discard unfinished
  rounds on reload with an explanation. Do not add real-money features.
- Accounts, backend/database, multiplayer, strategy training, and other roadmap
  phases require a new approved scope. Do not introduce them for extensibility.

## Development and validation

- Work on feature branches and open pull requests. Never merge automatically.
- Target `factory1` as non-root `gmui`; develop in this application repository.
  The infrastructure repository and shared factory checkout have separate roles.
- At M0, provide `npm ci`, `npm run lint`, `npm run format:check`,
  `npm run typecheck`, `npm run test` (finite Vitest run), `npm run build`,
  `npm run check` (lint, format, types, build), and `npm run test:e2e`.
- Include meaningful tests for the delivered milestone. Run relevant checks and
  report exact results, missing prerequisites, and checks not run.
- Do not relax tests or label unimplemented PRD journeys as passing. There is no
  application or package manifest in the initial factory onboarding change.
- A Dockerfile is a future code deliverable; Docker installation, image execution,
  and deployment require their own authorized scope.

## Safety and factory operation

- Preserve SSH, AppArmor, and Codex sandbox/approval controls. Do not bypass them
  or modify pinned Archon source as a workaround.
- No changes to Coolify, Proxmox, pfSense, DNS, other VMs, firewall, or public access.
  No schedulers, GitHub Actions/webhooks, unattended publication, or deployments.
- Never commit keys, tokens, local runtime configuration, or authentication caches.
- Use documented shared Archon SDLC workflows for factory AI work. Do not launch a
  workflow until the Codex provider compatibility blocker in `docs/ONBOARDING.md`
  is resolved. Local factory launches are halted meanwhile.
- Codex has no enforcement from the template's Claude-only holdout hooks. Keep
  actual holdout scenarios outside the repository and builder-readable workspace.
  Do not read or author private scenarios as the builder.
- Changes to governance, PRD, factory code, verification harness, or provider
  configuration require owner review. Request approval for destructive operations,
  privilege changes, security changes, or changes to the ruleset/architecture.
