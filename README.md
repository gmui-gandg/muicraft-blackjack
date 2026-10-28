# MuiCraft Blackjack

A responsive single-player blackjack game with virtual wagering, Deal, Hit, Stand,
Double, Split, settled-session recovery, settlement and explicit Next Hand, backed
by the pure TypeScript engine. Help explains the [fixed rules](docs/RULES.md),
and gameplay supports keyboard shortcuts and accessible outcome feedback. The
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
phase, hand and funding rules for controls.
The engine has no React, animation, clock, storage, or DOM dependency.

Select a wager with `PLACE_BET` (10–500 in multiples of 10, capped by balance),
then `DEAL`. Selection reserves no money; Deal deducts the stake once and uses
`Shoe.prepareForRound` before distributing player/upcard/player/hole card. To
inject an opening sequence, pass a `Shoe` with more than 78 cards; shorter shoes
are replenished by the fixed threshold policy. Inject a `Uint32Source` into
`transition` for deterministic boundary shuffles. `Shoe.snapshot()` copies the
remaining sequence so transitions do not mutate the source shoe or input state.

Opening naturals settle immediately, including required Ace/ten-value peeks.
Otherwise `HIT`, `STAND`, `DOUBLE` or `SPLIT` drives `PLAYER_TURN`; 21 or bust completes
the active hand. Completion advances to the next unfinished hand, if any. If all
hands bust, losses settle immediately without dealer draws. Otherwise, after all
player hands complete, `DEALER_TURN` runs the dealer to S17 and enters
`SETTLEMENT`; `SETTLE` pays once
and enters `ROUND_COMPLETE`. These explicit engine events do not depend on UI
animation completion. `NEXT_HAND` moves table cards to discards and clears the wager without drawing or
reshuffling; the subsequent Deal applies the shoe boundary policy, clearing
discards when the full shoe is replenished.

State owns remaining cards, discards, dealer cards, one or two hands with stakes
and a `splitAces` flag, active hand index, completion, balance,
and accepted-event history. A completed
round includes aggregate and per-hand outcome/returned/net results:
natural 2.5× stake, win 2×, push 1×,
loss 0×. Rejected events preserve state identity and history. History records
accepted commands; automatic natural/bust settlement is part of that command.
An exhausted injected mid-round shoe rejects the draw atomically, without
reshuffling. The playable UI connects these engine events, including Double and Split.

## M3 Double engine

`DOUBLE` requires an unfinished, non-split-ace active hand with its first two cards
and available balance at least equal to its stake. It commits that additional
stake, draws exactly one card and completes the hand even below 21. A second
Double is refused because the hand is complete. The engine advances to the next
unfinished hand, otherwise dealer play (or immediate settlement if all hands bust).
For a 10-chip wager from 1,000, Double leaves 980 available and a stake of 20;
win/push/loss returns 40/20/0 for balances 1,020/1,000/980.

Eligibility and transition share typed reasons for completed hands, split aces,
third cards, insufficient funds, wrong phase and exhausted shoes. All rejections
preserve the input state, cards, balance and history. Settlement and discards retain
all represented hands; two-hand rounds prevent natural payouts, and differing
hand outcomes produce `mixed` with the total returned chips.

Double tests include constructed hand states and actual Split→Double journeys.
The browser integration covers doubling both non-ace split hands and their ledger.

## M3 Split engine

`SPLIT` requires an unfinished opening two-card hand of identical rank, no previous
split, and available funds for an equal additional stake. Thus Q+Q is eligible;
10+J is not. It creates two independently staked hands, transferring one original
card and one replacement card to each, and commits the additional wager once.
For stake 10 from 1,000, two stakes of 10 leave 980 available. Both replacement
cards must be available before any card or money moves. Resplits are refused.

Split aces receive one card per hand and automatically finish. Any other split
hand reaching 21 also finishes; play starts at the first unfinished hand and
advances in order. Split 21 is ordinary 21, returning 20 on a winning stake of 10.
One shared S17 dealer turn settles both hands independently, or all-bust settles
without dealer draws. `NEXT_HAND` discards cards from both hands and the dealer.

