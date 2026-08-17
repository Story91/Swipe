# Working in this repo

Swipe is a parimutuel prediction market. Next.js App Router on Vercel, wagmi/viem,
Solidity contracts under `contracts/` built with Hardhat. `main` is production.

## Commits

Commits are authored by Story91 and nobody else. Do not add a
`Co-Authored-By: Claude ...` trailer, in any commit, including merge commits. The
repo's `git config user.*` is already correct (`Story91 <tvkonflikt@gmail.com>`), so
a plain `git commit` is right. Never override identity with `-c user.email=...`; the
session's own email is not the commit email.

Do not rewrite published history unless asked. Commit hashes are quoted in
`docs/v3/HANDOFF.md` and in the filenames under `.superpowers/sdd/*/`, so a rewrite
silently invalidates the documentation.

## Text a user will read

Everything a user sees goes through a de-AI pass first. Page copy, docs, FAQ answers,
manifesto, share text, release notes. The rules:

No em dashes or en dashes anywhere. Use a comma, a full stop, or brackets. This is
the number one tell. No Title Case in headings, capital on the first word only. No
bold in the middle of a sentence, no bold label opening a bullet, no heading that
ends in a colon, no emoji as bullet points. Vary sentence length. Take a position and
give a specific.

Words that are banned because they read as generated: comprehensive, holistic,
synergy, leverage, robust, seamless, cutting-edge, revolutionary, "unlock potential",
"in today's world", "it's worth noting", "not only X but also Y", "in conclusion". No
rhythm-of-three lists, no rhetorical questions, no fake concessions, no stacked
hedging.

Never change facts, numbers, addresses, formulas, links or code blocks during a copy
pass. After the pass, diff the invariants against the original.

## Verifying work

A green test suite proves nothing on its own. Three separate times in this repo a
test passed while the thing it named was broken. The rule is to break the code on
purpose and confirm the test fails. If it still passes, the test is decoration.

The same applies to claims, not just tests. Two load-bearing statements in the V3
handoff turned out to be false and both survived review because they sounded right.
One needed a production build and a grep of the client bundle to disprove, the other
needed an on-chain measurement. If a claim decides what you do next, run it.

Before saying something works: `npx tsc --noEmit`, `npx vitest run`,
`npx hardhat test`, `npm run build`. All four, and quote what they printed.

## Commands

```
npm run dev                 next dev
npm run build               production build, the gate before pushing main
npx tsc --noEmit            typecheck
npm run test:unit           vitest, lib/** and app/**
npx hardhat test            all contract tests, three files
npx hardhat compile         needed after any .sol change, see the artifact trap
npm run deploy:v3:base      V3 to Base mainnet
```

`npx hardhat test` runs three files and prints one total. Plans quote the V3 file's
own count, so use `npx hardhat test test/PredictionMarket_V3.test.js` for that.

## Traps that have already cost time here

`lib/contract.ts` calls `require()` on a compiled artifact at build time, which is
why `artifacts/` is committed. Change a contract's name or ABI and you must
`npx hardhat compile` and commit
`artifacts/contracts/PredictionMarket_V3.sol/PredictionMarket_V3.json`. Local builds
pass either way because the file is on disk untracked, so only a clean clone catches
it. This has already broken one Vercel build.

A `process.env.FOO` read in client code is `undefined` in the browser unless FOO
starts with `NEXT_PUBLIC_`. `lib/chains/index.ts` reads three Robinhood contract
addresses without the prefix, so the server and the browser see different chain
configs right now. Anything that decides where money goes must not be what discovers
this.

Base is `readOnly: true` in `lib/chains`, because its deployed contracts are owned by
a compromised key that cannot be recovered. Writes are refused in the app rather than
left to fail on chain. A write path must gate on `isWritableMarket(chainKey, target)`
and pass the address it is about to write to. `getWritableMarket` answers a different
question and is not enough on its own.

`registerPrediction` mines its own block, so a market asked for a 24 hour window
actually has a span of 86399 seconds. Read `createdAt` from `market.predictions(id)`,
and when a test's subject is a bracket boundary, pin the registration block with
`evm_setNextBlockTimestamp` so the span is divisible by 4.

The contract's constructor defaults are not the launch rates. `platformFee` is 1% in
the contract and becomes 3% only when `scripts/deploy_v3.js` runs `setPlatformFee`.

`artifacts/` and `cache/` churn from hardhat runs is normal noise, mostly line
endings. Leave it. It blocks a branch switch only for
`artifacts/contracts/PredictionMarket_V3.sol/`.

## Where the truth lives

`docs/v3/HANDOFF.md` is the current state and the next steps. Read it first.

`docs/v3/rules-v3.md` is the rules of V3 as decided, and the source that the Help &
FAQ and the manifesto get rewritten from. `docs/superpowers/specs/` holds the binding
designs. `docs/superpowers/plans/` holds execution records, which are history and can
describe things that were later removed, so do not copy from a plan.
