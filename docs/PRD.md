# MuiCraft Blackjack

**Product Requirements Document (PRD)**  
**Version:** 1.0 — implementation baseline  
**Date:** October 24, 2026  
**Status:** Proposed for development  
**Primary development environment:** VS Code + OpenAI Codex on Windows  
**Source / hosting:** GitHub → self-hosted Coolify on Proxmox

> **Product promise:** A polished, responsive blackjack game that is enjoyable in a desktop browser and on a phone, teaches players the rules through intuitive feedback, and creates a clean foundation for strategy training and multiplayer play. **Entertainment only: virtual chips with no monetary value.**

## 1. Executive summary

### 1.1 Problem and opportunity

MuiCraft Blackjack is the first original application in the MuiCraft games portfolio and a practical end-to-end demonstration of the user's software-development pipeline: build locally using Codex, version code in GitHub, build a Docker image in Coolify, and serve the application on the home network. The product should be pleasant enough to share with family and friends, rather than merely a technical demo.

### 1.2 Goals

1. Deliver a reliable, visually polished single-player blackjack experience across desktop and mobile browsers.
2. Implement one **explicit, testable ruleset** with correct dealer behavior, bankroll changes, and edge cases.
3. Use simple, maintainable frontend architecture and automated tests so Codex can work safely in small iterations.
4. Deploy reproducibly from GitHub to the existing Coolify instance at `192.168.2.10`.
5. Keep the architecture extensible for training analytics and later real-time multiplayer.

### 1.3 Non-goals for MVP

No real-money wagering, deposits, withdrawals, prizes convertible to value, payment processing, user accounts, external leaderboards, multiplayer rooms, live dealer/video, backend API, database, or subscription services. No claim of casino-certified randomness. No insurance, surrender, side bets, or exotic house rules in v1.

### 1.4 Intended audiences

- **Casual player:** Wants a quick game on a phone with intuitive controls and readable cards.
- **Desktop player:** Wants attractive animations, optional keyboard shortcuts, and simple session statistics.
- **Maintainer / builder:** Wants a small project that can be tested, modified by Codex, and deployed predictably through Coolify.

## 2. MVP definition and player journey

### 2.1 Core loop

1. Open the site and view the blackjack table, virtual balance, and betting controls.
2. Choose a wager and press **Deal**.
3. Receive two face-up player cards and a dealer upcard; the dealer hole card is hidden.
4. If neither side has an opening natural blackjack, choose **Hit**, **Stand**, **Double**, or **Split** when eligible.
5. After the player completes all active hands, the dealer reveals the hole card and draws under fixed house rules.
6. Resolve each hand and display win/loss/push, payout, and updated balance.
7. Press **Next Hand** to play again. The settled bankroll is preserved across browser refreshes.

### 2.2 In-scope MVP features

| ID | Requirement | Priority |
|---|---|---|
| MVP-01 | Single-player versus automated dealer; six-deck shoe | Must |
| MVP-02 | Bet placement using preset virtual chips; balance and wager clearly displayed | Must |
| MVP-03 | Deal, Hit, Stand, Double Down, and a single Split (maximum two hands) | Must |
| MVP-04 | Correct blackjack detection, dealer rules, scoring, payouts, and pushes | Must |
| MVP-05 | Responsive card/table layout and pointer/touch/keyboard interaction | Must |
| MVP-06 | Deal, flip, chip, and outcome animations with reduced-motion support | Must |
| MVP-07 | Save settled balance, selected wager, audio/motion preferences locally | Must |
| MVP-08 | Rules/help modal, hand totals, status messages, disabled-action explanations | Must |
| MVP-09 | Unit tests, E2E smoke tests, Dockerfile, README, Coolify deployment | Must |
| MVP-10 | Sound effects toggle and one-step Undo | Won't in MVP |
| MVP-11 | Insurance, surrender, resplitting, tournament rankings | Won't in MVP |

### 2.3 Player experience requirements

- The primary action is obvious at every step; never show an enabled action that the game engine will reject.
- Mobile gameplay must not require hover, precision dragging, or pinch zoom.
- Buttons have a minimum 44 × 44 CSS-pixel touch target and visible disabled states.
- During splits, visually highlight the active hand and keep inactive hands visible.
- Show the dealer's visible total while the hole card is concealed; reveal the final dealer total after its turn.
- Display round results and an unambiguous **Next Hand** action; do not auto-start the next round.
- Support mouse and touch from the outset; keyboard shortcuts: `H` Hit, `S` Stand, `D` Double, `P` Split, `Enter` primary/next action, with shortcuts disabled in dialogs and when ineligible.