Deterministic tests exercise actual Split events, funding thresholds, immutable
rejections, split aces/21, ordered play, the five two-hand payout combinations,
shared dealer play and card ownership through discards. The UI exposes eligible
Double/Split actions, both visible hands, active progression and per-hand results.

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
Rejected dispatched actions show an alert while retaining the last committed game state.
Presentation receives totals and settlement values; it never decides payouts.
Action positions stay stable so rapid repeated clicks cannot turn Deal into Hit
or Stand into Next Hand. Below 10 chips, Reset Virtual Bankroll uses the browser's
accessible confirmation: cancel preserves chips, confirm starts at exactly 1,000.

The production entry constructs one `createPlaySession()` before React mounts.
Recovery runs once outside render/effect replay. The controller marks an accepted
Deal before dispatch, commits only an exact engine-issued whole-round completion,
and ignores repeated settlement commands without another financial write.
Preferences never commit an in-round balance. Reload restores settled chips and
the selected wager (capped to affordable multiples of 10); unfinished ordinary or
split rounds are discarded with an explanation. Next Hand remains explicit and
clears the current wager; the saved selection survives reload.

The Selected wager control permits lowering a wager as well as choosing legal
amounts. Motion defaults to system reduced-motion preference, with reduced/full
overrides. Audio remains muted; no sound playback is introduced. Depleted reset
cancellation preserves storage; confirmation persists 1,000 and default preferences.
Storage failures leave gameplay usable and display the adapter's explanation.

`/e2e/fixtures/integration.html` mounts the same App, controller, dispatch boundary
and storage adapter with only an injected deterministic shoe and test observers.
It records actual localStorage bytes and engine transitions. Test-only simulated
unloads stop dispatch after the pending marker or at dealer/settlement checkpoints,
then browser navigation recreates the production session. DEALING is the pre-Deal
checkpoint, not a separately rendered engine phase. These synchronous checkpoints
are not claimed as browser-observed timing windows. Production has no delays or
query-selectable fixture state; fixture code is excluded from the built entry.
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

Production gameplay uses localStorage only through the adapter below; there are
no cookies, service worker, or database. Runtime data/cache belongs under
`FACTORY_RUNTIME_STATE`. Tests
use fresh owned state/processes and fresh browser contexts for each attempt.

## M3 settled-storage boundary (issue #9)

`createSessionStorage()` in `src/storage/session.ts` is a standalone localStorage
adapter used by the production session controller. No sound playback is introduced.

One key, `muicraft-blackjack.session`, contains this exact v2 JSON shape:

```json
{
  "version": 2,
  "lastCompletedWager": null,
  "settledBankroll": 1000,
  "preferences": {
    "selectedWager": 10,
    "sameBet": false,
    "motion": "system",
    "audio": "muted"
  },
  "roundPending": false
}
```

Bankroll must be a nonnegative safe integer (including zero); selected wager must
be 0 (explicitly cleared) or 10–500 in multiples of 10. Zero is never a legal
engine PLACE_BET or Deal wager. Motion is `system`, `reduced` or `full`; audio is
only `muted`. Both types and validators derive their finite vocabularies from
exported declarations. Starting funds and wager limits/validation reuse the
game-owned declarations in `src/game/round.ts`. Unknown versions, extra/missing
core fields, invalid existing preferences and malformed JSON are rejected as a whole. No cards, shoe, action history, stakes,
intermediate funds or round outcome are serialized.

Valid v1 records migrate in memory with settled funds, motion/audio and manual
selection preserved, Same bet off and completed reference unknown. The next write
uses v2. `lastCompletedWager` is null or a legal 10–500 multiple of 10; missing or
invalid new repeat metadata is sanitized independently, preserving valid funds and
other preferences. Checked opt-in restores only with a valid affordable reference.
Explicit selected zero reloads as zero; ordinary manual selection reload continues
to use the existing affordable projection described below.

Same bet on Next Hand starts unchecked and unavailable until an affordable completed
round exists. The visible reason and repeat amount accompany its native checkbox.
Space toggles it; focused inputs keep native keyboard behavior. During play it is
disabled without clearing its checked state. Only whole-round settlement evaluates
affordability (equality counts), using the accepted engine opening wager before any
Double/Split. Insufficiency immediately turns it off and clears the pending next
selection; a later affordable completed round enables it without checking it.
Accepted Next Hand selects that exact reference when checked/affordable, otherwise
zero. It never deals, deducts funds, clamps a repeat, or refills funds. Manual wager
changes remain independent until the next accepted Deal completes. Confirmed reset
also clears opt-in/reference; cancellation changes nothing.

