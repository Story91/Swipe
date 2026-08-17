// Compares what is on chain against what Redis says, for every market the app
// would list. A mismatch here is the failure mode that already happened once.
require('dotenv').config({ path: '.env.local' });
const { Redis } = require('@upstash/redis');
const { JsonRpcProvider, Contract } = require('ethers');

const MARKET = '0x5C4078BB24f352809B93FF395cA7655835D1CA4a';
const ABI = [
  'function getPrediction(uint256) view returns (bool,address,uint256,uint256,uint256,bool,bool,bool,bool,uint256)',
];

// Every field the card and the bet path read. A record missing one of these
// renders a broken market rather than no market, which is worse.
const REQUIRED = [
  'id', 'question', 'category', 'deadline', 'creator', 'contractVersion',
  'usdcPoolEnabled', 'resolved', 'cancelled', 'needsApproval', 'approved',
];

(async () => {
  const provider = new JsonRpcProvider(process.env.NEXT_PUBLIC_INFURA_BASE_ENDPOINT);
  const market = new Contract(MARKET, ABI, provider);
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const active = await redis.smembers('predictions:active');
  const everything = await redis.smembers('predictions');

  // V3 only. The set still holds V1 and V2 ids, most of them without a record,
  // and they live on contracts this script does not know about. Widening the
  // check to them reports noise, not breakage.
  const all = everything.filter((id) => /^pred_v3_\d+$/.test(id)).sort();
  console.log(`v3 markets : ${all.join(', ') || 'none'}`);
  console.log(`legacy ids : ${everything.length - all.length} v1/v2 entries, not checked`);
  console.log('');

  let bad = 0;
  for (const id of all) {
    const n = Number(id.slice('pred_v3_'.length));
    const raw = await redis.get(`prediction:${id}`);
    const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!rec) { console.log(`${id}  MISSING RECORD`); bad++; continue; }

    const missing = REQUIRED.filter((f) => rec[f] === undefined || rec[f] === null);
    const chain = await market.getPrediction(n);

    const problems = [];
    if (!chain[0]) problems.push('not registered on chain');
    if (chain[1].toLowerCase() !== String(rec.creator).toLowerCase()) {
      problems.push(`creator ${chain[1]} vs ${rec.creator}`);
    }
    if (Number(chain[2]) !== Number(rec.deadline)) {
      problems.push(`deadline ${chain[2]} vs ${rec.deadline}`);
    }
    if (missing.length) problems.push(`missing fields: ${missing.join(', ')}`);
    if (rec.needsApproval) problems.push('needsApproval is true, so it is hidden');
    if (!active.includes(id)) problems.push('not in the active set');

    if (problems.length) bad++;
    console.log(
      `${id}  ${problems.length ? 'BROKEN' : 'ok'}  ` +
        `${rec.selectedCrypto ?? '-'}  ${String(rec.question).slice(0, 46)}`
    );
    problems.forEach((p) => console.log(`         ${p}`));
  }

  console.log('');
  console.log(bad === 0 ? `${all.length} markets, all consistent` : `${bad} broken`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
