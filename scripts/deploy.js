/**
 * DEPRECATED — this script no longer works.
 *
 * It deployed a contract named "PredictionMarket", which came from
 * contracts/PredictionMarket_Optimized.sol. That file has been removed, so
 * getContractFactory("PredictionMarket") fails with HH701.
 *
 * Use one of the current deploy scripts instead:
 *   npm run deploy:v2    -> scripts/deploy_V2.js                    (PredictionMarketV2)
 *   npm run deploy:usdc  -> scripts/deploy_USDC_DualPool_mainnet.js (PredictionMarket_USDC_DualPool)
 */

console.error(`
❌ scripts/deploy.js is deprecated and non-functional.

   The "PredictionMarket" contract it deploys no longer exists in contracts/.

   Use instead:
     npm run deploy:v2     (PredictionMarketV2)
     npm run deploy:usdc   (PredictionMarket_USDC_DualPool)
`);

process.exit(1);
