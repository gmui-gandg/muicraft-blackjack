# MuiCraft Blackjack acceptance journeys

Source: `docs/PRD.md` v1.0. These journeys describe target release behavior.
See README and per-milestone evidence for implemented features and executed
coverage. Full MVP, production UX and deployment acceptance require their
respective checks. Runtime verification needs a real app and candidate identity.

## 1. Play and settle a round

A new player sees 1,000 virtual chips, selects a legal 10-chip wager, and deals.
They see their cards and dealer upcard with the hole card hidden. They use Hit or
Stand when eligible, observe the dealer's S17 turn, then see an explicit outcome
and correct settled balance. A new round starts only on Next Hand. Check ordinary
win, loss, push, and dealer bust with deterministic decks rather than random luck.

## 2. Resolve naturals before player actions

Using deterministic deals, the player receives an unsplit opening Ace+King,
receives it alongside a dealer natural, and faces a dealer-only natural. Each
round resolves before normal actions become available. A 10-chip player-only
natural returns 25, both naturals return 10, and dealer-only natural returns 0.
The rules dialog explains the same 3:2 natural and S17 profile the engine uses.

## 3. Double and play two split hands

With sufficient bankroll and eligible cards, the player doubles and receives
exactly one card, or splits an equal-rank opening pair into two visible hands.
The active hand is clear; hands settle independently with correct total stakes.
Split aces receive one additional card each; split 21 pays 1:1. Ten+Jack, further
splits, and actions without enough funds are rejected by both UI and engine.

## 4. Recover bankroll and preferences

After completing a round, the player refreshes and retains the settled bankroll
and selected wager. After refreshing during an unfinished round, they return to
betting with the last settled bankroll and an explanation of the discarded hand.
A bankroll below 10 offers an explicit reset with confirmation. No flow offers
chip purchases, redemption, or cash-value rewards.

## 5. Play on mobile and with keyboard/reduced motion

At 320, 375, 390, 768, and 1440 CSS pixels, the player completes meaningful game
actions without horizontal page scroll or hover-only controls. Touch targets are
at least 44 by 44 CSS pixels. Keyboard actions work only when eligible and outside
dialogs; Help is keyboard accessible. Focus and outcome announcements are clear,
and reduced-motion preferences keep all controls and game results usable.
