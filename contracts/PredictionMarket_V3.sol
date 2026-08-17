// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PredictionMarket_V3
 * @notice Parimutuel YES/NO prediction market collateralised by a 6-decimal
 *         stablecoin (USDC on Base, USDG on Robinhood Chain).
 *
 * Successor to PredictionMarket_USDC_DualPool. Every change from that contract
 * is a fix for a finding in
 * docs/superpowers/specs/2026-08-17-usdc-dualpool-security-audit.md:
 *
 *  1. No house-takes-all branch. A market with no winners becomes refundable
 *     instead of paying its entire pool to the platform, which removed the
 *     incentive for a resolver to settle dishonestly.
 *  2. rescueOrphanedUSDC is gone. It accepted a caller-supplied pool total and
 *     would transfer every user's stake to the owner if given zero. It existed
 *     only to mop up the leak in finding 5, which is now closed, so there is
 *     nothing to rescue.
 *  3. resolvePrediction requires the deadline to have passed.
 *  4. The winners' share is computed once at resolution and stored, so changing
 *     fee rates afterwards cannot alter payouts or overdraw other markets.
 *  5. exitEarly retains exactly what it does not pay out, tracked as fees.
 *  6. SafeERC20 throughout.
 *  7. A permissionless refund path opens once a market is long past its
 *     deadline and still unresolved, so stakes never depend on one key staying
 *     available. The predecessor's owner key was lost and 33.7M SWIPE in the
 *     sibling V2 contract is stranded because of exactly this.
 *  8. Resolvers are a separate, revocable role from the owner, so automation
 *     runs on a narrow hot key while ownership stays cold.
 */