## 3. Game rules — normative MVP specification

**Rule profile ID:** `classic-six-deck-s17-v1`. This section is the source of truth for the engine and tests; UI text must reflect these settings.

| Rule | MVP value |
|---|---|
| Game format | Single player versus dealer |
| Decks | Six standard 52-card decks (312 cards); no jokers |
| Shoe / shuffle | Fisher–Yates shuffle at game start; reshuffle before a new round when ≤78 cards remain (approximately 75% penetration); never intentionally reshuffle mid-round |
| Dealer | Hits through 16; **stands on all 17**, including soft 17 (S17) |
| Dealer hole card | One face down; revealed for initial peek resolution or dealer turn |
| Dealer peek | Dealer checks for natural blackjack when showing Ace or any ten-value card, before normal player actions |
| Player blackjack | Unsplit initial two-card Ace + any ten-value card; pays 3:2 |
| Ordinary win / loss / push | Win pays 1:1; loss forfeits wager; equal non-bust totals push |
| Double down | Allowed on any first two cards, including either eligible post-split hand; exactly one additional card, then automatic Stand |
| Split | One split only, creating at most two hands; requires two cards of identical rank (e.g., Q+Q; 10+J is **not** eligible) and funds for the equal additional wager |
| Split aces | Receive exactly one additional card on each hand, then automatically Stand; no resplit |
| Split 21 | Ace + ten-value card after split counts as ordinary 21, **not** a natural blackjack |
| Surrender / insurance / side bets | Not available in MVP |
| Number of player hands | Maximum two per round |
| Betting | Virtual starting bankroll 1,000; minimum wager 10; maximum wager 500 (also capped by available balance); preset chips 10, 50, 100 |
| Chip precision | All bankroll and wager amounts are integers; wagers are multiples of 10, so 3:2 blackjack payouts remain whole numbers |

### 3.1 Card values and hand totals

Number cards count at face value; J/Q/K count 10; Ace counts 11 when that does not bust the hand and otherwise counts 1. A hand is **soft** if at least one Ace currently counts as 11. Hand totals must recompute after every card. Hitting to exactly 21 automatically ends that hand; exceeding 21 busts it immediately. Two cards totaling 21 are natural blackjack **only when they are the original, unsplit opening pair**.

### 3.2 Dealer and opening-natural sequence

- Deal player card, dealer upcard, player card, dealer hole card (animation order may vary only if game-state semantics stay identical).
- Evaluate naturals before displaying the normal action menu. If dealer upcard is Ace or ten-value, check its two-card blackjack immediately (hole card may remain visually hidden until resolution).
- If both player and dealer have natural blackjack: push. If only player has natural blackjack: pay 3:2. If only dealer has natural blackjack: player loses. No Hit/Stand/Double/Split actions occur for these cases.
- Otherwise play all player hands in order, then reveal the hole card and apply S17. If every player hand has busted, settle losses without additional dealer draws.
- For an ordinary non-bust hand, compare against final dealer total. Any surviving hand wins when dealer busts.

### 3.3 Split and double details

- Split converts the opening hand into two one-card hands, deducts a second equal wager, and deals one additional card to each. The first hand becomes active; after its resolution the second hand becomes active.
- Each non-ace split hand may Hit, Stand, or Double. Further Split is unavailable. A split-Ace hand is auto-finished after its single drawn card.
- Double requires an unused first-two-card decision and enough uncommitted bankroll for the additional wager; it increases that hand's stake by its original amount and deals exactly one card.
- Action eligibility must be enforced in the **game engine**, not solely by disabling UI controls.

### 3.4 Bankroll and settlement examples

Treat placing a wager as committing chips from the **in-round** balance. After settlement, return stakes and winnings as follows. With a 10-chip wager:

| Outcome | Return to balance at settlement | Net round result |
|---|---:|---:|
| Ordinary win | 20 chips (stake 10 + profit 10) | +10 |
| Natural blackjack | 25 chips (stake 10 + profit 15) | +15 |
| Push | 10 chips (stake returned) | 0 |
| Loss / bust | 0 | −10 |

