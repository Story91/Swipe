# CSS consolidation, design

**Status:** design approved in outline, one step still gated (see §6).
**Date:** 2026-08-17

The question that started this was whether to convert 22,667 lines of component
CSS onto the shared sheet or delete it and write the styling layer again. The
measurements below answer it: neither, in that order.

---

## 1. What was measured, and what it says

| | |
|---|---|
| CSS across `app/` | 22,667 lines |
| Unique classes defined | 1,645 |
| Classes never referenced from any `.ts`/`.tsx` | **310 (19%)** |
| `!important` declarations | **473** |
| Hardcoded `#d4ff00` | 237 |
| `linear-gradient` | 267 |
| `border-radius` | 465 |
| `box-shadow` | 273 |
| `font-family` | 338, of which 75 name `Orbitron` literally |
| `rgba(255,255,255,α)` | 353 occurrences across 12+ distinct alphas |
| `@media` | 67 |

**81% of the classes are live.** "It is all dead weight, delete it" is not
supported. A wholesale rewrite would be re-typing mostly-working code.

**The disease is the 473 `!important`** — one every 48 lines. They are not
random. Sorted by what they set: `background` 83, `color` 74, `padding` 38,
`border` 29, `font-size` 21, `font-weight` 20, `border-radius` 20,
`box-shadow` 19, `border-color` 18, `font-family` 17.

**They are fighting global element selectors.** `app/theme.css` styles `*`,
`body`, `h1, h2, h3, h4, h5, h6` (font-family, font-weight, letter-spacing) and
`button, .btn` (the same three). `app/globals.css` styles `body`. On top of
that, `@coinbase/onchainkit/styles.css` is imported in the layout and sets its
own. Any component that wants a heading to look like anything else has exactly
two options: raise specificity, or shout. The codebase chose shouting, 473
times.

This is not theoretical. It was hit during this work: `.mf-hero-title`
(specificity 0,1,0) lost to nothing at all on a stale stylesheet, and the
manifesto's headline rendered in Exo 2 rather than Orbitron because
`h1, h2, h3...` from `theme.css` was the only rule left standing.

**The conclusion that matters: a rewrite does not fix this.** New CSS meets the
same global rules and regrows the same `!important` within weeks. The root
cause has to go first, or nothing else is durable.

---

## 2. Scope

Decided with the user: **only what a user can actually reach.**

Out of scope for now, to be done later:

- Admin-only surfaces: `Admin/ClaimsDashboard.css` (351), `Admin/AdminPanel.css`
  (293), `HackScreen/HackScreen.css` (352).
- **Four screens sitting behind `ComingSoonOverlay`**, which no user can reach
  today and whose markup will change when the features are rebuilt, so styling
  them now means styling them twice:

  | Screen | Lines | Overlay |
  |---|---|---|
  | `Tasks/DailyTasks.css` | 1,351 | "Daily tasks are being rebuilt" |
  | `Market/SwipeTokenCard.css` | 856 | "New $SWIPE incoming" |
  | `Market/MarketStats.css` | 527 | "Stats are being rebuilt" |
  | `Portfolio/SwipeClaim.css` | 421 | "Claims are paused" |

  3,155 lines, cut by the scope rule rather than by preference.

Already on the sheet, by either agent: `sheet.css`, `Leaderboard`,
`MyPortfolio`, `ActiveBets`, `BetHistory`, `RecentActivity`,
`EnhancedUserDashboard` (chrome only), `AuditLogs`, `PlatformAnalytics`,
`SystemSettings`. `Manifesto.css` and `HelpAndFaq.css` carry the same language
under their own `--mf-`/`--hf-` token blocks.

**In scope: 11,436 lines**, the largest being `Main/TinderCard.css` (3,886),
`Markets/SwipeMarkets.css` (2,094), `Main/Dashboards.css` (1,123),
`Portfolio/WinLossPNL.css` (1,076), `Portfolio/LegacyCard.css` (779),
`Modals/CreatePredictionModal.css` (560), `Market/CompactStats.css` (493),
`Markets/MarketGrid.css` (400), `Modals/SharePreviewModal.css` (382), plus nine
files under 200.

---

## 3. Approach

Cause first, then conversion, and rewrite only the two files that are beyond
saving.

**Phase 1 — remove the cause.** Delete the global element selectors from
`theme.css`. This is the gated step; see §6.

**Phase 2 — one token layer.** Promote the sheet's tokens to `:root` so every
stylesheet can reach them without redeclaring. Purely additive: nothing reads
them yet, so nothing can break.