contract PredictionMarket_V3 is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_BET_FLOOR = 100000; // 0.1 token at 6 decimals

    /// @notice How long after the deadline an unresolved market becomes
    ///         refundable to anyone who asks. Long enough for honest operational
    ///         delay, short enough that funds are never stranded for good.
    uint256 public constant REFUND_GRACE_PERIOD = 30 days;

    /// @notice Stake weight by how early in a market's life the bet was placed.
    ///         Brackets are fractions of the market's own window, not fixed
    ///         hours, so a two-hour market and a seven-day one follow one rule.
    uint256 public constant WEIGHT_EARLY = 15000; // x1.50, first quarter
    uint256 public constant WEIGHT_MID = 12500;   // x1.25, second quarter
    uint256 public constant WEIGHT_LATE = 10000;  // x1.00, second half

    // ============ Storage ============

    IERC20 public immutable collateral;

    uint256 public platformFee = 100; // 1%
    uint256 public creatorFee = 50;   // 0.5%
    uint256 public earlyExitFee = 500; // 5%
    uint256 public minBet = 1_000_000; // 1 token at 6 decimals

    uint256 public platformFeeBalance;

    mapping(address => bool) public resolvers;
    /// @notice Pull-based creator rewards. Pushing them during resolution meant
    ///         a creator that cannot receive the token could block resolution
    ///         for everyone in that market.
    mapping(address => uint256) public creatorRewards;

    struct Prediction {
        bool registered;
        address creator;
        uint256 deadline;
        uint256 yesPool;
        uint256 noPool;
        /// @notice Stake times its entry weight. Decides how the losing pool is
        ///         split; the raw pools still decide odds and refunds.
        uint256 weightedYesPool;
        uint256 weightedNoPool;
        bool resolved;
        bool cancelled;
        bool outcome;
        /// @notice Set when a market can never pay out: cancelled, resolved with
        ///         no winners, or abandoned past the grace period.
        bool refundable;
        uint256 createdAt;
        uint256 resolvedAt;
        /// @notice Losers' pool net of fees, fixed at resolution. Claims read
        ///         this rather than recomputing from mutable fee rates.
        uint256 netLosersPool;
        /// @notice Weighted pool of the winning side, fixed at resolution for
        ///         the same reason netLosersPool is.
        uint256 weightedWinnersPool;
        uint256 participantCount;
    }

    struct Position {
        uint256 yesAmount;
        uint256 noAmount;
        uint256 weightedYes;
        uint256 weightedNo;
        bool claimed;
    }

    mapping(uint256 => Prediction) public predictions;
    mapping(uint256 => mapping(address => Position)) public positions;
    mapping(uint256 => address[]) private participants;
    mapping(uint256 => mapping(address => bool)) private isParticipant;

    // ============ Events ============

    event PredictionRegistered(uint256 indexed predictionId, address indexed creator, uint256 deadline);
    event BetPlaced(uint256 indexed predictionId, address indexed user, bool isYes, uint256 amount);
    event EarlyExit(uint256 indexed predictionId, address indexed user, bool isYes, uint256 amount, uint256 netValue, uint256 retained);
    event PredictionResolved(uint256 indexed predictionId, bool outcome, uint256 platformFeeAmount, uint256 creatorReward, uint256 netLosersPool);
    event PredictionRefundable(uint256 indexed predictionId, string reason);
    event WinningsClaimed(uint256 indexed predictionId, address indexed user, uint256 payout);
    event RefundClaimed(uint256 indexed predictionId, address indexed user, uint256 amount);
    event CreatorRewardClaimed(address indexed creator, uint256 amount);
    event ResolverSet(address indexed resolver, bool enabled);

    // ============ Modifiers ============

    modifier onlyResolver() {
        require(msg.sender == owner() || resolvers[msg.sender], "Not a resolver");
        _;
    }

    modifier predictionExists(uint256 predictionId) {
        require(predictions[predictionId].registered, "Prediction not registered");
        _;
    }

    modifier bettingOpen(uint256 predictionId) {
        Prediction storage pred = predictions[predictionId];
        require(pred.registered, "Prediction not registered");
        require(!pred.resolved && !pred.cancelled && !pred.refundable, "Market closed");
        require(block.timestamp < pred.deadline, "Betting closed");
        _;
    }

    // ============ Constructor ============

    constructor(address collateralToken) Ownable(msg.sender) {
        require(collateralToken != address(0), "Collateral required");
        collateral = IERC20(collateralToken);
        resolvers[msg.sender] = true;
    }

    // ============ Registration ============

    function registerPrediction(
        uint256 predictionId,
        address creator,
        uint256 deadline
    ) external onlyResolver {
        _register(predictionId, creator, deadline);
    }

    function registerPredictionsBatch(
        uint256[] calldata predictionIds,
        address[] calldata creators,
        uint256[] calldata deadlines
    ) external onlyResolver {
        require(
            predictionIds.length == creators.length && creators.length == deadlines.length,
            "Length mismatch"
        );
        // Reverts on any invalid entry rather than skipping it: the predecessor
        // silently skipped, making a partial batch indistinguishable from success.
        for (uint256 i = 0; i < predictionIds.length; i++) {
            _register(predictionIds[i], creators[i], deadlines[i]);
        }
    }

    function _register(uint256 predictionId, address creator, uint256 deadline) private {
        Prediction storage pred = predictions[predictionId];
        require(!pred.registered, "Already registered");
        require(creator != address(0), "Creator required");
        require(deadline > block.timestamp, "Deadline in the past");

        pred.registered = true;
        pred.creator = creator;
        pred.deadline = deadline;
        pred.createdAt = block.timestamp;

        emit PredictionRegistered(predictionId, creator, deadline);
    }

    // ============ Betting ============

    function placeBet(
        uint256 predictionId,
        bool isYes,
        uint256 amount
    ) external nonReentrant bettingOpen(predictionId) {
        require(amount >= minBet, "Below minimum bet");

        Prediction storage pred = predictions[predictionId];
        Position storage pos = positions[predictionId][msg.sender];

        collateral.safeTransferFrom(msg.sender, address(this), amount);

        uint256 weighted = (amount * weightBpsAt(predictionId, block.timestamp)) / BASIS_POINTS;

        if (isYes) {
            pos.yesAmount += amount;
            pred.yesPool += amount;
            pos.weightedYes += weighted;
            pred.weightedYesPool += weighted;
        } else {
            pos.noAmount += amount;
            pred.noPool += amount;
            pos.weightedNo += weighted;
            pred.weightedNoPool += weighted;
        }

        if (!isParticipant[predictionId][msg.sender]) {
            isParticipant[predictionId][msg.sender] = true;
            participants[predictionId].push(msg.sender);
            pred.participantCount++;
        }

        emit BetPlaced(predictionId, msg.sender, isYes, amount);
    }

    /**
     * @notice Sell part of a position back before the deadline.
     * @dev The pool loses the full notional and the contract pays out netValue;
     *      the difference is retained and booked as platform fees. The
     *      predecessor left that difference untracked, which is what created
     *      "orphaned" balances and the drain function written to collect them.
     */
    function exitEarly(
        uint256 predictionId,
        bool isYes,
        uint256 amount
    ) external nonReentrant bettingOpen(predictionId) {
        Prediction storage pred = predictions[predictionId];
        Position storage pos = positions[predictionId][msg.sender];

        uint256 held = isYes ? pos.yesAmount : pos.noAmount;
        uint256 heldWeighted = isYes ? pos.weightedYes : pos.weightedNo;
        require(amount > 0 && amount <= held, "Invalid amount");

        // Emptying a side turns resolution into a no-winners refund, which is
        // how a bettor holding a large losing position and a token-sized
        // winning one converts a certain loss into a full refund. Guarding
        // only the final quarter keeps that shut when the outcome is knowable,
        // without stranding the sole backer of a side in a thin market — which
        // here is the common case, not the exception.
        uint256 window = pred.deadline - pred.createdAt;
        uint256 elapsed = block.timestamp - pred.createdAt;
        if (elapsed * 4 >= window * 3) {
            require(
                (isYes ? pred.yesPool : pred.noPool) - amount > 0,
                "Would empty the pool"
            );
        }

        uint256 totalPool = pred.yesPool + pred.noPool;
        require(totalPool > 0, "Empty pool");

        uint256 oppositePool = isYes ? pred.noPool : pred.yesPool;

        uint256 grossValue;
        if (oppositePool == 0) {
            grossValue = amount; // nobody on the other side: principal back, less the exit fee
        } else {
            uint256 price = (oppositePool * BASIS_POINTS) / totalPool;
            grossValue = (amount * price) / BASIS_POINTS;
        }

        uint256 fee = (grossValue * earlyExitFee) / BASIS_POINTS;
        uint256 netValue = grossValue - fee;
        require(netValue > 0, "Exit value too small");

        // Rounded UP, against the exiting user. Rounding down would leave them
        // holding weight their remaining stake does not back — a slow leak paid
        // for by every other winner in this market. A full exit still lands on
        // exactly heldWeighted.
        uint256 weightedRemoved = (heldWeighted * amount + held - 1) / held;

        if (isYes) {
            pos.yesAmount -= amount;
            pred.yesPool -= amount;
            pos.weightedYes -= weightedRemoved;
            pred.weightedYesPool -= weightedRemoved;
        } else {
            pos.noAmount -= amount;
            pred.noPool -= amount;
            pos.weightedNo -= weightedRemoved;
            pred.weightedNoPool -= weightedRemoved;
        }

        // Everything the pool gave up that the user did not receive.
        uint256 retained = amount - netValue;
        platformFeeBalance += retained;

        collateral.safeTransfer(msg.sender, netValue);

        emit EarlyExit(predictionId, msg.sender, isYes, amount, netValue, retained);
    }

    // ============ Resolution ============

    function resolvePrediction(
        uint256 predictionId,
        bool outcome
    ) external onlyResolver predictionExists(predictionId) {
        Prediction storage pred = predictions[predictionId];
        require(!pred.resolved, "Already resolved");
        require(!pred.cancelled, "Prediction cancelled");
        require(!pred.refundable, "Prediction refundable");
        // The predecessor allowed settlement while betting was still open.
        require(block.timestamp >= pred.deadline, "Deadline not reached");

        uint256 winnersPool = outcome ? pred.yesPool : pred.noPool;
        uint256 losersPool = outcome ? pred.noPool : pred.yesPool;

        pred.resolved = true;
        pred.outcome = outcome;
        pred.resolvedAt = block.timestamp;

        if (winnersPool == 0) {
            // Nobody backed the winning side. The predecessor handed the entire
            // losing pool to the platform, which paid a resolver ~99.5% of every
            // pool for choosing the empty side. Everyone gets their stake back.
            pred.refundable = true;
            emit PredictionRefundable(predictionId, "No winners");
            emit PredictionResolved(predictionId, outcome, 0, 0, 0);
            return;
        }

        uint256 platformFeeAmount = (losersPool * platformFee) / BASIS_POINTS;
        uint256 creatorReward = (losersPool * creatorFee) / BASIS_POINTS;

        platformFeeBalance += platformFeeAmount;
        creatorRewards[pred.creator] += creatorReward;

        // Fixed here, so later fee changes cannot alter what this market pays.
        pred.netLosersPool = losersPool - platformFeeAmount - creatorReward;
        pred.weightedWinnersPool = outcome ? pred.weightedYesPool : pred.weightedNoPool;

        emit PredictionResolved(predictionId, outcome, platformFeeAmount, creatorReward, pred.netLosersPool);
    }

    function cancelPrediction(
        uint256 predictionId,
        string calldata reason
    ) external onlyResolver predictionExists(predictionId) {
        Prediction storage pred = predictions[predictionId];
        require(!pred.resolved && !pred.cancelled, "Already settled");

        pred.cancelled = true;
        pred.refundable = true;

        emit PredictionRefundable(predictionId, reason);
    }

    /**
     * @notice Open refunds on a market abandoned past the grace period.
     * @dev Callable by anyone on purpose. If the resolver keys are lost, this is
     *      what stops stakes being stranded for good — the failure mode that
     *      permanently locked 33.7M SWIPE in the sibling V2 contract.
     */
    function enableRefundsAfterGrace(uint256 predictionId) external predictionExists(predictionId) {
        Prediction storage pred = predictions[predictionId];
        require(!pred.resolved && !pred.cancelled && !pred.refundable, "Already settled");
        require(block.timestamp > pred.deadline + REFUND_GRACE_PERIOD, "Grace period not over");

        pred.refundable = true;
        emit PredictionRefundable(predictionId, "Abandoned past grace period");
    }

    // ============ Claiming ============

    function claimWinnings(uint256 predictionId) external nonReentrant predictionExists(predictionId) {
        Prediction storage pred = predictions[predictionId];
        Position storage pos = positions[predictionId][msg.sender];

        require(pred.resolved && !pred.refundable, "Not claimable");
        require(!pos.claimed, "Already claimed");

        uint256 winningStake = pred.outcome ? pos.yesAmount : pos.noAmount;
        require(winningStake > 0, "No winning position");

        uint256 weightedStake = pred.outcome ? pos.weightedYes : pos.weightedNo;
        // Stake returns raw; only the share of the losing pool is weighted.
        // Summed over winners the second term is exactly netLosersPool, minus
        // integer dust that stays in the contract as it always has.
        uint256 payout = winningStake
            + (weightedStake * pred.netLosersPool) / pred.weightedWinnersPool;

        pos.claimed = true;
        collateral.safeTransfer(msg.sender, payout);

        emit WinningsClaimed(predictionId, msg.sender, payout);
    }

    function claimRefund(uint256 predictionId) external nonReentrant predictionExists(predictionId) {
        Prediction storage pred = predictions[predictionId];
        Position storage pos = positions[predictionId][msg.sender];

        require(pred.refundable, "Not refundable");
        require(!pos.claimed, "Already claimed");

        uint256 amount = pos.yesAmount + pos.noAmount;
        require(amount > 0, "Nothing to refund");

        pos.claimed = true;
        collateral.safeTransfer(msg.sender, amount);

        emit RefundClaimed(predictionId, msg.sender, amount);
    }

    function claimCreatorReward() external nonReentrant {
        uint256 amount = creatorRewards[msg.sender];
        require(amount > 0, "Nothing to claim");

        creatorRewards[msg.sender] = 0;
        collateral.safeTransfer(msg.sender, amount);

        emit CreatorRewardClaimed(msg.sender, amount);
    }

    // ============ Views ============

    function getPrediction(uint256 predictionId)
        external
        view
        returns (
            bool registered,
            address creator,
            uint256 deadline,
            uint256 yesPool,
            uint256 noPool,
            bool resolved,
            bool cancelled,
            bool outcome,
            bool refundable,
            uint256 participantCount
        )
    {
        Prediction storage pred = predictions[predictionId];
        return (
            pred.registered,
            pred.creator,
            pred.deadline,
            pred.yesPool,
            pred.noPool,
            pred.resolved,
            pred.cancelled,
            pred.outcome,
            pred.refundable,
            pred.participantCount
        );
    }

    function getPrices(uint256 predictionId) external view returns (uint256 yesPrice, uint256 noPrice) {
        Prediction storage pred = predictions[predictionId];
        uint256 total = pred.yesPool + pred.noPool;
        if (total == 0) return (BASIS_POINTS / 2, BASIS_POINTS / 2);
        return ((pred.noPool * BASIS_POINTS) / total, (pred.yesPool * BASIS_POINTS) / total);
    }

    /**
     * @notice The weight a bet placed at `timestamp` would carry.
     * @dev Public because the UI shows the live multiplier and counts down to
     *      the next bracket. Comparisons multiply rather than divide, so no
     *      integer division decides a bracket.
     */
    function weightBpsAt(uint256 predictionId, uint256 timestamp)
        public
        view
        predictionExists(predictionId)
        returns (uint256)
    {
        Prediction storage pred = predictions[predictionId];
        if (timestamp <= pred.createdAt) return WEIGHT_EARLY;
        if (timestamp >= pred.deadline) return WEIGHT_LATE;

        // _register requires deadline > block.timestamp and sets createdAt to
        // block.timestamp, so this window is always positive.
        uint256 window = pred.deadline - pred.createdAt;
        uint256 elapsed = timestamp - pred.createdAt;

        if (elapsed * 4 < window) return WEIGHT_EARLY;
        if (elapsed * 2 < window) return WEIGHT_MID;
        return WEIGHT_LATE;
    }

    function getParticipants(uint256 predictionId) external view returns (address[] memory) {
        return participants[predictionId];
    }

    function getFeeConfig()
        external
        view
        returns (uint256 platform, uint256 creator, uint256 exit, uint256 minimumBet)
    {
        return (platformFee, creatorFee, earlyExitFee, minBet);
    }

    // ============ Admin ============

    function setResolver(address resolver, bool enabled) external onlyOwner {
        require(resolver != address(0), "Zero address");
        resolvers[resolver] = enabled;
        emit ResolverSet(resolver, enabled);
    }

    function setPlatformFee(uint256 newFee) external onlyOwner {
        require(newFee <= 500, "Fee too high");
        platformFee = newFee;
    }

    function setCreatorFee(uint256 newFee) external onlyOwner {
        require(newFee <= 200, "Fee too high");
        creatorFee = newFee;
    }

    function setEarlyExitFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1000, "Fee too high");
        earlyExitFee = newFee;
    }

    function setMinBet(uint256 newMinBet) external onlyOwner {
        require(newMinBet >= MIN_BET_FLOOR, "Below floor");
        minBet = newMinBet;
    }

    function withdrawPlatformFees(address to) external onlyOwner nonReentrant {
        require(to != address(0), "Zero address");
        uint256 amount = platformFeeBalance;
        require(amount > 0, "Nothing to withdraw");

        platformFeeBalance = 0;
        collateral.safeTransfer(to, amount);
    }

    /**
     * @notice Recover tokens sent here by mistake.
     * @dev Cannot touch the collateral: that balance belongs to open pools,
     *      booked fees and unclaimed creator rewards. There is deliberately no
     *      owner path to the collateral beyond withdrawPlatformFees.
     */
    function rescueForeignToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(collateral), "Collateral is not rescuable");
        require(to != address(0), "Zero address");
        IERC20(token).safeTransfer(to, amount);
    }
}
