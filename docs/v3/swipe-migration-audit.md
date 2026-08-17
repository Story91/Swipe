# Swipe Gesture Audit and Migration Plan

**Goal of this document:** enumerate everything the current card-swipe implementation does, so that replacing `react-tinder-card` with the physics engine proven in `docs/v3/prototypes/swipe-gesture.html` breaks nothing — including bugs, edge cases, and behaviour nobody remembers deciding on purpose.

**Scope:** `app/components/Main/TinderCard.tsx` (4230 lines, read in full), `app/components/Main/TinderCard.css` (3886 lines), `app/page.tsx`, `lib/hooks/desktopViewMode.ts`, `lib/hooks/useMediaQuery.ts`, `lib/hooks/useHybridPredictions.ts`, `app/components/Markets/MarketGrid.tsx`, `app/components/SidePanels/SidePanels.tsx`, `lib/chains/index.ts`, `lib/chains/activeChain.ts`, `lib/chains/types.ts`, `lib/contract.ts`, `package.json`, `node_modules/react-tinder-card/index.js` and `index.d.ts`, and the prototype itself.

**This document changes no application code.** It is read-only research and a plan for later work.

---

## 1. What a swipe actually does today

A swipe is a **direction picker for a modal, not a bet.** Dragging the card only decides which side (`YES`/`NO`) a confirmation dialog will be pre-filled with; the actual `writeContract` call happens later, gated behind a separate amount/token confirmation step.

End-to-end trace, both directions are mechanically identical (only `isYes` flips):

1. The user drags the single mounted `<TinderCard>` (`app/components/Main/TinderCard.tsx:2471-2482`). `react-tinder-card` is configured with `swipeRequirementType="position"` and `swipeThreshold={120}` (lines 2480-2481), so direction is decided by how far the card has moved at release, not by flick velocity.
2. On release past 120px, the library's internal `handleSwipeReleased` (`node_modules/react-tinder-card/index.js:118-147`) calls the app's `onSwipe(dir)` callback **synchronously, before** its own fly-out spring animation (`animateOut`) has finished playing.
3. `onSwipe(direction, swipedId)` (`TinderCard.tsx:1919-1952`) resets the drag-feedback state, records `lastAction` for a 3-second toast, and calls `openStakeModal(direction, swipedId)` (`TinderCard.tsx:795-812`) — **this is where a swipe becomes an action**, and the action is "open a dialog," not "bet."
4. `openStakeModal` sets `isYes = direction === 'right'` (line 796) and opens the `<Dialog>` at `TinderCard.tsx:3286` with a default amount of `0.001` ETH.
5. The user picks a token (ETH/SWIPE), an amount, sees the live potential-earnings table (the `potentialEarnings` memo, lines 655-700), and presses **Confirm** — `handleConfirmStake` (lines 1795-1887). For SWIPE this may first fire an ERC-20 `approve` transaction with a 10% slippage buffer (`calculateApprovalAmount`) before the stake itself is sent.
6. `handleConfirmStake` calls `handleStakeBet` (lines 1054-1151), which is the actual money path — see §5.
7. Only after the transaction is *confirmed on-chain* (`useWaitForTransactionReceipt`, effect at lines 451-467) does `handleStakeSuccess` (lines 1154-1245) close the dialog and advance `currentIndex`.
8. If the user cancels the dialog, or the transaction errors, the card is snapped back to centre via the library's imperative `restoreCard()` (see §2, item 8) and `currentIndex` never advances.

**What happens on the last card:** there is no "end of deck" state. Both a successful stake (`handleStakeSuccess`, line ~1178-1182) and a Skip (`handleSkip`, lines 1908-1917) advance `currentIndex` with the same wrap-around logic:

```
setCurrentIndex(prev => {
  const next = prev + 1;
  return cardItems.length <= 1 ? 0 : (next >= cardItems.length ? 0 : next);
});
```

The deck silently loops back to card 0. There is no "you're caught up" screen.

---

## 2. Every dependency on the current gesture

This is the acceptance checklist. Anything on this list a replacement does not reproduce is a regression, whether or not it looks intentional today.

