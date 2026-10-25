# Factory onboarding

Date: October 24, 2026. Execution host: `factory1`, non-root account `gmui`.
Application directory: `/home/gmui/build/muicraft-blackjack`.

## Scope and interpretation

The owner supplied `MuiCraft_Blackjack_PRD.md` after selecting this repository for
factory onboarding. Its content is preserved verbatim in `docs/PRD.md`.
Embedded operational prompts are examples, not authorization to implement M0,
publish issues, deploy, or change infrastructure.

Use the PRD's recommended React/strict TypeScript/Vite/CSS Modules stack, pure
TypeScript engine, Vitest/React Testing Library, and Playwright. The primary
development host is now `factory1`; the PRD's Windows environment description is
historical context, not a request to move execution. Production packaging remains
Node-build/Nginx Dockerfile as specified, but Docker installation and Coolify
deployment are deferred. The repository is currently public; its PRD's private-by-
default recommendation has not been applied as a visibility change.

Sound is listed as both optional and excluded in the PRD. Use its explicit MVP-10
exclusion: no sound in MVP; retain versioned preferences and reduced-motion support.

## Planned milestones

| Milestone | Acceptance before moving on |
| --- | --- |
| M0 | Runnable React/Vite skeleton, lockfile, finite meaningful tests, lint/format/type/build scripts, loopback-only development start command, health and candidate identity paths, production Dockerfile and README. No game mechanics. No CI workflow or deployment without separate approval. |
| M1 | Pure engine types, shoe, scoring, transitions, settlement, deterministic fixtures and tests. |
| M2 | Complete ordinary rounds through responsive UI with visible stakes/outcomes. |
| M3 | Double/split/S17/natural/persistence edge cases and all deterministic rules tests. |
| M4 | Motion, Help, accessibility, keyboard/reduced-motion and defined viewport coverage. |
| M5 | Production container verification and deployment documentation; actual LAN deployment only with approval. |

Each is a separate reviewed task. No backlog or issues have been published.
Node/npm are not yet installed; M0 will require an approved official user-level
Node installation and package dependency selection before its checks can run.

## Provider compatibility blocker

Factory checkout: `17b81cde22347320abcf5a9ff70a2dd2fc53998a`.
Pinned Archon: `8249e4665488361ba8cdb80aecede44d72be333d` (package version 0.11.1).

At that pin, `packages/providers/src/codex/provider.ts`, lines 1071–1073, explicitly
starts normal Codex threads with `sandbox: 'danger-full-access'` and
`approvalPolicy: 'never'`. `packages/providers/src/codex/app-server.ts`, around
line 290, declines provider-initiated approval requests. Its typed provider config
does not expose a sandbox/approval override. A repository config entry alone
cannot preserve the required sandbox policy against these explicit parameters.

This conflicts with the owner's instruction to preserve Codex sandbox controls.
No provider workflow or live AI call will be executed in this state. The local
factory launch brake must remain set; it is a launch safeguard, not an OS sandbox.
The pinned source has not been patched and Codex user configuration is unchanged.

The safe next step is a reviewed upstream-compatible change that supports the
desired sandbox policy, with a separate explicit revision and tests if needed.
Do not silently patch the immutable cache, weaken AppArmor, or replace the pin.
Workflow merge approval does not substitute for tool execution approvals.

## Independent verification and readiness

The factory's Claude-only holdout fence does not isolate data from Codex. Actual
private scenarios need a verifier-only environment, outside the builder's readable
checkout and account scope. The template example is replaced with a notice only;
runtime inputs point to no private scenario until isolation is arranged.

Before the first run: review this interpretation and mission, establish the initial
Git base, resolve provider safety, validate model/account access, approve M0's task,
and arrange independent scenario handling. Do not declare that engine doctor/list
success proves authentication, containment, or application correctness.

The first task must declare the real start command and health/identity endpoints.
Prepare runtime configuration only after those are known. Calibrate runtime checks
with a substantive baseline, relevant deliberate fault, and wrong-identity control.
Keep scheduling, automatic merge, issue publication, and deployment disabled.

## Validation performed

- Factory `init`: passed; pinned source and workflow definitions validated.
- `python3 factory/consumer.py doctor`: exit 0; exact pin verified and twenty
  shared workflows discovered/validated. The Claude hook self-check passed in this
  checkout and reported that its files are not committed/pushed yet. This does
  not prove a Codex holdout fence; no such fence is supported by this pin.
- `python3 factory/consumer.py list`: exit 0; twenty shared workflows listed.
- Local launch brake: set with the documented `halt` command; scheduling and
  trigger files are absent. No AI workflow was launched.
- `python3 harness/ci.py`: exit 1, `GATE_FAILED: static`, because `npm` is missing.
  This is an unimplemented application prerequisite, not a failing game test or
  passing application gate. No application tests, build, or browser checks ran.
- PRD byte comparison: identical to the supplied attachment (SHA256
  `fc4ea43fdd27ec227af6449e32214cabcc2fcb1c3b878cca354d3c4f2c387900`).
- Prepared JSON, relative Markdown links, ignore rules, credential-pattern checks,
  and replacement of application example markers: passed.
- Cached Archon source: clean. No upstream source, Codex user configuration, SSH,
  AppArmor, or sandbox policy was modified.

The engine uses Bun dependencies installed with the frozen upstream lockfile.
The factory's shell hooks invoke `python`; a user-owned
`/home/gmui/.local/bin/python` symlink to `/usr/bin/python3` was added for them.
Python remains 3.12.3; the OS Python installation is unchanged.
