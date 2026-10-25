# MuiCraft Blackjack

A planned responsive, single-player blackjack game using virtual chips with no
cash value. The implementation baseline is [the PRD](docs/PRD.md).

This branch prepares factory onboarding. It contains no playable application yet.
Do not treat the PRD's suggested implementation prompt as an executed milestone.

- [Mission and scope](MISSION.md)
- [Onboarding status, blockers, and milestone plan](docs/ONBOARDING.md)
- [Validation journeys](harness/END-TO-END.md)
- [Factory operations](FACTORY.md)
- [Project guidance](AGENTS.md)

The planned stack is React, strict TypeScript, Vite, CSS Modules, Vitest, React
Testing Library, and Playwright. M0 will add package scripts and a lockfile;
`npm ci` and application checks cannot run until that scaffold exists.

Factory checks, from this repository after local installation:

```bash
python3 factory/consumer.py doctor
python3 factory/consumer.py list
```

These commands validate the engine and workflow definitions; they do not run an
agent or prove the game's behavior. The owner authorized the pinned provider's
normal non-root full-access workers for supervised runs on October 25, 2026.
The initial live attempt prepares an MVP backlog and stops for publication approval.
No schedules, automation, merges, or deployments are enabled.