1. Two swipe directions map to bet sides: right → YES, left → NO (`isYes = direction === 'right'`, `TinderCard.tsx:796`).
2. A swipe never places a bet by itself — it only opens the stake-amount dialog (`openStakeModal`, called from `onSwipe`, lines 1949-1951); the `writeContract` call happens later, only after token/amount selection and an explicit Confirm.
3. `onSwipe(dir)` fires the instant the library decides a released drag crossed the 120px position threshold — **before** the card's own fly-out animation finishes (`react-tinder-card/index.js:126-138`) — so the stake dialog visibly opens while the old card is still animating away underneath it.
4. `onCardLeftScreen(dir)` fires once the fly-out animation completes (`TinderCard.tsx:1954-1956`); currently a no-op `console.log`, but is a real lifecycle hook.
5. `onSwipeRequirementFulfilled(dir)` / `onSwipeRequirementUnfulfilled()` (lines 1959-1967) drive `swipeDirection`/`swipeProgress` state, which during the drag itself controls two renders: the whole-card tint/shadow in `getCardStyle()` (lines 2274-2290) and the big "YES"/"NO" `.swipe-text-overlay` label (lines 2562-2568).
6. `swipeRequirementType="position"` + `swipeThreshold={120}` (lines 2480-2481) — direction is decided by drag distance at release, not velocity.
7. `preventSwipe` is `['up','down']` normally, and **all four** directions on the fallback "Under Construction" card (`currentCard.id === 0`, line 2478) — the gesture must stay fully inert when there is no real prediction to bet on.
8. The imperative `tinderCardRef.current.restoreCard()` — the **inner**, library-level ref (`TinderCard.tsx:151`, typed `TinderCardAPI` at lines 139-142) — snaps the card back to centre. Called after the dialog is cancelled (`handleCloseStakeModal`, lines 1889-1905) and after a failed/errored transaction (`handleStakeError`, lines 1464-1499), both via a 100ms `setTimeout`.
9. `<TinderCard key={currentCard.id}>` (line 2472-2473) fully **remounts** the gesture whenever the displayed prediction's id changes — after a successful stake, a Skip, or either of the `currentIndex` reset effects (items 23/24) — discarding all in-flight gesture state.
10. `currentIndex`/`currentCard` (derived from `cardItems`, itself derived from `useHybridPredictions`) supply every piece of data the card and dialog render. The gesture reads this fresh each render; it never owns prediction data itself.
11. `onSwipe` unconditionally resets `swipeDirection`/`swipeProgress` to neutral the moment it fires (lines 1921-1922), regardless of what happens afterward.
12. `lastAction` + `showActionFeedback` — swiping records `{type:'bet', predictionId, direction, timestamp}` and shows a 3-second "Stake Accepted" / "Staking YES|NO" overlay (lines 2388-2410), independent of whether a stake is ever actually confirmed.
13. `openStakeModal(direction, predictionId)` (lines 795-812) sets `stakeModal` (`isOpen`, `predictionId`, `isYes`, default amount `'0.001'`, default token `'ETH'`) and separately captures `lastStakedPrediction` for later sharing.
14. Confirming a SWIPE-token bet first checks/obtains an ERC-20 approval (10% slippage buffer via `calculateApprovalAmount`) before the stake call is sent (`handleConfirmStake`, lines 1795-1887).
15. `handleStakeBet` (lines 1054-1151) gates every bet behind, **in order**: the read-only-chain check, a min/max amount check per token, and a self-bet guard — before `writeContract` is ever called. See §5.
16. On `writeContract` success the UI enters a pending state (`stakeTransactionHash` etc. set, an "info" notification shown) but the dialog stays open and the card does **not** advance yet (lines 1106-1123).
17. Only `useWaitForTransactionReceipt` resolving success (effect at lines 451-467) triggers `handleStakeSuccess()`, which closes the dialog, advances `currentIndex` (with wraparound), refreshes predictions, and kicks off a blockchain stake-sync.
18. A confirmed stake also: caches the user's Farcaster profile to Redis, POSTs the transaction to `/api/user-transactions` history, syncs the specific prediction via `/api/blockchain/events` with up to 3 retries 2s apart (a "Sync Delayed" notice if all fail), sends a Farcaster `notifyStakeSuccess` push, and — 2 seconds later — reveals the share-prompt overlay (lines 917-1245).
19. On `writeContract` error, or a failed receipt (`isStakeError`), `handleStakeError` shows an error notification, closes the dialog, and restores the card (item 8) — `currentIndex` never advances.
20. Cancelling the dialog without staking (`handleCloseStakeModal`) also restores the card, but performs none of the success-path side effects and never advances `currentIndex`.
21. The Skip/"NEXT" button (`handleSkip`, lines 1908-1917) advances `currentIndex` with the same wraparound as a successful stake, but with **no** card-exit animation, no dialog, and no `lastAction`/feedback overlay.
22. The AI-analysis modal's own "BET YES"/"BET NO" buttons (lines 4147-4172) call the component's `onSwipe(direction, id)` handler **directly** — reaching the identical stake-dialog path with no drag or fly-out animation at all. An existing non-gesture entry point into the same money path.
23. `useEffect` resetting `currentIndex` to `0` whenever `cardItems.length` changes (lines 868-871) — fires on every background refetch that adds or removes an active market.
24. `useEffect` jumping `currentIndex` to a specific prediction when `initialPredictionId` (a URL deep-link plumbed from `app/page.tsx`'s `SearchParamsHandler`) matches an entry in `cardItems` (lines 874-914), then calls `onInitialPredictionHandled` to clear it.
25. `tinderCardRef` on the **outer** component (`app/page.tsx:123`, exposed via `useImperativeHandle` at `TinderCard.tsx:577-580`) exposes only `refresh()` — invoked from `page.tsx`'s own `refreshPredictions()` wrapper (line 367-371) and, 5 seconds after success, from `CreatePredictionModal`'s `onSuccess` (lines 743-758) — unrelated to dragging but sharing the deck the gesture operates on.
26. Category filter buttons (`selectedCategory` state, lines 2576-2637) re-filter/re-sort `cardItems`, which can change its length and so retrigger item 23 — an indirect gesture dependency via the shared card list.
27. The Share button, "Ask AI" button, and the auto-toggling "SKIP"/"NEXT" label (every 1.5s, lines 533-539) sit immediately below the swipeable card and must remain click-safe — never misread as part of a drag — regardless of which engine drives the card above them.
28. Four blocking early-return states — no wallet connected (line 2179), predictions loading (2208), predictions errored (2223), no active predictions at all (2254) — each render **before** the swipeable card mounts at all. The gesture must not assume it is always present in the tree.

**28 distinct behaviours.**

---

## 3. Desktop versus mobile

- **Which component renders:** mobile is never `isDesktop` (`lib/hooks/useMediaQuery.ts:43-45`, breakpoint `min-width: 1024px`), so `showGrid = isDesktop && desktopView==='grid' && activeDashboard==='tinder'` (`app/page.tsx:136`) is always false on mobile — mobile always renders `TinderCardComponent` (line 652-660) when on the Bets tab. Desktop **defaults to grid**: `DEFAULT_DESKTOP_VIEW_MODE = 'grid'` (`lib/hooks/desktopViewMode.ts:19`), so a desktop visitor sees `MarketGrid` (`app/components/Markets/MarketGrid.tsx`), not the swipe card, until they explicitly click the "Swipe" pill (`app/page.tsx:566-585`).
- **Is the gesture even active on desktop:** yes. `react-tinder-card` attaches `mousedown`/`mousemove`/`mouseup` on top of `touchstart`/`touchmove`/`touchend` (`node_modules/react-tinder-card/index.js:183-236`), so desktop mouse-drag works today. `.card` has `cursor: grab` and `:active { cursor: grabbing }` (`TinderCard.css:154,159-162`) — a desktop-only affordance (touch has no cursor).
- **Card sizing:** identical regardless of desktop/mobile. The baseline card is 330×528px (`TinderCard.css:141-157`) for any viewport ≥769px — desktop does **not** get a bigger card, only a wider container around it (`max-w-[560px]` desktop vs `max-w-[424px]` mobile, `app/page.tsx:397-398`). Mobile-only breakpoints *shrink* the card further at ≤768px (308×501), ≤480px (280×450), and ≤360px (260×420) (`TinderCard.css:905-909, 987-994, 1082-1085`).
- **Side rails:** desktop-swipe-mode only. `showSidePanels = isDesktop && desktopView==='swipe'` (`app/page.tsx:139`) renders `<SidePanels>` (`app/components/SidePanels/SidePanels.tsx`) — a "Your Position" rail (claims + stats) and a "Live Feed" rail (recent activity), both sourced from the same `ProductPanels` component the grid-mode strip uses. Purely informational; no interaction with the gesture.
- **Mode switching:** `useDesktopViewMode` (`lib/hooks/desktopViewMode.ts`) persists the choice to `localStorage['swipe:desktop-view-mode']`, starts every render at the `grid` default to avoid a hydration mismatch, then applies the stored value in a post-mount `useEffect`. Mobile never reads this hook for layout purposes — there is no persisted "mobile view mode"; mobile is unconditionally swipe.
- **Behaviour that exists on one but not the other:** (a) the Grid↔Swipe toggle and the "Browse all markets →" escape hatch (`app/page.tsx:566-585, 632-640`) exist only on desktop; (b) side rails only on desktop; (c) mouse-drag + `cursor:grab` are only meaningfully exercised on desktop; (d) the stake dialog, AI modal, share flow, and the entire money path in §5 are identical on both — same component, same code path, reached through a different toggle state.

---

## 4. What is already broken or fragile

Blunt, in priority order:

1. **The swipe→bet money path is presently inert in production.** `handleStakeBet` calls `isReadOnlyChain()` with **no argument** (`TinderCard.tsx:1058`). `isReadOnlyChain(key: ChainKey = DEFAULT_CHAIN_KEY)` (`lib/chains/index.ts:119-121`) therefore always evaluates against `DEFAULT_CHAIN_KEY = 'base'` (line 77), and Base is hardcoded `readOnly: true` (line 22) because its owning key is compromised. `CONTRACTS.V2` (`lib/contract.ts:1330-1336`) is also a fixed Base address. The result: **every** swipe-driven bet attempt today hits the "Betting is moving to V3" alert (`TinderCard.tsx:1059-1064`) and returns before any wallet interaction, regardless of which chain the user actually has selected. A chain-aware equivalent already exists and is used elsewhere — `useActiveChain().isReadOnly` (`lib/chains/activeChain.ts:40-68`), consumed by `ChainSwitcher.tsx` and `app/prediction/[id]/page.tsx` — but `TinderCard.tsx` imports the standalone, chain-blind `isReadOnlyChain` instead (line 8). This looks like pre-multi-chain code that was never updated, not a deliberate choice. Any manual QA of "does the gesture still let me bet" must either mock this check or accept that success today means "the alert appears," not "a transaction is sent."
2. **A background refetch can silently teleport the user and destroy an in-progress drag.** `useEffect(() => setCurrentIndex(0), [cardItems.length])` (`TinderCard.tsx:868-871`) fires on **any** change in the filtered/sorted deck's size — including the ordinary case of a market expiring between `useHybridPredictions`'s 2-minute background refetch (`lib/hooks/useHybridPredictions.ts:227-236`). Because `<TinderCard key={currentCard.id}>` remounts on any identity change of `currentCard`, this reset also destroys any in-progress drag on the old card — the library's DOM listeners live in a `useLayoutEffect` scoped to the mounted element and are torn down on unmount. A replacement whose gesture state lives in refs tied to the DOM node (as the prototype's does) is equally exposed unless the migration explicitly guards against it (see Phase 3 and Risk 3 below).
3. **The "Stake Accepted" feedback can lie.** `lastAction`/`showActionFeedback` (set inside `onSwipe`, lines 1919-1951) shows "Stake Accepted" / "Staking YES|NO" (lines 2394-2397) for 3 seconds **immediately on gesture release** — before the dialog has even opened, let alone before an amount is chosen, a wallet signature requested, or a transaction confirmed. Given finding 1, this text can currently appear even though nothing was, or ever could be, staked.
4. **Dead branch:** `lastAction.type` is always the literal string `'bet'` (`const actionType = 'bet';`, line 1931) — nothing ever sets `'skip'`. `handleSkip` (lines 1908-1917) never calls `setLastAction`, so the `'Skipped'` half of `lastAction.type === 'skip' ? 'Skipped' : 'Stake Accepted'` (line 2396) can never render.
5. **Two different refs share the name `tinderCardRef`.** The outer one, in `app/page.tsx:123`, is the forwarded ref to the whole `TinderCardComponent`, exposing only `{ refresh }`. The inner one, inside `TinderCard.tsx:151`, is a different ref bound to the `react-tinder-card` library instance, exposing `{ swipe, restoreCard }`. Same identifier, two component levels, two unrelated capabilities — a footgun for anyone editing either file without close attention.
6. **A typed capability that doesn't exist.** `app/page.tsx:123` types the outer ref as `{ refresh: () => void; goToPrediction?: (id: string) => void }`, but `TinderCard.tsx`'s `useImperativeHandle` (lines 577-580) never implements `goToPrediction` — it always resolves to `undefined`. Deep-linking is instead done entirely through the `initialPredictionId` prop/effect (lines 874-914), not through this ref method.
7. **No keyboard path, and no always-visible YES/NO button exists today.** The only persistently visible controls beside the card are Share, Ask AI, and Skip (lines 2640-2693); YES/NO buttons exist only inside the AI-analysis modal, and only after an AI call completes (lines 4144-4174). This is already a violation of the "buttons/keyboard are a full path" requirement the migration must satisfy — it has to be **added**, not merely preserved.
8. **`react-tinder-card`'s own touch handler is more aggressive than the app's CSS implies.** `onTouchStart` (`node_modules/react-tinder-card/index.js:174`) calls `ev.preventDefault()` on every touch that starts on the card unless the touched element's `className` contains `pressable` — a class that does not exist anywhere in this codebase (confirmed by search). In practice nothing interactive is nested inside the swipeable wrapper today, but it means the card can never be a scroll surface for anything nested inside it; that constraint needs to be a conscious decision in the replacement, not an inherited accident.
9. **Loose error typing on the money-path failure branch.** `handleStakeError = (error: any) => {...}` (line 1464) and `console.log`-as-debugging are used throughout the file. Not swipe-specific, but the branch that decides whether the card gets restored (item 19 in §2) runs through this loosely-typed function.
10. **The fly-out animation is always clipped.** `react-tinder-card` computes fly-out distance from `window` height/width diagonal (`react-tinder-card/index.js:36-42`), but `.tinder-container` is only ~330px wide and `overflow: hidden` on both axes (`TinderCard.css:49-60`) — the card is always visually clipped mid-flight, and the animation's timed duration is calculated for a much longer visual travel than what is ever shown. Purely cosmetic, but worth deciding on purpose in the replacement (the prototype's own `FLY_DISTANCE = stageWidth * 1.3 + cardWidth` is sized to its own clipped frame and already gets this right by construction).