If balance is less than the minimum bet, display an explicit **Reset Virtual Bankroll** action, requiring confirmation. No chips are purchasable, transferable, redeemable, or convertible into real value. Settlement of split hands is independent; a round can contain both winning and losing hands.

### 3.5 State machine and error handling

Recommended deterministic states: `BETTING → DEALING → PLAYER_TURN → DEALER_TURN → SETTLEMENT → ROUND_COMPLETE`. Handle opening blackjack and all-bust short circuits. Maintain active hand index, shoe, stakes, card ownership, available balance, action history, and completed-hand flags in a single typed game state. Reject illegal transitions without mutating state. UI animations must not determine game outcomes.

Persist **only the last fully settled bankroll and preferences** in MVP. If the page reloads during an unfinished hand, restart at betting using the last committed settled bankroll rather than accidentally treating an unfinished stake as a completed loss or win. Inform the player that the unfinished hand was discarded. Keep game state versioned so later releases can migrate local storage safely.

## 4. Visual design and graphics direction

### 4.1 Look and feel

Premium, modern casino-table aesthetic—**not** a cluttered slot-machine interface. Use restrained animation, realistic card proportions, softly textured felt, clear typography, subtle shadows, and polished chips. Avoid copying casino branding or relying on proprietary card artwork.

| Token / element | Specification |
|---|---|
| Felt surface | Deep emerald `#0C5A43`, with subtle non-distracting radial texture |
| Background | Dark forest / charcoal `#0B1F1C` |
| Accent | Muted champagne gold `#D9BE7A` |
| Cards | Warm ivory `#FAF9F5`, dark ink `#182323`, suit red `#BD373C` |
| Buttons | High-contrast primary gold or emerald; clear secondary/disabled states |
| Typography | Modern sans-serif (system-first); generous numeric readability |
| Cards | SVG suits / CSS-backed vector cards; standard 5:7 ratio; readable ranks at mobile size |
| Chips | Original vector chips with visible denominations and shape/label distinctions |
| Brand | Simple MuiCraft Blackjack wordmark and stylized spade icon |

### 4.2 Layouts

**Desktop (≥1024 px):** centered table with dealer hand above player hands; information rail for bankroll, wager, and round outcome; action bar directly under player cards. **Mobile (320–430 px):** portrait-first stack; dealer at top, player hand(s) center, sticky action strip near bottom and no horizontal scrolling; card overlap/scale only as needed. **Tablet / landscape:** adapt smoothly without requiring separate pages.

### 4.3 Motion, sound, and accessibility

- Deal cards with 150–300 ms sequences, reveal hole card with a short flip, animate chip transfers at settlement.
- Honor `prefers-reduced-motion`; provide near-instant state transitions when enabled.
- Avoid animation blocking gameplay for more than a short transition; do not depend on timing to compute outcomes.
- Color is supplemental: distinguish Win/Loss/Push by explicit text and icons.
- Add semantic buttons, focus indicators, live-region announcements for hand results, meaningful labels for card images, and a keyboard-reachable Help dialog.
- Sound effects are optional for MVP: if introduced, start muted and provide a persistent mute setting.

## 5. Technology and architecture

### 5.1 Recommended MVP stack

| Layer | Technology | Rationale |
|---|---|---|
| UI | React + TypeScript (strict mode) | Composable responsive components with typed state |
| Build / dev | Vite | Fast local development, production static output in `dist/` |
| Styling | Tailwind CSS or CSS Modules (choose **one**; default CSS Modules) | Predictable, maintainable visual styling without component-library lock-in |
| Motion | CSS transitions and transforms | Minimal dependencies for v1 card/chip animations |
| Core game engine | Pure TypeScript modules, no React imports | Deterministic unit tests and future backend reuse |
| Randomness | Browser `crypto.getRandomValues` + unbiased Fisher–Yates shuffle | Better-quality virtual shuffling; injectable deterministic RNG for tests |
| Unit testing | Vitest | Engine and reducer/action tests |
| Component testing | React Testing Library | UI eligibility, messages, dialog behavior |
| Browser testing | Playwright | Desktop/mobile smoke and interaction tests |
| Lint / formatting | ESLint + Prettier | Consistent Codex-generated changes |
| Runtime / hosting | Multi-stage Dockerfile: Node build stage → Nginx static runtime on port 80 | Reproducible Coolify deployment; small production image |
| Source control | GitHub | Issues, PRs, versioned releases |
| Deployment | Coolify localhost server on Proxmox | Build from repository, route via Traefik |
| Persistence | localStorage for settled bankroll/preferences | No database or auth required |