**Phase 3 — mechanical sweep.** Replace the repeated literals with tokens:
237 lime, 353 greys, 465 radii, 273 shadows, 338 font stacks. Script-driven and
checkable by diffing computed styles before and after, not by eye.

**Phase 4 — delete the dead. NOT SAFE AS SPECIFIED; do not run the naive
version.** The scan that found 310 unreferenced classes matches literal
substrings in `.ts`/`.tsx`. Class names in this codebase are also built from
data at runtime:

```
al-row al-row--${log.status}
ab-side ab-side--${bet.choice === 'YES' ? 'yes' : 'no'}
achievement-badge ${...hasStreak7 ? 'unlocked' : 'locked'}
```

`al-row--resolved` is live and appears nowhere as text, so the scan calls it
dead. Deleting the 310 as a batch would take working styles with it, and the
breakage would show up only on the states that happen to be rare — a resolved
row, a locked achievement — which is the worst possible way to find out.

**That second pass now exists:** `npm run scan:dead-css`
(`scripts/scan_dead_css.js`). It collects every prefix that a template literal
can extend and treats any class starting with one as reachable, deliberately
generously — keeping a dead class costs nothing, deleting a live one costs a
broken state nobody sees until it is rare and in production.

Measured: **311 naive, 206 after expansion.** So 105 of the original list were
live classes the first scan could not see.

**The remaining 206 are still not a delete list**, and the scan cannot fix this
part: it flags `dragging-live`, which was added to `TinderCard.css` on purpose
for the gesture engine that has not landed yet. A class staged for work in
flight is indistinguishable from a dead one by any static measure.

So the phase runs as: take the 206, remove anything a person recognises as
staged, delete the rest in one commit, and keep the scan as a test pinned to
whatever number survives. It needs a human pass over a 206-line list, not a
scripted sweep — which is why it is not being done at the end of a long
session.

**Phase 5 — per screen.** `TinderCard` and `SwipeMarkets` get rewritten rather
than converted; both are past the point where conversion is cheaper. The
remaining nine files convert.

Phases 2 to 4 are mechanical and reversible, which is why they come before any
judgement-based restyling: they shrink every later file before anyone has to
look at it.

---

## 4. Sequencing against other work

`TinderCard` is also having its gesture engine replaced. Decided with the user:
**style first, gesture after.** The restyle touches the card's appearance; the
gesture swap touches positioning and transforms. They are different rules in
the same file, so the ordering costs little, and the gesture can then be judged
on a card that already looks right.

A second agent is working in this repo concurrently. Every phase here is
committed separately and touches named files only, so a conflict shows up as a
merge conflict rather than as silently lost work.

---

## 5. How each phase is proven

Not "it looks fine".

- **Phase 1:** production build, then a computed-style diff on a fixed list of
  headings and buttons across the reachable screens. Any element whose computed
  `font-family`, `font-size` or `font-weight` changes is either an intended fix
  or a regression, and each one gets classified explicitly.
- **Phase 2:** additive, so the proof is that the computed-style diff is empty.
- **Phase 3:** same empty-diff requirement. A token swap that changes a rendered
  pixel is a bug, not a refactor.
- **Phase 4:** the dead-class scan becomes a test. Deleting a class that is
  actually used shows up as the scan finding it referenced.
- **Phase 5:** per screen, in the browser, at 375px and desktop.

`npx tsc --noEmit`, `npx vitest run` and `npm run build` gate every commit, per
the repo's rule that a green suite proves nothing on its own.

---

## 6. The gated step

**Deleting `h1..h6` and `button, .btn` from `theme.css` will change how things
look in places nobody predicted**, because an unknown number of screens
currently depend on them. That is the whole point (it is what the 473
`!important` exist to escape) and also the risk.

It ships as its own commit, revertable alone, and is the one step that needs
explicit sign-off before it runs. Everything else in phases 2 to 4 is provably
render-neutral.

Not doing it is a legitimate choice. The cost of not doing it is that phases 3
and 5 stay harder forever, and new components keep inheriting the fight.

---

## 7. What this does not cover

- The four `ComingSoonOverlay` screens and the admin surfaces (§2).
- `TinderCard`'s gesture engine, which has its own plan.
- `theme.css`'s `*` and `body` rules, and OnchainKit's stylesheet. Both are
  cause-adjacent, neither is load-bearing for the `!important` count, and
  touching third-party styles is a separate decision.