---

## 5. The money path

Where a gesture becomes a contract write, and every guard between them:

```
drag release (position ≥120px)
  → onSwipe(dir)                              [TinderCard.tsx:1919]
  → openStakeModal(dir, id)                    [TinderCard.tsx:795]   — dialog only, no chain touched yet
  → user picks token + amount, presses Confirm
  → handleConfirmStake                          [TinderCard.tsx:1795]
      → (SWIPE only) ERC-20 approve, +10% buffer, wait ~2s
  → handleStakeBet(predictionId, isYes, amount, token)  [TinderCard.tsx:1054]
      1. isReadOnlyChain() — refuse with an alert, return    [line 1058]  ⚠ see §4 finding 1: chain-blind
      2. per-token min/max amount check                       [lines 1067-1084]
      3. self-bet guard (creator === connected address)       [lines 1086-1091]
  → writeContract({ placeStake | placeStakeWithToken })       [lines 1097-1150]
  → onSuccess: store tx hash, show "Transaction Sent"; dialog stays open, card does NOT move
  → useWaitForTransactionReceipt                              [lines 443-467]
      → isStakeConfirmed → handleStakeSuccess()  [line 1154]  — THIS is what moves the card
      → isStakeError     → handleStakeError()    [line 1464]  — restores the card, dialog closes
```

