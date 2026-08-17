import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS, redisHelpers } from '@/lib/redis';
import { verifyMessage } from 'viem';
import {
  PROPOSAL_HEADERS,
  PROPOSAL_LIMITS,
  buildProposalMessage,
  checkProposalTimestamp,
} from '@/lib/auth/proposalMessage';
import { allocateV3MarketId, MarketIdUnavailableError } from '@/lib/marketAllocator';
import { canonicalMarketId } from '@/lib/marketId';
import type { RedisPrediction } from '@/lib/types/redis';

/**
 * Creates a V3 market proposal.
 *
 * V2 minted markets on chain: the modal called a public `createPrediction`, paid
 * a fee, and the contract's own counter produced the id. V3 has no public
 * creation and no fee. `registerPrediction` is `onlyResolver` and takes both the
 * id and the creator as parameters, so a market now comes into existence in two
 * separate commits: a proposal here, and a registration by the resolver later.
 *
 * That split is the dangerous part, and everything below is arranged around it:
 *
 *  - The id is allocated once, atomically, and written into the record. The
 *    registration step reads it back rather than deriving it again, so the two
 *    commits cannot disagree about which market this is.
 *  - The record is written with needsApproval: true, which routes it into
 *    PREDICTIONS_PENDING_APPROVAL rather than PREDICTIONS_ACTIVE. A record in
 *    the active feed that is not registered on chain shows users a market they
 *    can tap; the bet then reverts with "Prediction not registered". Nobody
 *    loses money, but they will have approved USDC against a market that does
 *    not exist.
 *  - Nothing here writes to a contract. If the registration never happens, the
 *    proposal is inert.
 *
 * Open to anyone with a wallet, which is the point of the product. The
 * signature proves only that the address being credited as creator belongs to
 * the sender, which matters because that address earns 0.5% of every losing
 * pool in the market. It is not an admin check and must not become one.
 *
 * What replaced V2's creation fee is the rate limit, not a toll: a cap per
 * address and a cap on how many proposals may sit unregistered at once. A
 * proposal is inert until a resolver registers it, so the exposure is Redis
 * writes rather than money, and the right control is a limit rather than a
 * price on ordinary use.
 */

interface ProposeBody {
  question?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  includeChart?: boolean;
  selectedCrypto?: string;
  /** Unix seconds. Must be in the future. */
  deadline?: number;
  /** The address credited as creator on chain, and paid the creator fee. */
  creator?: string;
}

const MAX_QUESTION = 200;
const MIN_DURATION_SECONDS = 60 * 60; // one hour, the shortest market worth having
const MAX_DURATION_SECONDS = 365 * 24 * 60 * 60;

function bad(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request: NextRequest) {
  let body: ProposeBody;
  try {
    body = await request.json();
  } catch {
    return bad('Body must be JSON');
  }

  const question = body.question?.trim();
  const creator = body.creator?.trim().toLowerCase();
  const deadline = Number(body.deadline);

  if (!question) return bad('question is required');
  if (question.length > MAX_QUESTION) return bad(`question must be ${MAX_QUESTION} characters or fewer`);
  if (!creator || !/^0x[0-9a-f]{40}$/.test(creator)) return bad('creator must be an address');
  if (!Number.isSafeInteger(deadline)) return bad('deadline must be a unix timestamp in seconds');

  const now = Math.floor(Date.now() / 1000);
  if (deadline - now < MIN_DURATION_SECONDS) return bad('deadline must be at least an hour away');
  if (deadline - now > MAX_DURATION_SECONDS) return bad('deadline must be within a year');

  // Prove the creator address belongs to whoever is sending this. Not an
  // authorisation check: anyone may propose. It stops a proposal crediting
  // somebody else's address, which would hand them the creator fee and put
  // their name on a question they never wrote.
  const signature = request.headers.get(PROPOSAL_HEADERS.signature);
  const claimed = request.headers.get(PROPOSAL_HEADERS.address)?.trim().toLowerCase();
  const rawTimestamp = request.headers.get(PROPOSAL_HEADERS.timestamp);

  const stamp = checkProposalTimestamp(rawTimestamp);
  if (!stamp.ok) return bad(`signature timestamp ${stamp.reason}`, 401);
  if (!signature || !claimed) return bad('signature required', 401);
  if (claimed !== creator) return bad('signature address does not match creator', 401);

  let signatureValid = false;
  try {
    signatureValid = await verifyMessage({
      address: creator as `0x${string}`,
      message: buildProposalMessage({ question, deadline, timestamp: Number(rawTimestamp) }),
      signature: signature as `0x${string}`,
    });
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return bad('signature does not match this proposal', 401);

  // The rate limit is what replaced the creation fee. Per address first.
  const rateKey = `propose:rate:${creator}`;
  const used = await redis.incr(rateKey);
  if (used === 1) {
    await redis.expire(rateKey, PROPOSAL_LIMITS.windowSeconds);
  }
  if (used > PROPOSAL_LIMITS.perAddressPerWindow) {
    return bad(
      `You can propose ${PROPOSAL_LIMITS.perAddressPerWindow} markets a day. Try again tomorrow.`,
      429
    );
  }

  // And a global cap, because a fresh address costs nothing, so a per-address
  // limit alone only forces an attacker to make more wallets. This bounds the
  // queue a human has to review rather than the wallets that can reach it.
  const pending = await redis.scard(REDIS_KEYS.PREDICTIONS_PENDING_APPROVAL());
  if (pending >= PROPOSAL_LIMITS.maxPending) {
    return bad('Too many markets are waiting for review. Try again later.', 503);
  }

  let numericId: number;
  try {
    numericId = await allocateV3MarketId(
      {
        incr: (key) => redis.incr(key),
        get: (key) => redis.get(key),
        set: (key, value) => redis.set(key, value),
      },
      REDIS_KEYS.PREDICTION
    );
  } catch (error) {
    if (error instanceof MarketIdUnavailableError) {
      console.error('[propose]', error.message);
      return bad('Could not allocate a market id', 503);
    }
    throw error;
  }

  const id = canonicalMarketId('v3', numericId);

  const endsAt = new Date(deadline * 1000);
  const prediction: RedisPrediction = {
    id,
    question,
    description: body.description?.trim() ?? '',
    category: body.category?.trim() || 'Other',
    imageUrl: body.imageUrl?.trim() ?? '',
    includeChart: Boolean(body.includeChart),
    selectedCrypto: body.selectedCrypto,
    endDate: endsAt.toISOString().slice(0, 10),
    endTime: endsAt.toISOString().slice(11, 16),
    deadline,
    yesTotalAmount: 0,
    noTotalAmount: 0,
    swipeYesTotalAmount: 0,
    swipeNoTotalAmount: 0,
    // The pool exists once the resolver registers it. Saying so before that
    // would put a bettable-looking market in front of users.
    usdcPoolEnabled: false,
    usdcYesTotalAmount: 0,
    usdcNoTotalAmount: 0,
    resolved: false,
    cancelled: false,
    createdAt: now,
    creator,
    verified: false,
    approved: false,
    // Routes into PREDICTIONS_PENDING_APPROVAL, not the active feed.
    needsApproval: true,
    participants: [],
    totalStakes: 0,
  };

  await redisHelpers.savePrediction(prediction);

  console.log(`[propose] ${id} allocated for ${creator}`);

  return NextResponse.json({
    success: true,
    id,
    numericId,
    // The registration step needs exactly these three, and taking them from
    // here rather than re-deriving them is what keeps the two commits agreeing.
    register: { predictionId: numericId, creator, deadline },
  });
}