The public operations are:

- `snapshot(systemReducedMotion = false)` returns recovered `BETTING` state,
  settled bankroll, copied preferences, notices and `available`/`memory`
  persistence status. It does not represent live gameplay phase. `dealWager` caps
  selection to affordable multiples of 10, returning `null` below 10 chips; the
  selected preference remains intact. The snapshot can resolve a supplied system
  preference; the UI uses the live CSS
  media query for `system`, with explicit overrides taking precedence.
- `beginRound()` writes only `roundPending: true` against the last settled funds.
  It accepts no balance. Call it before beginning an unfinished hand.
- `commitSettled(completedState)` requires the exact engine-issued `ROUND_COMPLETE`
  object, including completion of all split hands. A private type brand prevents
  ordinary typed fabrication; an in-memory weak registry verifies object identity
  and the balance captured by the engine at settlement. Fabricated, copied,
  deserialized, balance-altered, unfinished or financially invalid inputs return
  false without changing funds or the pending marker. Pass the original completion
  directly, without spreading or serializing it. Successful commits clear the
  marker and save its original `wager` as the completed-round reference; insufficient
  settled funds also clear the pending selection and turn Same bet off atomically.
  Repeating the same completion does not apply a payout again. Proof is
  process-local and never stored. Browser storage remains user-modifiable; this
  integration guard does not make local scores tamper-resistant.
- `updatePreferences(changes)` merges, validates and copies preference changes; it never reads gameplay funds or clears the marker. Invalid updates
  return false without mutation.
- `reset({ confirmed: true })` explicitly resets funds to 1,000, preferences to
  defaults and the marker to false. Missing/false confirmation returns false
  without touching memory or storage. The UI obtains native browser confirmation;
  adapter tests exercise intent, and
  browser tests exercise canceled and confirmed dialogs with actual persisted bytes.
  Confirmed reset retries storage
  access and may replace this adapter's invalid/unknown record.

On recreation, a true marker produces “Unfinished hand discarded. Restored the
last settled bankroll.” and clears the marker when writable. The boolean is
nonfinancial and cannot resume a hand. A clean settled reload has no result or
discard notice. Failed marker writes/clears make detection best effort; notices
explain persistence failures. No cross-tab coordination is provided; use one
active session per key. This precondition is not enforced: simultaneous adapters
or tabs can overwrite newer settled funds or clear another session's pending
marker, so interrupted-hand detection is not reliable with concurrent writers.
Cross-tab ownership/locking would require a separately scoped protocol; v2 does
not promise shared-session recovery.

Empty storage starts at 1,000. Invalid/unsupported records instead provide an
explained **new in-memory session**, preserving the original bytes until confirmed
reset; ordinary operations cannot overwrite that record. This untrusted-record
fallback is distinct from resetting a valid depleted bankroll: valid 0–9 chip
balances remain depleted through recovery and preference changes until an explicit
confirmed reset or a caller-supplied settled commit. Recovery never refills them.

Storage access is lazy at construction, with no import-time browser access.
`createSessionStorage(() => storage)` injects a `getItem`/`setItem` boundary for
synthetic tests. Access/read/write exceptions (including denial and quota failure)
produce nonfatal notices and disable persistence for that instance, retaining
usable memory state. Operations can succeed in memory; inspect snapshot status
and notices to determine durability. There is no automatic retry except confirmed
reset. Notices are a session history, so earlier explanations remain after reset.
Only this adapter's key is written; unrelated keys are untouched.

`tests/storage.test.ts` exercises synthetic recreation, interruption and settlement,
serialized allowlists, invalid data, storage failures, wager recovery, motion/audio
and reset intent. `src/app/session.test.tsx` checks controller/React replay safety;
`e2e/integration.spec.ts` covers deterministic desktop pointer and touch journeys,
settled reloads, interrupted ordinary/split recovery, storage denial and reset.

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
390 px, covering all seven ordinary outcome balances, Hit/Stand, concealment,
repeated actions, Next Hand, reset, and a built-production-entry smoke. Five-width
presentation/layout coverage remains separate; fixtures alone do not prove gameplay.
Issue #10 adds Double/Split integration and settled persistence coverage. Full MVP
acceptance remains future work; container and live deployment validation remain
separate (AC-11/12). Future rules remain `classic-six-deck-s17-v1` as defined in PRD section 3; no alternative ruleset is implemented.