The static Nginx process **inside the game container** serves built files; it is distinct from your separate **Nginx Proxy Manager**. Coolify's Traefik routes LAN requests to the application's container. The Vite development/preview server must **not** be used as the production server.

### 5.2 Suggested repository structure

```text
muicraft-blackjack/
├── AGENTS.md                 # Codex project instructions and boundaries
├── docs/
│   ├── PRD.md               # This document: product/rules source of truth
│   ├── RULES.md             # Concise rules distilled from section 3
│   └── DEPLOYMENT.md        # Coolify, DNS, rollback, operations
├── public/                  # Manifest and original/static assets
├── src/
│   ├── app/                 # App root and global navigation
│   ├── components/          # Table, card, chip, controls, dialogs
│   ├── game/                # Pure deck, scoring, actions, reducer, payouts
│   ├── styles/              # Tokens, layout and animations
│   ├── storage/             # Versioned localStorage adapter
│   └── test/                # Fixtures / helpers
├── e2e/                     # Playwright journeys
├── Dockerfile
├── nginx.conf               # Static assets, SPA fallback, health endpoint
├── .dockerignore
├── package.json
└── README.md
```

### 5.3 Architecture principles

- Model game rules in a side-effect-free engine and treat React as a presentation layer.
- Keep rules and house settings in a typed, immutable config object; show these settings in the Rules modal.
- Inject or stub the deck for deterministic unit tests; never depend on random deals for assertions.
- Separate gameplay events (e.g., `PLACE_BET`, `DEAL`, `HIT`, `STAND`, `DOUBLE`, `SPLIT`, `NEXT_HAND`) from rendering and animation.
- Persist only explicitly approved data; no secret keys or backend credentials in client code.
- No analytics SDK, cookies, tracking pixels, or third-party CDN required for MVP.

## 6. Deployment, infrastructure, and security

### 6.1 Local deployment profile

| Setting | Recommendation |
|---|---|
| Coolify server | Existing `localhost` on VM `coolify1`, `192.168.2.10` |
| Source | GitHub repository; private by default, connected with deploy key or GitHub App |
| Branch | `main` for production; feature branches for active development |
| Build method | Dockerfile from repository root |
| Container port | `80` (static Nginx runtime) |
| Internal domain | `http://blackjack.muitropolis.com` |
| Internal DNS | pfSense DNS host override to `192.168.2.10` |
| Deploy trigger | Manual Coolify Deploy initially; automate later |
| HTTPS / public domain | Optional future `https://blackjack.muicraft.com` using existing external Nginx Proxy Manager |

Because Coolify is LAN-only, GitHub cannot directly reach its local webhook endpoint. **Manual deployment is the MVP path**: push to GitHub, choose Deploy in Coolify, verify the resulting commit. Later automation may use an approved private runner or a deliberately secured ingress path; do not publish the Coolify admin interface just to make webhooks work.

### 6.2 Build and health checks

- Run `npm ci`, `npm run lint`, `npm run test`, and `npm run build` before merging to `main`.
- Multi-stage Dockerfile compiles the static site and copies `dist/` into a minimal Nginx image. Pin dependency versions and commit the lockfile.
- Nginx listens internally on port 80, serves `/` and static assets, and returns 200 from `/healthz`.
- In Coolify, expose container port 80, set the correct hostname, deploy, and inspect deployment/runtime logs.
- Before going public, verify headers, cache strategy, compression, TLS via NPM, backup/rollback procedure, and that no admin pages are exposed.

### 6.3 Security and responsible-use requirements

- Display “For entertainment only — virtual chips, no cash value” within Help/About.
- No real currency, deposits, payouts, financial prizes, purchase links, or monetized chips.
- Never store private keys, Coolify `.env`, tokens, or passwords in the repository.
- Player bankroll is local and user-modifiable; **do not** present it as a tamper-resistant tournament score.
- When multiplayer is added, migrate deck, wagers, and outcomes to server-authoritative logic.

