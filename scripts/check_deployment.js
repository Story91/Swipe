require('dotenv').config({ path: '.env.local' });
const { JsonRpcProvider, Contract } = require('ethers');

/**
 * Asks a chain what is actually deployed, rather than trusting a comment.
 *
 *   node scripts/check_deployment.js
 *
 * Reports, per chain: whether there is bytecode at the configured market
 * address, whether it answers the V4 interface, what collateral it holds,
 * whether that collateral reports 6 decimals, the live fee configuration, and
 * how many markets are registered on it.
 */

const CHAINS = [
  {
    key: 'base',
    rpc: process.env.NEXT_PUBLIC_INFURA_BASE_ENDPOINT
      || process.env.NEXT_PUBLIC_BASE_RPC_URL
      || 'https://mainnet.base.org',
    market: process.env.NEXT_PUBLIC_BASE_V4_CONTRACT || '0x4129d706c283e6bAC749CFe9221AD322981917E6',
    expectedCollateral: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    expectedSymbol: 'USDC',
  },
  {
    key: 'robinhood',
    rpc: process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
    market: process.env.NEXT_PUBLIC_ROBINHOOD_V4_CONTRACT || '0x41a6Fd3d35C0F9DD13773A763358E35B5216eEe4',
    expectedCollateral: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    expectedSymbol: 'USDG',
  },
];

const MARKET_ABI = [
  'function collateral() view returns (address)',
  'function getFeeConfig() view returns (uint256,uint256,uint256,uint256)',
  'function owner() view returns (address)',
  'function resolvers(address) view returns (bool)',
  // V4. Its absence means the deployed code still has registration and
  // settlement behind one role.
  'function registrars(address) view returns (bool)',
  'function getPrediction(uint256) view returns (bool,address,uint256,uint256,uint256,bool,bool,bool,bool,uint256)',
  // V3 only, and the probe must not depend on chain state. weightBpsAt takes a
  // market id, so on a chain with nothing registered it reverts for a reason
  // that has nothing to do with which contract is deployed. These three are
  // constants, so a successful call means the code is there and nothing else.
  'function WEIGHT_EARLY() view returns (uint256)',
  'function WEIGHT_MID() view returns (uint256)',
  'function WEIGHT_LATE() view returns (uint256)',
];

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const OWNER = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e';
const REGISTRAR = process.env.REGISTRAR_ADDRESS;

/**
 * One view call, retried, and never in parallel with another.
 *
 * Public nodes throttle. Infura answers "Too Many Requests" and the public Base
 * node answers "missing revert data", and both arrive looking like the contract
 * said no. Firing reads with Promise.all made this routine. A throttled read
 * must never be reported as a missing function, so the retry is what separates
 * "the chain will not answer" from "the answer is no".
 */
async function call(fn, attempts = 4) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const message = e.shortMessage || e.message || String(e);
      const throttled = /too many requests|missing revert data|missing response|rate|timeout|-32005/i.test(message);
      if (!throttled) throw e;
      if (i < attempts) await new Promise((r) => setTimeout(r, 700 * i));
    }
  }
  throw last;
}

