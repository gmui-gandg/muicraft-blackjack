# MuiCraft Blackjack

A responsive single-player blackjack game with virtual wagering, Deal, Hit, Stand,
settlement and explicit Next Hand, backed by the pure TypeScript engine. The
original spade and CSS artwork use no external assets or fonts. For entertainment
only — virtual chips, no cash value.

## M1 card, shoe, and scoring primitives

`src/game` contains pure TypeScript primitives for `classic-six-deck-s17-v1`.
`createCards()` creates six standard
decks with 312 immutable cards identified by deck, suit, and rank. `shuffle()`
uses Fisher–Yates with crypto-backed rejection sampling; a `Uint32Source` can
be injected for deterministic tests.

`new Shoe()` shuffles a fresh six-deck shoe. `new Shoe(cards)` copies a unique
injected sequence and draws from its front. Injection rejects duplicate deck/suit/rank
identities. `draw()` transfers one card out of the shoe, returning `undefined` on
exhaustion without reshuffling. The caller
must handle exhaustion; it never duplicates or fabricates a card.
`prepareForRound(source?)` is exclusively a between-round operation: it replaces
the shoe with a shuffled full six-deck set at 78 or fewer remaining cards and
retains order above that threshold. The round engine owns when to call it;
ordinary draws never invoke it.

`scoreHand(cards)` recomputes total, softness, and bust status. Natural detection
requires explicit `original` or `split` provenance: only original two-card 21
qualifies.
The immutable settings contain only the profile ID, six-deck count, and reshuffle
threshold used by these primitives; the round engine applies the fixed wager,
dealer, and payout rules from PRD section 3.

## M1 ordinary-round engine

`createGame(shoe?)` in `src/game/round.ts` starts a 1,000-chip session.
`transition(state, event, nextUint32?)` returns `{ accepted: true, state }` or
`{ accepted: false, state: originalState, reason }` with a typed rejection reason.
`eligibility(state, event)` exposes the same
phase and wager rules for controls. Double and Split return `NOT_IMPLEMENTED`.
The engine has no React, animation, clock, storage, or DOM dependency.

Select a wager with `PLACE_BET` (10–500 in multiples of 10, capped by balance),
then `DEAL`. Selection reserves no money; Deal deducts the stake once and uses
`Shoe.prepareForRound` before distributing player/upcard/player/hole card. To
inject an opening sequence, pass a `Shoe` with more than 78 cards; shorter shoes
are replenished by the fixed threshold policy. Inject a `Uint32Source` into
`transition` for deterministic boundary shuffles. `Shoe.snapshot()` copies the
remaining sequence so transitions do not mutate the source shoe or input state.

Opening naturals settle immediately, including required Ace/ten-value peeks.
Otherwise `HIT` or `STAND` drives `PLAYER_TURN`; 21 completes the hand and bust
settles immediately without dealer draws. After a surviving hand completes,
`DEALER_TURN` runs the dealer to S17 and enters `SETTLEMENT`; `SETTLE` pays once
and enters `ROUND_COMPLETE`. These explicit engine events do not depend on UI
animation completion. `NEXT_HAND` moves table cards to discards and clears the wager without drawing or
reshuffling; the subsequent Deal applies the shoe boundary policy, clearing
discards when the full shoe is replenished.

State owns remaining cards, discards, dealer cards, the one original hand and stake,
active hand index, completion, balance, and accepted-event history. A completed
round includes outcome and returned chips: natural 2.5× stake, win 2×, push 1×,
loss 0×. Rejected events preserve state identity and history. History records
accepted commands; automatic natural/bust settlement is part of that command.
An exhausted injected mid-round shoe rejects the draw atomically, without
reshuffling. Double and Split remain pending M3. The playable UI connects these engine events.

## M2 table presentation

`src/components/Table.tsx` accepts supplied balance, wager, hand totals, cards,
active-hand index, settlement values, eligibility explanations and callbacks.
It imports no engine code and calculates no totals, outcomes or accounting.
Concealed cards render a separate back with no rank/suit data in the DOM.
Original SVG suits and CSS chips use no external assets. Controls use native
buttons, accessible rejection descriptions and visible keyboard focus.

