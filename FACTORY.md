# MuiCraft Blackjack factory operations

Use the pinned shared Archon SDLC workflows. The local source reference is in
the ignored `.factory/consumer.json`; `factory/pack.json` records the required pin.
Do not copy workflows into this application or edit the cached engine.

## Current status

PRD intake and engine installation are onboarding work. No application milestone,
AI workflow, issue publication, CI automation, or deployment is complete.
See `docs/ONBOARDING.md` for verified results and blockers.

The local factory launch brake is set. Do not clear it until the owner resolves
the pinned provider's sandbox/approval conflict. Scheduling must remain absent.
No successful workflow run IDs or application runtime evidence exist yet.

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

## First supervised run, when unblocked

The maintainer reviews the PRD interpretation and first task. Start with M0 only:
a runnable skeleton, exact local start command, health and candidate identity
endpoints, tests, and production packaging. Keep merge approval mandatory and
discovery publication in preview. Do not publish a backlog, merge, schedule, or
deploy as part of an unapproved setup diagnostic.