async function probe(chain) {
  console.log(`\n=== ${chain.key} ===`);
  console.log(`rpc      ${chain.rpc}`);
  console.log(`market   ${chain.market}`);

  let provider;
  try {
    provider = new JsonRpcProvider(chain.rpc);
    const net = await provider.getNetwork();
    console.log(`chainId  ${net.chainId}`);
  } catch (e) {
    console.log(`UNREACHABLE: ${e.shortMessage || e.message}`);
    return false;
  }

  const code = await provider.getCode(chain.market);
  if (code === '0x') {
    console.log('bytecode NONE. Nothing is deployed at this address.');
    return false;
  }
  console.log(`bytecode ${(code.length - 2) / 2} bytes`);

  const market = new Contract(chain.market, MARKET_ABI, provider);
  let ok = true;

  try {
    const collateral = await call(() => market.collateral());
    const matches = collateral.toLowerCase() === chain.expectedCollateral.toLowerCase();
    console.log(`collat   ${collateral} ${matches ? 'matches config' : 'DOES NOT MATCH CONFIG'}`);
    if (!matches) ok = false;

    const token = new Contract(collateral, ERC20_ABI, provider);
    const symbol = await call(() => token.symbol());
    const decimals = await call(() => token.decimals());
    const decimalsOk = Number(decimals) === 6;
    console.log(`token    ${symbol}, ${decimals} decimals ${decimalsOk ? '' : '<-- NOT 6, refuse to use'}`);
    if (!decimalsOk || symbol !== chain.expectedSymbol) ok = false;
  } catch (e) {
    console.log(`collat   FAILED: ${e.shortMessage || e.message}`);
    ok = false;
  }

  try {
    const early = await call(() => market.WEIGHT_EARLY());
    const mid = await call(() => market.WEIGHT_MID());
    const late = await call(() => market.WEIGHT_LATE());
    const expected = early === 15000n && mid === 12500n && late === 10000n;
    console.log(
      `version  time weights ${early}/${mid}/${late} ` +
        `${expected ? '(1.50 / 1.25 / 1.00)' : '<-- NOT the launch weights'}`
    );
    if (!expected) ok = false;
  } catch {
    console.log('version  weight constants missing, so this is not V3 or V4');
    ok = false;
  }

  try {
    const [platform, creator, exit, minBet] = await call(() => market.getFeeConfig());
    console.log(`fees     platform ${platform} creator ${creator} exit ${exit} minBet ${minBet}`);
    if (Number(platform) !== 300) console.log('         platform fee is not the 300 launch rate');
  } catch (e) {
    console.log(`fees     FAILED: ${e.shortMessage || e.message}`);
    ok = false;
  }

  try {
    const owner = await call(() => market.owner());
    const isResolver = await call(() => market.resolvers(OWNER));
    console.log(`owner    ${owner} ${owner.toLowerCase() === OWNER.toLowerCase() ? '' : '<-- unexpected'}`);
    console.log(`resolver ${OWNER} ${isResolver ? 'yes' : 'NO'}`);
    if (!isResolver) ok = false;
  } catch (e) {
    console.log(`owner    FAILED: ${e.shortMessage || e.message}`);
    ok = false;
  }

  // The role split is the reason V4 exists, so it is measured rather than
  // assumed. Two separate facts: the registrar can open markets, and it cannot
  // settle them. Either one alone would be a misleading pass.
  if (REGISTRAR) {
    try {
      const canRegister = await call(() => market.registrars(REGISTRAR));
      const canResolve = await call(() => market.resolvers(REGISTRAR));
      console.log(`registr  ${REGISTRAR} register=${canRegister} resolve=${canResolve}`);
      if (!canRegister) {
        console.log('         NOT GRANTED, so the server cannot open markets');
        ok = false;
      }
      if (canResolve) {
        console.log('         ALSO A RESOLVER. The split bought nothing; revoke it.');
        ok = false;
      }
    } catch (e) {
      // A transport failure and a missing function are not the same finding,
      // and reporting one as the other has already happened twice here. Only
      // a decoding failure means the function is absent.
      const message = e.shortMessage || e.message || String(e);
      // Deliberately narrow. BAD_DATA alone is not enough: Infura returns it
      // for "Too Many Requests" as well, so matching on it reports a rate
      // limit as a missing function.
      const absent = /could not decode|no matching fragment|execution reverted/i.test(message);
      console.log(
        absent
          ? 'registr  registrars() is missing, so this is V3, not V4'
          : `registr  UNKNOWN, the call did not complete: ${message}`
      );
      ok = false;
    }
  } else {
    console.log('registr  REGISTRAR_ADDRESS not set, split not checked');
  }

  // Walk forward until an unregistered id, so the count is measured rather
  // than assumed from Redis.
  let registered = 0;
  for (let i = 1; i <= 40; i++) {
    try {
      const p = await call(() => market.getPrediction(i), 2);
      if (!p[0]) break;
      registered++;
    } catch { break; }
  }
  console.log(`markets  ${registered} registered on chain`);

  return ok;
}

(async () => {
  const results = [];
  for (const chain of CHAINS) results.push([chain.key, await probe(chain)]);

  console.log('\n=== summary ===');
  for (const [key, ok] of results) {
    console.log(`${key.padEnd(10)} ${ok ? 'usable V4' : 'NOT USABLE, see above'}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