The main app mounts `PlayableRound`, which uses engine eligibility for each additive
10/50/100 chip and action. `dispatchRound` is the shared typed event boundary;
it advances dealer play and settlement immediately through engine transitions.
Presentation receives totals and settlement values; it never decides payouts.
Action positions stay stable so rapid repeated clicks cannot turn Deal into Hit
or Stand into Next Hand. Below 10 chips, Reset Virtual Bankroll uses the browser's
accessible confirmation: cancel preserves chips, confirm starts at exactly 1,000.

Reload persistence is pending M3. Reloading discards any unfinished hand and starts
a fresh 1,000-chip session; no unsettled or settled money is stored yet.
The development-only `/e2e/fixtures/round.html?scenario=win` entry mounts the same
playable component with deterministic injected state. Other scenarios are `loss`,
`push`, `dealer-bust`, `player-natural`, `both-natural`, `dealer-natural`, `low`, and
`reset`. Neither this entry nor its fixture data is imported by the production app.
The test-only entry `/e2e/fixtures/table.html?scenario=two-hands` serves supplied
presentation data through the local development server. Other scenarios are
`betting`, `Win`, `Loss`, and `Push`. This entry is outside the production build;
there are no fixture selectors or debug controls on the product page.

RTL tests cover callbacks, native disabled behavior, supplied outcomes and card
concealment. Browser fixtures measure all five widths, target sizes, card ratios,
keyboard focus and two-hand layout. To save JSON observations and screenshots
outside the checkout, set `M2_EVIDENCE_DIR` when running `npm run test:e2e`.
Fixture coverage is independent of the engine and is not playable-round coverage.

## Local development

Use Node 24 (verified with **v24.22.1**) and npm (verified with **11.19.1**).
Direct dependencies are pinned; `package-lock.json` records the dependency tree.

```bash
npm ci
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173`. The exact factory startup argv is:

```json
[
  "node",
  "node_modules/vite/bin/vite.js",
  "--host",
  "127.0.0.1",
  "--port",
  "{port}",
  "--strictPort"
]
```

Replace `{port}` with an available TCP port, for example:

```bash
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
```

The process binds IPv4 loopback only and fails if that port is occupied.
`/` serves the React shell; `/healthz` returns HTTP 200 with the exact text `ok`;
`/build-id` returns HTTP 200 with the exact `FACTORY_RUNTIME_CANDIDATE` string when
provided, otherwise the checkout's full Git HEAD. Health and identity do not
redirect and use `Cache-Control: no-store`. Identity has no added newline.
Without either an injected candidate or Git metadata, startup/build fails.

Identity is captured once per process/build: restart and rebuild after changing
commits. Do not reuse a server or `dist/` from an earlier revision as delivery
evidence. When `FACTORY_RUNTIME_STATE` is provided, Vite writes its cache under
`FACTORY_RUNTIME_STATE/vite`. Otherwise it uses a unique OS temporary directory,
cleaned on normal Vite closure. Caller-supplied state is never deleted by the app;
the caller owns cleanup after exit. Forced termination can leave temporary files.
The CommonJS Vite config avoids the bundled ESM config loader's temporary writes
in source/dependencies. Builds intentionally generate `dist/`.

Reload persistence remains pending M3: no localStorage, cookies, service worker,
or database. Runtime data/cache belongs under `FACTORY_RUNTIME_STATE`. Tests use
fresh owned state/processes and fresh browser contexts for each attempt.

## Checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
npm run check
npx playwright install chromium
npm run test:e2e
python3 harness/ci.py
```

- `lint`: ESLint for application, tests, and tooling.
- `format:check`: Prettier for this scaffold and README; protected guidance is excluded.
- `typecheck`: strict TypeScript for application, tests, and tooling, including the CJS config.
- `test`: finite `vitest run`; rendered-shell, real startup/HTTP/socket/state, build identity,
  packaging source/configuration tests, and deterministic card/shoe/scoring fixtures.
  Socket checks require Linux `ss` (iproute2).
- `build`: production static assets and exact `dist/build-id`.
- `check`: lint, formatting, types, then build.
- `test:e2e`: real Chromium smoke at 320, 375, 390, 768, and 1440 px, each with
  standard and reduced-motion preferences. No retries or shared ambient server.

Playwright browser installation is user-level. Missing browser OS libraries must
be reported to the supervisor for separate privileged-install approval; do not
silently skip E2E or disable security controls to launch it.

`python3 harness/ci.py` is the existing ordinary local PR gate and must report
`STATIC_OK`, `UNIT_PASSED tests=N` with N > 0, and `CHECKS_OK mode=ordinary`.
Browser smoke is a separate check. **No GitHub Actions workflows or remote required
check names are configured.** Record local results rather than claiming remote CI.

These checks cover the scaffold, engine, presentation and issue #6 playable rounds.
The gameplay matrix uses desktop pointer clicks and real hasTouch-enabled taps at
390 px, covering all seven deterministic outcome balances, Hit/Stand, concealment,
repeated actions, Next Hand, reset, and a built-production-entry smoke. Five-width
presentation/layout coverage remains separate; fixtures alone do not prove gameplay.
Full MVP acceptance remains future work, including Double/Split, persistence,
help/keyboard/motion milestones and live deployment validation. Future rules remain `classic-six-deck-s17-v1` as defined in PRD section 3; no alternative ruleset is implemented.

## Production packaging source (not executed at M0)

The multi-stage Dockerfile uses `node:24.22.1-bookworm-slim` to build and
`nginx:1.30.6-alpine` to serve static output on internal port **80**. Production
uses Nginx. The Docker context is allowlisted and excludes `.git`, local runtime
configuration, credentials, dependencies, and factory/harness files.

A future, separately authorized image build must inject the actual full source
commit because Git metadata is excluded. For a clean checkout at the intended
revision, the command would be:

```bash
docker build --build-arg SOURCE_COMMIT="$(git rev-parse HEAD)" -t muicraft-blackjack .
```

`SOURCE_COMMIT` is mandatory and must be a full 40-character lowercase hexadecimal
Git SHA. The builder maps it to `FACTORY_RUNTIME_CANDIDATE` and emits `dist/build-id`.
The caller is responsible for supplying the actual source revision; the syntax
check cannot authenticate arbitrary input. The static runtime reads that file;
runtime environment changes cannot change a baked build identity.

Nginx serves `/healthz` as plain text `ok`, `/build-id` as the exact generated file
with no caching, assets from `/assets/`, and SPA fallback for application routes.
Missing identity or assets return 404 instead of the HTML shell.

**M0 validates packaging source/configuration and real Vite build output only.**
Docker installation, image build/run/publish, Nginx syntax/runtime validation,
Coolify deployment, and network exposure are unrun and require separate scope.
This is not a deployment runbook or container acceptance claim.

## Project guidance

- [Product requirements and fixed rules](docs/PRD.md)
- [Mission and scope](MISSION.md)
- [Project guidance](AGENTS.md)
- [Factory operations](FACTORY.md)
- [Historical onboarding status and milestone plan](docs/ONBOARDING.md)
- [Future MVP validation journeys](harness/END-TO-END.md)

Factory diagnostic commands, after the separate factory installation:

```bash
python3 factory/consumer.py doctor
python3 factory/consumer.py list
```

These validate engine/workflow definitions, not game behavior. This delivery is
the [issue #2 scaffold](https://github.com/gmui-gandg/muicraft-blackjack/issues/2)
plus [issue #3 primitives](https://github.com/gmui-gandg/muicraft-blackjack/issues/3),
[issue #4 ordinary-round engine](https://github.com/gmui-gandg/muicraft-blackjack/issues/4),
[issue #5 table presentation](https://github.com/gmui-gandg/muicraft-blackjack/issues/5),
and [issue #6 playable rounds](https://github.com/gmui-gandg/muicraft-blackjack/issues/6).
No schedules, automatic merges, or deployments are enabled.
