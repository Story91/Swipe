/**
 * HOTFIX. Commit 331fca9 shipped the rename page.tsx -> PredictionPageClient
 * without the new page.tsx that was meant to accompany it: a concurrent
 * workflow had staged its half-done rename in the git index, and git commit
 * commits the whole index, not the files passed to git add. Production 404'd
 * on every market page.
 *
 * PredictionPageClient is byte-identical to the old page (R100), so this shim
 * restores the route with exactly the behaviour it had. If the in-flight
 * markets work wants a server wrapper here later, it replaces this file
 * knowingly.
 */
export { default } from "./PredictionPageClient";
