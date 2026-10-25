# MuiCraft Blackjack factory operations

Use the pinned shared Archon SDLC workflows. The local source reference is in
the ignored `.factory/consumer.json`; `factory/pack.json` records the required pin.
Do not copy workflows into this application or edit the cached engine.

## Current status

PRD intake, engine installation, and approved backlog publication are complete.
The M0 scaffold provides the application shell and local checks. Gameplay, CI
automation, and deployment remain pending. See README.md for current setup and
validation, and `docs/ONBOARDING.md` for historical onboarding results.

The owner authorized normal pinned Archon Codex workers on 2026-10-25. The local
launch brake may be cleared for the supervised backlog attempt. Scheduling must
remain absent. Record the run ID and result in `docs/ONBOARDING.md`; do not treat
engine checks as evidence of a live model run or working application.

Live run `1069f11b-2bbe-4703-a1d2-1c6cb9c53da4` completed after explicit owner
approval of its publication gate. Twelve tickets were published as GitHub issues
#2–#13 and independently verified for exact bodies, markers, and dependencies.
Codex execution is verified. M0 delivery and independent review are tracked in
https://github.com/gmui-gandg/muicraft-blackjack/pull/14.

## Validation

Ordinary project checks: `python3 harness/ci.py`; install the scaffold prerequisites
and dependencies described in README.md before running it.
Runtime verification is a separate shared workflow with private operator-owned
configuration. Follow `factory/RUNTIME_HOST.md` after a start command and candidate
identity endpoint exist; do not point it at an unrelated checkout.

The PRD's acceptance journeys are in `harness/END-TO-END.md`. Actual independent
holdout scenarios must be authored through the shared holdout workflow and stored
outside this repository in a verifier-only environment. The template's Claude
hooks do not isolate scenarios from Codex. The in-repository holdout file is only
a notice, with no test scenarios.

## First supervised run

The MVP backlog was prepared through `archon-backlog` with `publication=approve`
and published only after the owner approved the native gate. Roadmap phases and
actual infrastructure/deployment actions remain deferred. The subsequent
implementation task, once approved, starts with issue #2 / M0 only:
a runnable skeleton, exact local start command, health and candidate identity
endpoints, tests, and production packaging. Keep merge approval mandatory and
discovery publication in preview. Do not publish the backlog, merge, schedule, or
deploy without further authorization.
