# MuiCraft Blackjack mission

Derived from `docs/PRD.md` v1.0, October 24, 2026. This onboarding interpretation
requires owner review before the first factory run.

## Product

Deliver a correct, polished, responsive single-player blackjack game for casual
desktop and mobile players. Explain legal actions, totals, and outcomes clearly;
let the player choose when to start the next round. Chips are entertainment-only,
with no monetary value. MVP is a static browser application with local persistence.

## MVP capabilities

- A six-deck S17 game with opening naturals, peeks, Hit, Stand, eligible Double,
  one same-rank Split, split-ace restrictions, and independent hand settlement.
- A 1,000-chip starting bankroll; wagers from 10 to 500 in multiples of 10,
  capped by available balance; preset chips 10, 50, and 100.
- Accessible responsive controls, clear outcomes, rules/help, keyboard shortcuts,
  and motion that honors reduced-motion preferences.
- Versioned local storage of settled bankroll and preferences, with safe recovery
  after an interrupted round.
- Deterministic unit/component tests, browser smoke tests, and production build
  packaging. Infrastructure deployment remains separately approved.

## Permanent boundaries

No deposits, purchases of chips, withdrawals, cash-value rewards, redeemable prizes,
or conversion of chips to money or transferable value. Do not claim casino-certified
randomness or that a playing strategy guarantees wins. Later features must remain
consistent with the entertainment-only product promise.

## Excluded from this MVP

These are release limits, not permanent rejection of the PRD roadmap:

1. Accounts, login, synced profiles, and leaderboards.
2. Backend services, remote databases, and subscriptions.
3. Multiplayer, rooms, live dealers, video, and tournaments.
4. Insurance, surrender, side bets, resplitting, and alternate rulesets.
5. Strategy hints, training drills, and analytics dashboards.
6. PWA/offline work, sound effects, Undo, and themes beyond the core design.
7. Public exposure, automatic deployment, unattended scheduling, and automatic merges.

## Invariants

- Rule profile `classic-six-deck-s17-v1` and PRD section 3 are normative.
- Use unbiased crypto-backed Fisher–Yates shuffling in production and injected
  deterministic cards/RNG for tests. Never determine outcomes through animations.
- Reject illegal engine actions without mutating state. Recompute ace values and
  legal actions after every transition. Never pay split 21 as a natural.
- Persist the last settled bankroll, never a partially resolved stake. Explain a
  discarded unfinished hand; require confirmation to reset a depleted bankroll.
- Keep the engine independent of React. Use CSS Modules, not a second styling
  framework. No tracking SDK or third-party CDN is needed for MVP.
- Governance and verification changes require human review. Do not let a factory
  run rewrite its own rules, review gates, tests, or protected paths to pass.

## Definition of done

Each milestone includes relevant passing static, unit/component, and browser
checks with observable evidence. Full MVP acceptance requires AC-01 through AC-12,
including all fourteen deterministic cases in the PRD. Deployment acceptance is
pending until the maintainer separately authorizes deployment and verifies it.
The full product journeys must be labeled as future acceptance until implemented;
onboarding and M0 alone do not satisfy them.
