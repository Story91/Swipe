# Swipe V3 — working documentation

Living documentation for the V3 rebuild. Updated as work happens, not afterwards.

## Files

| File | What it holds |
|---|---|
| [`rules-v3.md`](./rules-v3.md) | The rules of V3 as they are decided: market mechanics, fees, payouts, rewards. The single source of truth for "how does Swipe work". |
| [`worklog.md`](./worklog.md) | What was done, when, and why. Chronological. Includes what is still broken. |
| [`open-questions.md`](./open-questions.md) | Decisions still owed, and what each one blocks. |

## ⚠️ These files feed the user-facing docs — which are now stale

Three surfaces in the app describe how Swipe works. **All three still describe V2
and are wrong in places that matter to users.** They are not being edited
piecemeal as V3 is designed, because every partial edit would have to be redone
when the next rule lands. Instead, they get rewritten once from `rules-v3.md`
when the V3 rules are frozen.

| Surface | File | Status |
|---|---|---|
| Help & FAQ | `app/components/Support/HelpAndFaq.tsx` | Stale — describes V2 fees, V2 payout, old $SWIPE rewards |
| Manifesto | `app/manifesto/page.tsx` | Stale — written for the Base-only, $SWIPE-era product |
| USDC markets guide | `app/docs/USDC_MARKETS_GUIDE.md` | Stale — names the retired USDC pool as current |

**The rewrite is a real task, not a footnote.** Ship it before V3 is announced:
a user reading the FAQ during the launch and finding V2 rules is worse than
having no FAQ at all.

## Ground rules for these docs

- **Only what is decided.** Proposals live in `open-questions.md` until chosen.
- **Numbers are exact or absent.** No "roughly 1%" — either the rate is fixed or
  it is an open question.
- **Wrong entries get deleted, not appended.** A doc that grows corrections is a
  doc nobody trusts.