No connection-state check appears explicitly in this path beyond the fact that the whole component returns early at line 2179 if `!address` — a disconnected wallet never reaches the card at all, so there is no separate "you must connect" guard inside `handleStakeBet` itself; it is structurally impossible to get there disconnected.

**A replacement must not shorten this path.** Concretely, that means the new engine's "commit" step (second swipe / Confirm button) must still open or feed `handleConfirmStake`/`handleStakeBet` — never call `writeContract` directly from the gesture — so that:

- the read-only-chain check still runs first (and should be fixed to use `useActiveChain().isReadOnly` while this is being touched — see §4 finding 1 and the migration's optional follow-up),
- the min/max and self-bet guards still run before any wallet prompt,
- the SWIPE approval sequencing is preserved,
- the pending → confirmed → `handleStakeSuccess` timing (card only advances on a *mined* receipt, not on wallet-signature) is preserved.

---

## 6. Risks of replacing the engine, ranked

1. **Shortening the money path.** Because Phase 3 of the plan below decouples "which side is armed" from "how the amount gets chosen," it is easy to accidentally wire "commit" straight to `handleStakeBet`, skipping the token/amount dialog and its checks. *Detection:* attempt a stake below minimum, above maximum, on your own market, and while on the read-only chain — each must still be refused before any wallet prompt appears, exactly as today.
2. **Losing the `restoreCard` recovery paths.** Two call sites (`TinderCard.tsx:1489-1498`, `1895-1904`) depend on an imperative "snap back to centre" after a cancelled dialog or a failed/denied transaction. *Detection:* arm/drag a card, then cancel the dialog; separately, drag, confirm, and reject the wallet signature. In both cases the card must visibly return to centre, not stay off-screen or mid-air.
3. **Remount-on-refetch interacting badly with a ref/DOM-based engine.** §4 finding 2 already causes a silent loss of drag state today. If the new engine's pointer listeners are attached via `useEffect`/`useLayoutEffect` scoped to the card element (as both the current library and the prototype do), a remount mid-gesture now risks losing pointer capture in a more visible way (a "stuck" card, or a thrown error) rather than the current silent no-op. *Detection:* force a background refetch (or artificially resize the mocked prediction list) while actively dragging in a dev build; confirm no console error and no stuck pointer capture.
4. **The AI-modal's direct `onSwipe(direction, id)` shortcut** (item 22 in §2) bypasses the visual engine entirely. If the new implementation's `onSwipe`-equivalent assumes it is only ever invoked from within a live drag (e.g., reads current gesture-velocity state), calling it externally with no drag in progress could throw or produce a `NaN` transform. *Detection:* exercise "Ask AI" → "BET YES"/"BET NO" specifically, not just the drag gesture.
5. **Haptics and reduced-motion regressing silently.** `navigator.vibrate` does not exist on iOS Safari at all; the prototype's `vibrate()` helper (`swipe-gesture.html:643-647`) already wraps it in a try/catch for exactly this reason — that guard must survive the port. *Detection:* a manual pass on a real Android phone (haptics), a real iOS phone (silent no-op, no console error), and a desktop browser with OS-level "reduce motion" turned on.
6. **Desktop mouse-drag regressing.** `react-tinder-card` unifies drag via separate `mousedown`/`mousemove`/`mouseup` listeners; the prototype uses Pointer Events, which behave differently around `setPointerCapture` scoping and click-vs-drag disambiguation for the Share/Ask AI/Skip buttons sitting directly below (not inside) the card. *Detection:* desktop mouse-drag a card end-to-end in swipe view, and confirm clicking Share/Ask AI/Skip immediately below the card is never misread as a drag.
7. **`touch-action` conflicts.** Today's CSS sets `touch-action: pan-y pinch-zoom` at ≤768px and `pan-y` under `(hover:none)(pointer:coarse)` (`TinderCard.css:908, 990, 1115`), while the prototype's `.stack-wrap` uses `touch-action:none` outright (`swipe-gesture.html:135`). Applying `none` to the real card could newly block pinch-zoom the current CSS still allows. *Detection:* pinch-zoom and page-scroll tests on a real touch device with the new engine active.
8. **Cosmetic regressions in the guard states.** The four early-return states (§2 item 28) must keep rendering before any pointer listener is attached — a hook that runs unconditionally at the top of the component (before those `if` returns) would attach listeners to a card that may never mount. *Detection:* load the app disconnected, then with a slow network (loading state), then with a wallet that has no active predictions — no console errors in any state.

---

## 7. Migration plan

**Non-negotiable, per the design spec (`docs/superpowers/specs/2026-08-17-v3-market-rules-design.md` §7.6) and this audit:** buttons and keyboard are a full path throughout every phase below, not a fallback added at the end. Today's implementation does *not* meet this bar (§4 finding 7) — closing that gap is part of the plan, not a preserved behaviour.

### Which library to standardise on

Three animation packages are installed: `framer-motion` (`^12.27.5`), `motion` (`^12.23.26`), `@react-spring/web` (`^9.7.5`) — plus `gsap` (`^3.14.2`, unrelated to gestures; it only drives the AI-modal's text-typing effect in `components/TextType.tsx`). Actual usage found by searching the app source:

| Package | Where it's actually used | Verdict |
|---|---|---|
| `@react-spring/web` | Nowhere in app source — it is a dependency of `react-tinder-card` itself (`node_modules/react-tinder-card/index.js:2`). | **Remove** once `react-tinder-card` is gone; nothing else needs it. |
| `framer-motion` | One file: `app/components/Markets/KalshiMarkets.tsx:4`. | Legacy import name — see below. |
| `motion` (`motion/react`) | `components/Stepper.jsx`, `components/Counter.jsx`, `components/VariableProximity.jsx`, `components/TiltedCard.jsx`. Of these, only `Stepper` is actually wired into the live app, via `app/components/Modals/HowToPlayModal.tsx:5`; the other three are unused. | Already the "current" package name. |

`framer-motion` and `motion` are, practically speaking, the same library — Framer Motion was rebranded to "Motion," and `motion/react` is its current entry point; `framer-motion` is now the compatibility alias. The design spec's own phrasing ("Replace it with a Motion-driven gesture. One library, dropping react-tinder-card and two of the three animation packages") reads as a direct instruction to standardise on `motion` and drop both `framer-motion` and `@react-spring/web`.

**However:** the *approved* prototype does not use any of the three. Its own footer states it plainly: *"Pointer Events + a hand-rolled spring integrator. No CSS keyframes, no animation library, no network requests."* Its two-stage arm/commit state machine, momentum projection, rubber-banding, and mid-flight interruption do not map onto any library's declarative `drag` gesture — they are exactly the kind of low-level control a library's abstraction would fight, not help with. Recommendation, reconciling both:

- **The gesture engine itself uses no animation library.** Port the prototype's Pointer Events + spring-integrator code into a React hook nearly verbatim — this is what the owner actually approved, and re-deriving the same feel through a library's abstraction risks subtly changing it.
- **Everything else that needs a general-purpose animation library** (modals, list transitions, badges) standardises on `motion` (`motion/react`), since it is already the current package and already wired into a live surface (`Stepper`/`HowToPlayModal`). Migrating `KalshiMarkets.tsx` off the legacy `framer-motion` import is a small, separate, out-of-scope follow-up — do not bundle it into the gesture migration.
- **Remove `@react-spring/web`** in the same change that removes `react-tinder-card` (Phase 5 below). **Remove `framer-motion`** only after `KalshiMarkets.tsx` is ported to `motion/react`, which is not part of this plan.

### Where the prototype's approach will *not* transfer as-is

- **DOM construction.** The prototype builds cards with `innerHTML` string templates and manual `document.createElement` calls outside React (`swipe-gesture.html:678-732`). The real app must drive the same visuals through a `ref` to a React-rendered node and mutate `ref.current.style.transform` directly inside the render loop — never through React state per pointer-move (that would re-render on every `pointermove` and blow the frame budget). Reading from the physics loop and writing via `style.transform` is the right pattern; building the DOM manually is not.
- **A live, mutating data source.** The prototype cycles through 4 hardcoded questions forever (`finalizeCommit`, `swipe-gesture.html:934-948`). The real deck (`cardItems`) is filtered, sorted, sometimes empty, sometimes a single item, and refetched in the background every 2 minutes (`lib/hooks/useHybridPredictions.ts:227-236`) plus several manual refresh triggers. §4 finding 2 shows today's code already mishandles a mid-gesture refetch — the new engine must explicitly decide to **freeze the active card's identity for the duration of a drag or an armed state**, and only reconcile with fresh `cardItems` once the card is at rest (not armed, not dragging). This is new logic; nothing in the prototype had to solve it.
- **No SSR concern in the prototype** (static HTML, no framework). `TinderCardComponent` is already dynamically imported with `ssr:false` (`app/page.tsx:60`, specifically because it's wallet/browser-dependent), so a naive port is safe from crashing on the server — but the new hook must still guard `window`/`navigator`/`performance`/`requestAnimationFrame` access defensively (e.g. inside `useEffect`, never at module scope or during the first render pass) so it does not become the reason `ssr:false` is load-bearing in a new, fragile way.
- **Stake amounts are real functionality the prototype never had to build.** Its chips are hardcoded `1 / 5 / 25 USDC` buttons (`swipe-gesture.html:468-478`). The real app has per-token minimums, a custom-amount input, ETH↔USD toggling, and a live potential-earnings table (`potentialEarnings` memo, `TinderCard.tsx:655-700`) — all of it must keep working; the "armed" stake-chip UI from the prototype is, at most, a visual companion to the existing dialog, not a replacement for its logic.
- **`TinderCardComponent` does far more than swipe.** It is ~4200 lines including the AI-analysis modal, the share flow, Farcaster notifications, and the admin/approver dashboard views, all colocated in one file and sharing state with the gesture (e.g. the AI modal's own buttons call the app's `onSwipe` directly — §2 item 22). None of this existed in the prototype's scope; the migration touches one component embedded in a much larger one and must not regress the parts around it.
- **CSS breakpoints.** The prototype's card is a fixed 280×400px inside a fixed 400×520px stage. The real `.card` ranges from 330×528px down to 260×420px across four breakpoints (`TinderCard.css:141-157, 905-1109`). The prototype's own `measure()` function (`swipe-gesture.html:740-753`) already reads real `getBoundingClientRect()` values rather than hardcoding them, so the *approach* transfers — but every derived constant (`DOCK_OFFSET`, `EDGE_BOUNDARY`, `FLY_DISTANCE`, and the threshold-in-px itself) needs re-verification at each existing breakpoint, and re-measurement must also fire when the container's layout changes for a non-resize reason (e.g. side rails mounting/unmounting when desktop switches grid↔swipe), not only on `window resize`.
- **Container clipping is already a real constraint.** `.tinder-container` is `overflow: hidden` on both axes (`TinderCard.css:49-60`) at a much narrower width than `window.innerWidth`. §4 finding 10 shows today's fly-off already gets clipped as a side effect of the library not accounting for this. The prototype's own `.stage-frame` is deliberately clipped by the same kind of bounded box, so its `FLY_DISTANCE = stageWidth * 1.3 + cardWidth` calculation (measuring against its own frame, not the window) is the correct pattern to carry over — an improvement over today, not just a preservation of it.

### Phase 1 — Land the engine as an inert hook, zero visible change

**Files:** new `lib/hooks/useSwipeGesture.ts` (or `.tsx` if it needs to return JSX for the tint/armed overlays).

- Port the prototype's spring integrator (`springStepOnce`, `integrateAxis`, `project`, `rubberband`, `velocityFromHistory`, `deadzone`) and its pointer-event state machine (`onPointerDown`/`onPointerMove`/`endDrag`, the neutral→armed→committed transitions) into a hook that takes a ref to a card element and returns `{ stage, armedDir, bind }` where `bind` is the pointer-event handlers to spread onto the card's root element, plus imperative escape hatches (`armProgrammatically(dir)`, `commitProgrammatically()`, `cancelProgrammatically()`) for the button/keyboard path.
- Do **not** wire it into `TinderCardComponent` yet. Exercise it from a standalone route (or keep using the existing prototype file for hands-on QA) to verify: the physics feel matches the approved prototype exactly (same damping/response defaults — Return 1.0/0.30s, Dock 0.8/0.35s, Commit 1.0/0.40s, projection constant 0.998, threshold 110px per the design spec table, tuned against the real card's measured dimensions), and that mounting it inside a Next.js `"use client"` component with `ssr:false` does not crash the build.
- **Verify:** `npm run build` succeeds; manual drag test on a real mobile device and desktop mouse against the standalone harness, side by side with `docs/v3/prototypes/swipe-gesture.html` open in another tab for feel comparison.

### Phase 2 — Swap the transform layer, keep the existing callback contract unchanged

**Files:** `app/components/Main/TinderCard.tsx` (the `<TinderCard>` JSX block, lines 2471-2482, and the inner `tinderCardRef` at line 151).

- Replace the `<TinderCard>` wrapper with a local component built on the Phase 1 hook, but make it emit the **exact same** three callbacks the rest of the file already depends on: `onSwipe(dir)`, `onSwipeRequirementFulfilled(dir)` / `onSwipeRequirementUnfulfilled()`, and expose the same imperative shape — `{ swipe(dir), restoreCard() }` — on the inner `tinderCardRef`, so the two existing call sites (`TinderCard.tsx:1489-1498`, `1895-1904`) need no changes at all.
- In this phase, treat the new engine's "armed" stage as an internal implementation detail only — map a single decisive swipe past threshold straight to firing `onSwipe(dir)` the same way `react-tinder-card` does today (`swipeRequirementType`/`swipeThreshold` semantics preserved via the hook's own threshold parameter). **Do not** turn on the two-stage UX yet. This keeps the diff reviewable as a pure engine swap, isolated from any UX change, and makes every item in the §2 checklist directly testable one-for-one against today's behaviour.
- **Verify:** walk the full §2 checklist by hand on a real device and on desktop. Pay particular attention to items 3 (modal opens mid-flight), 8/19/20 (`restoreCard` on cancel and on error), 9 (remount on index change), and 22 (AI-modal shortcut still reaches the same code path).
- **Revert path:** this phase is a single component's internals; reverting means restoring the `<TinderCard>` import and JSX block, which is a small, isolated diff.

### Phase 3 — Turn on the two-stage arm-then-commit UX, and close the buttons/keyboard gap

**Files:** `app/components/Main/TinderCard.tsx`, `app/components/Main/TinderCard.css`.

- Wire the "armed" stage into the visible UI: the tint (already present via `swipeDirection`/`swipeProgress`, §2 item 5, extend rather than replace), a stake-chip-style reveal, the light/firm haptics (`navigator.vibrate`, wrapped in try/catch exactly as the prototype does), and the "swipe again to commit, the other way to cancel" hint.
- Decide, explicitly, how "armed" relates to the existing amount dialog (`<Dialog>` at line 3286): the dialog carries real functionality the prototype's static `1/5/25 USDC` chips do not (per-token minimums, custom amount, ETH↔USD toggle, the potential-earnings table) — do not discard it. Make the commit step (second swipe, or the new Confirm button) **open the existing dialog pre-filled with the armed side**, rather than calling `handleStakeBet` directly from the gesture. This keeps §2 items 14 through 20 — the entire approval/guard/tx-watch/sync/share chain — untouched; the gesture only changes *how a side gets picked*, never what happens after.
- Add the always-visible YES/NO buttons (and Cancel/Confirm once armed) that §4 finding 7 shows do not exist today. Wire real keyboard support net-new: arrow-left/right (or a Y/N binding) to arm, Enter to commit, Escape to cancel, each with visible focus states.
- Implement `prefers-reduced-motion`: cross-fade the stage change instead of springing, keeping the two-stage semantics as tap-to-arm / tap-to-confirm (matches the design spec's non-negotiable and the prototype's own `reduced-motion` handling, `swipe-gesture.html:594-596, 898-899, 910-911, 924-928`).
- Freeze `currentCard`'s identity while `stage !== 'neutral'` or a pointer is down — the fix for Risk 3 and §4 finding 2. Concretely: the `cardItems.length`-driven reset effect (`TinderCard.tsx:868-871`) and the background-refetch consumer should not force a `currentIndex` change while the gesture hook reports an active drag or an armed state; queue the reconciliation until the card returns to neutral.
- **Verify:** re-walk the full §2 checklist again (some items now behave differently on purpose — armed → commit vs. the old single-flick → dialog — confirm the *destination* behaviour, i.e. items 14-20, is identical either way). Add the new keyboard/button path to the checklist as net-new items and verify each with a keyboard only, no mouse or touch. Run the Risk 1-3 detection steps from §6 explicitly.
- **Revert path:** independently revertible from Phase 2 — Phase 2's single-flick contract can be restored without touching Phase 1's hook.

### Phase 4 — Stack depth (optional polish, independently shippable)

**Files:** `app/components/Main/TinderCard.tsx`, `app/components/Main/TinderCard.css`.

- Today only one `<TinderCard>` is ever mounted (`key={currentCard.id}` forces a full remount per card, §2 item 9) — there is no peek of the next card the way the prototype's 4-card stack shows. Add a shallow 2-3 card stack (matching the prototype's `data-pos`-based static offset for non-interactive cards, `swipe-gesture.html:774-779`) purely as a depth cue. This phase touches only rendering/layout, not gesture logic, and can ship or be reverted on its own.

### Phase 5 — Remove `react-tinder-card` and the now-unused animation package

**Files:** `package.json`, any remaining import of `react-tinder-card` or `@react-spring/web`.

- Confirm nothing imports `react-tinder-card` (`node_modules/react-tinder-card` is otherwise entirely unused once Phase 2 lands) and remove it from `package.json`'s `dependencies`.
- Remove `@react-spring/web` — confirmed above to have no direct app-source consumer; it was only ever pulled in transitively for `react-tinder-card`.
- Leave `framer-motion` and `motion` as they are; the `KalshiMarkets.tsx` consolidation onto `motion/react` is explicitly out of scope for this plan (see "Which library to standardise on," above).
- **Verify:** `npm install` / lockfile regenerates cleanly, `npm run build` succeeds, `npm run test:unit` (vitest) passes, and a full manual pass of the §2 checklist one more time against the final state.

### What to test before any of this ships

- **The full §2 checklist**, on a real iOS device, a real Android device, and desktop (mouse), after every phase — not just once at the end.
- **The money-path guards specifically** (§5): sub-minimum amount, over-maximum amount, self-bet, and the read-only-chain refusal, each confirmed to still block *before* a wallet prompt appears, on every phase.
- **The two `restoreCard` recovery paths** (cancel, and wallet-rejected/failed transaction) — the card must always end up back at centre, never stuck off-screen.
- **A live background refetch or deck-size change while a gesture is armed or mid-drag** — this is the one scenario existing code already gets wrong (§4 finding 2); it is also the one scenario the prototype never had to handle. Test it deliberately, not incidentally.
- **The AI-modal's "BET YES"/"BET NO" shortcut** (§2 item 22) as its own test case, separate from dragging.
- **Haptics on a real Android phone, and silent-no-crash on a real iOS phone** (`navigator.vibrate` does not exist there).
- **`prefers-reduced-motion` turned on at the OS level**, confirming the two-stage semantics survive as tap-to-arm/tap-to-confirm rather than disappearing.
- **Keyboard-only operation** of the full bet flow (arm, commit, cancel) with no mouse or touch input at all, once Phase 3 lands — this is net-new functionality this migration is responsible for adding, not just preserving.