## 7. Acceptance criteria and test plan

The MVP is complete only when all release gates pass:

| ID | Acceptance criterion |
|---|---|
| AC-01 | A new player can place a bet and complete a round using touch or mouse without instructions. |
| AC-02 | Dealer stands on soft 17 and draws on 16 or below for all tested deck permutations. |
| AC-03 | Natural blackjack 3:2; ordinary win 1:1; losses, pushes, and dealer busts correctly settle bankroll. |
| AC-04 | Split/double only appear when eligible and cannot be invoked illegally through reducer calls. |
| AC-05 | Splitting aces auto-finishes after one additional card; split 21 is not paid as natural blackjack. |
| AC-06 | Dealer/player opening blackjack cases settle before player actions become available. |
| AC-07 | Browser refresh outside a round preserves last settled bankroll/preferences; mid-round refresh safely restores last settled state. |
| AC-08 | Layout is usable at 320, 375, 390, 768, and 1440 px widths; no horizontal page scroll. |
| AC-09 | Keyboard operation, visible focus, and reduced-motion mode work; labels are understandable without color alone. |
| AC-10 | Unit, UI, and Playwright smoke tests pass, including injected-card edge cases. |
| AC-11 | A fresh Git clone builds locally and via Coolify Dockerfile without manual file edits or runtime secrets. |
| AC-12 | `http://blackjack.muitropolis.com` loads on LAN and `/healthz` returns HTTP 200 after deployment. |

**Required deterministic test hands:** (1) Ace+King natural versus dealer non-natural; (2) both natural; (3) dealer natural only; (4) Ace+6 dealer soft 17 stands; (5) Ace+5 dealer hits; (6) player Ace+9+5 totals 15; (7) double yields exactly one card; (8) split aces each one card; (9) split 21 pays 1:1; (10) 10+J cannot split; (11) insufficient balance disables double/split; (12) multi-hand push/win/loss settlement; (13) shoe reshuffle before round at threshold; (14) refresh while wager is unsettled.

## 8. Post-MVP roadmap

| Phase | Purpose | Planned functionality | Key architecture change |
|---|---|---|---|
| **0 — MVP** | Playable polished solo game | Fixed rules, betting, Hit/Stand/Double/Split, chips, mobile UI, local balance, tests, Coolify deploy | React/Vite static app only |
| **1 — Polish & PWA** | Better mobile retention | Install-to-home-screen, offline cached shell, optional sound, advanced animations, themes, tutorial, optional insurance/surrender/configurable rules | PWA manifest/service worker; rules config expanded |
| **2 — Strategy Trainer** | Educational differentiation | Basic-strategy table for selected rules; hint before action; correct/incorrect feedback; trainer drills; progress and error breakdown by hand type | Strategy matrices keyed by ruleset; local analytics, optionally IndexedDB |
| **3 — Accounts & Leaderboards** | Cross-device identity | Optional sign-in, synced practice progress, non-monetary achievements, server-stored statistics, daily challenges | API, PostgreSQL, authentication and migrations |
| **4 — Multiplayer Tables** | Shared live play | Join room by code, 2–5 seats, shared dealer/shoe, per-seat decisions, turn timers, presence/reconnect, spectator mode | Server-authoritative game engine, WebSockets, room/state persistence |
| **5 — Advanced Play** | Long-term extensibility | Tournaments, custom house rules, analytics dashboards, private game rooms, spectator replay, AI practice dealer personalities | More robust scaling, observability, admin tooling |

### 8.1 Strategy-training specifications (Phase 2)

- Define a **specific ruleset-aware** basic-strategy chart; no generic “always Hit on 16” advice.
- Distinguish hard totals, soft totals, and pairs; recommend Hit/Stand/Double/Split only among actions legally available in the current state.
- Show optional hints **before** the player acts, and a short explanation **after** the decision.
- Provide training modes: guided game, quiz/drill, and normal play without hints.
- Track counts, accuracy, and categories locally; explain that basic strategy minimizes expected loss under a defined ruleset and does not guarantee winning.
- Verify strategy tables against a reputable source or independent calculation for the exact implemented house rules; no untested AI-generated recommendations.

### 8.2 Multiplayer specifications (Phase 4)