## Production packaging source and manual handoff

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
Issue #13 adds the [manual build, probe, Coolify and rollback handoff](docs/DEPLOYMENT.md)
and candidate-specific clean-checkout evidence referenced in the PR. Container and
LAN execution remain deferred; this is not an AC-11/12 completion claim.

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
[issue #6 playable rounds](https://github.com/gmui-gandg/muicraft-blackjack/issues/6),
[issue #7 Double engine](https://github.com/gmui-gandg/muicraft-blackjack/issues/7),
[issue #8 Split engine](https://github.com/gmui-gandg/muicraft-blackjack/issues/8),
[issue #9 storage boundary](https://github.com/gmui-gandg/muicraft-blackjack/issues/9),
[issue #10 gameplay/storage integration](https://github.com/gmui-gandg/muicraft-blackjack/issues/10),
and issue #11 Help/keyboard accessibility.
No schedules, automatic merges, or deployments are enabled.

## Help and keyboard accessibility

Tab to Help and use Enter or Space. Close Help receives focus; Tab and Shift+Tab
stay inside, Escape closes, and focus returns to Help. H/S/D/P invoke eligible
Hit/Stand/Double/Split through the existing session dispatch. Enter on neutral page
focus invokes Deal, Hit or Next Hand for the current phase; Enter on a focused
button activates that button instead. Editors and selects keep native behavior.
Held/repeated keys, modifier/composition events and open dialogs suppress gameplay
shortcuts. Release a key before another action. The primary action is displayed.

Player result regions announce explicit outcome, returned chips and numeric net
per hand. Concealed dealer cards remain unnamed. Disabled reasons and session
recovery/storage notices are readable without hover. Motion selection remains
keyboard-operable and persisted; audio stays muted. See [rules](docs/RULES.md).
Component dispatch assertions and Chromium keyboard journeys cover this scope;
they do not establish every screen reader's spoken behavior, full MVP acceptance
or deployment acceptance. Issue #13 packaging handoff remains separate.

## Motion and mobile play (issue #12)

Cards arrive over 200 ms, with the opening player/dealer sequence staggered by
60 ms per card. Subsequent draws arrive without an added sequence delay. The
concealed face flips at reveal; a decorative chip beside the settled balance and
each hand's result move over 200 ms. Cards, totals, controls and payouts update
immediately through the existing engine/session boundary. CSS completion events
and timers never decide outcomes. Motion does not lock legal actions. Native
multi-click repetitions on the same active hand are ignored; actions on the next
split hand, wager chips, reset confirmation, separate clicks and fresh keyboard
activations remain available. Held-key suppression and Help's
focus lifecycle remain unchanged.

System mode follows the live OS reduced-motion query, with all these durations
and sequence delays set to zero under reduce. Explicit reduced also uses zero,
including after preference reload. The existing explicit full override takes
precedence over an OS reduce request and uses 200 ms/60 ms; full is not claimed to
follow system reduction. Preferences use the existing versioned adapter.

The motion browser matrix plays deterministic ordinary rounds at 320, 375, 390,
768 and 1440 CSS-pixel widths: exact 10-chip wager, Deal, Stand, settled result and
explicit Next Hand. Mobile projects use hasTouch and actual taps. It measures
horizontal bounds and visible button/select targets (at least 44 × 44), and records
computed durations plus active CSS animations/transitions. Normal, system-reduced,
explicit-reduced and full-override runs assert identical cards, result and balance.
Separate supplied component fixtures stress both split hands with 12/10 cards,
Win/Loss/Push text and a storage-error notice. Those fixtures are layout evidence,
not engine gameplay or actual storage-failure journeys; the existing integration
suite covers actual failures. Set `M4_EVIDENCE_DIR` to an external directory to save
JSON frame observations and screenshots. Fixtures are excluded from the production
entry and have no product query selector. These Chromium checks do not establish
screen-reader speech, every device, full MVP or deployment acceptance.
