import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_KEYS, redisHelpers } from '@/lib/redis';
import { requireAdmin } from '@/lib/auth/requireAdmin';
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
 * Gated on the admin signature for now. V2's spam control was the creation fee,
 * and V3 removed it without putting anything in its place, so opening this to
 * every visitor would be an unbounded write endpoint. Whether market creation
 * becomes public again, and what limits it, is a product decision rather than
 * something to settle by leaving the door open.
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
  const auth = await requireAdmin(request, 'propose');
  if (!auth.ok) return auth.response;

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

  console.log(`[propose] ${id} allocated for ${creator}, proposed by ${auth.address}`);

  return NextResponse.json({
    success: true,
    id,
    numericId,
    // The registration step needs exactly these three, and taking them from
    // here rather than re-deriving them is what keeps the two commits agreeing.
    register: { predictionId: numericId, creator, deadline },
  });
}