- Up to five seated players; a room host can create an invite code and choose house settings.
- Every client sees the same dealer hand, table, and round progress; hands are private/public as dictated by game rules, not by client trust.
- Server owns shuffling, shoe order, bets, turn advancement, outcomes, timestamps, and validation.
- Broadcast typed state events over WebSockets; implement heartbeat, reconnect, idempotent actions, turn timeouts, and room cleanup.
- Shared table bankrolls remain **virtual only**. Add abuse/rate-limit protection and authoritative settlement tests.
- Use Coolify to deploy frontend, backend, and PostgreSQL as separate resources or a Compose-defined stack. Keep the game engine isolated so its rule tests can run on the server.

## 9. Codex execution plan

Codex should not attempt the entire roadmap in one change. Work as a small series of reviewable implementation milestones, with local tests and a running application at each major step.

| Milestone | Deliverable | Review gate |
|---|---|---|
| M0 — Scaffold | React/TypeScript/Vite app; lint/format/test scripts; baseline README and Dockerfile | `npm ci`, `npm run build`, local page loads |
| M1 — Engine | Types, deck/shuffle, scores, state transitions, payouts, seeded fixtures | Deterministic rules tests pass |
| M2 — Playable UI | Table, cards, betting, action controls, outcomes, responsive layout | Finish a round on desktop and mobile |
| M3 — Full MVP rules | Double, single split, S17, natural handling, bankroll restore | All rules/edge-case acceptance tests pass |
| M4 — Production UX | Motion, help/accessibility, reduced motion, errors, mobile layout | Playwright smoke on defined viewports |
| M5 — Deployment | Docker build, static Nginx config, health endpoint, Coolify deployment docs | LAN URL serves game; health check 200 |

### 9.1 Working agreement for Codex

- Read `docs/PRD.md` and `AGENTS.md` before planning changes. Treat section 3 as normative.
- For each milestone, summarize intended files and test cases, then implement, run tests, and report results.
- Prefer a small diff with passing tests; ask before changing the ruleset, architecture, or accepting significant new dependencies.
- Do not silently invent new game rules, cash features, backend services, or networking exposure.
- Do not deploy automatically until the maintainer approves the first release; preserve a manual Coolify deployment workflow.
- Write README setup instructions and document any deliberate deviation from the PRD.

### 9.2 Suggested first Codex prompt

> Read `docs/PRD.md`. Implement only milestone M0 (scaffold). Create a React + TypeScript + Vite project with strict TypeScript, CSS Modules, Vitest, React Testing Library, Playwright scaffolding, ESLint/Prettier, a production multi-stage Dockerfile that serves Vite's `dist/` through Nginx on port 80, and a `/healthz` endpoint. Add `.gitignore`, `.dockerignore`, `AGENTS.md`, and a README. Do not implement game mechanics yet. Run lint, tests, and build; report exact command results and any tradeoffs. Do not touch my Proxmox host, Coolify settings, router, or secrets.

## 10. Decisions and open questions

The document intentionally fixes the MVP rules to avoid ambiguity. These items can be decided later without blocking initial implementation:

1. **Public access:** Keep `blackjack.muitropolis.com` LAN-only initially; decide whether/when to publish `blackjack.muicraft.com` through NPM.
2. **Branding:** Final logo, background texture, card back design, and sound assets may evolve after core rules pass tests.
3. **Rule variants:** Insurance, surrender, configurable split limits, and H17 variants belong after MVP; introduce them only with new tests and explicit ruleset identifiers.
4. **Leaderboard trust:** Browser-stored scores are suitable for solo play but not meaningful verified rankings; defer rankings until a backend exists.

## 11. Official implementation references

- Coolify — Deploy a public GitHub repository: https://coolify.io/docs/applications/sources/github/public-repository
- Coolify — GitHub source methods: https://coolify.io/docs/applications/sources/github/overview
- Coolify — Choose a deployment method: https://coolify.io/docs/applications/choose-deployment-method
- Vite — Build for production: https://vite.dev/guide/build
- Vite — Deploy a static site (note that `vite preview` is not a production server): https://vite.dev/guide/static-deploy.html

---

**Release principle:** Ship a small, correct, enjoyable Blackjack game first. Extend it only after the initial rules engine, mobile UX, and Coolify deployment are verified end to end.
