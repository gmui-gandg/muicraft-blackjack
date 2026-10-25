# MuiCraft Blackjack factory operations

Use the pinned shared Archon SDLC workflows. The local source reference is in
the ignored `.factory/consumer.json`; `factory/pack.json` records the required pin.
Do not copy workflows into this application or edit the cached engine.

## Current status

PRD intake and engine installation are onboarding work. Application implementation,
issue publication, CI automation, and deployment remain pending. See
`docs/ONBOARDING.md` for verified results and live-run status.

The owner authorized normal pinned Archon Codex workers on 2026-10-25. The local
launch brake may be cleared for the supervised backlog attempt. Scheduling must
remain absent. Record the run ID and result in `docs/ONBOARDING.md`; do not treat
engine checks as evidence of a live model run or working application.

Live run `1069f11b-2bbe-4703-a1d2-1c6cb9c53da4` reached `authorize` with twelve
checked proposals and is paused for publication approval. Codex execution is
verified; no issues have been published and no application milestone has run.

## Validation

Ordinary project checks: `python3 harness/ci.py`; the configured npm commands will
fail until M0 supplies Node/npm, package scripts, dependencies, and tests.
Runtime verification is a separate shared workflow with private operator-owned
configuration. Follow `factory/RUNTIME_HOST.md` after a start command and candidate
identity endpoint exist; do not point it at an unrelated checkout.

The PRD's acceptance journeys are in `harness/END-TO-END.md`. Actual independent
holdout scenarios must be authored through the shared holdout workflow and stored
outside this repository in a verifier-only environment. The template's Claude
hooks do not isolate scenarios from Codex. The in-repository holdout file is only
a notice, with no test scenarios.

## First supervised run

Prepare the MVP backlog through `archon-backlog` with `publication=approve`.
Stop at its human publication gate without approving it. Scope the input to MVP;
defer roadmap phases and actual infrastructure/deployment actions. The subsequent
implementation task, once approved, starts with M0 only:
a runnable skeleton, exact local start command, health and candidate identity
endpoints, tests, and production packaging. Keep merge approval mandatory and
discovery publication in preview. Do not publish the backlog, merge, schedule, or
deploy without further authorization.
