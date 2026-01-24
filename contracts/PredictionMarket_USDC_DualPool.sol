// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PredictionMarket_USDC_DualPool
 * @dev USDC-based prediction market that works alongside ETH/SWIPE V2 contract
 * 
 * KEY FEATURES:
 * - Uses USDC as collateral (stablecoin)
 * - Predictions are registered from Redis/V2, not created here
 * - Tradeable positions (can exit anytime with 5% fee)
 * - Creator rewards (0.5% from losers pool)
 * - Platform fee (1% from losers pool)
 * - Same admin resolves as V2 contract
 * 
 * DUAL POOL CONCEPT:
 * - Same prediction can have ETH/SWIPE pool in V2 and USDC pool here
 * - Both pools are independent but resolved with same outcome
 * - predictionId matches Redis ID (e.g., "pred_v2_123" -> 123)
 * 
 * PRICE FORMULA:
 * - YES price = noPool / (yesPool + noPool)
 * - NO price = yesPool / (yesPool + noPool)
 * 
 * PAYOUT FORMULA (at resolution):
 * - Winners get: stake + (stake / winnersPool) * losersPool * 0.985
 * - Platform gets: losersPool * 0.01
 * - Creator gets: losersPool * 0.005
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract PredictionMarket_USDC_DualPool {
    // ============ State Variables ============
    
    address public owner;
    address public pendingOwner;
    IERC20 public immutable usdc;
    
    // Fee configuration (in basis points, 100 = 1%)
    uint256 public platformFee = 100;      // 1% - editable by owner
    uint256 public creatorFee = 50;        // 0.5% - editable by owner
    uint256 public earlyExitFee = 500;     // 5% - editable by owner
    uint256 public constant BASIS_POINTS = 10000;
    
    // Fee limits (to prevent abuse)
    uint256 public constant MAX_PLATFORM_FEE = 500;   // Max 5%
    uint256 public constant MAX_CREATOR_FEE = 200;    // Max 2%
    uint256 public constant MAX_EARLY_EXIT_FEE = 1000; // Max 10%
    
    // Minimum bet amount (editable by owner)
    uint256 public minBet = 1 * 10**6;     // 1 USDC - editable by owner
    uint256 public constant MIN_BET_FLOOR = 100000;   // Absolute minimum 0.1 USDC
    
    // Accumulated fees
    uint256 public platformFeeBalance;
    
    // Authorized resolvers (can resolve predictions)
    mapping(address => bool) public resolvers;
    
    // ============ Structs ============
    
    struct Prediction {
        bool registered;           // Whether this prediction is active for USDC betting
        address creator;           // Who created this prediction (gets 0.5% rewards)
        uint256 deadline;          // When betting closes
        uint256 yesPool;           // Total USDC in YES pool
        uint256 noPool;            // Total USDC in NO pool
        bool resolved;
        bool cancelled;
        bool outcome;              // true = YES won, false = NO won
        uint256 createdAt;         // When registered
        uint256 resolvedAt;
        uint256 creatorReward;     // Accumulated creator reward
    }
    
    struct Position {
        uint256 yesAmount;         // USDC staked on YES
        uint256 noAmount;          // USDC staked on NO
        uint256 yesEntryPrice;     // Average entry price for YES (in basis points)
        uint256 noEntryPrice;      // Average entry price for NO (in basis points)
        bool claimed;
    }
    
    // ============ Mappings ============
    
    mapping(uint256 => Prediction) public predictions;
    mapping(uint256 => mapping(address => Position)) public positions;
    mapping(uint256 => address[]) public participants;
    
    // Track if user already in participants array
    mapping(uint256 => mapping(address => bool)) private isParticipant;
    
    // ============ Events ============
    
    event PredictionRegistered(
        uint256 indexed predictionId,
        address indexed creator,
        uint256 deadline
    );
    
    event BetPlaced(
        uint256 indexed predictionId,
        address indexed user,
        bool isYes,
        uint256 amount,
        uint256 priceAtEntry,
        uint256 newYesPool,
        uint256 newNoPool
    );
    
    event EarlyExit(
        uint256 indexed predictionId,
        address indexed user,
        bool isYes,
        uint256 amount,
        uint256 received,
        uint256 fee
    );
    
    event PredictionResolved(
        uint256 indexed predictionId,
        bool outcome,
        uint256 platformFee,
        uint256 creatorReward,
        uint256 winnersPool,
        uint256 losersPool
    );
    
    event WinningsClaimed(
        uint256 indexed predictionId,
        address indexed user,
        uint256 amount,
        uint256 profit
    );
    
    event PredictionCancelled(uint256 indexed predictionId, string reason);
    event RefundClaimed(uint256 indexed predictionId, address indexed user, uint256 amount);
    event PlatformFeesWithdrawn(address indexed to, uint256 amount);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ResolverUpdated(address indexed resolver, bool authorized);
    event FeeUpdated(string feeType, uint256 newValue);
    event FeesUpdated(uint256 platformFee, uint256 creatorFee, uint256 earlyExitFee);
    event MinBetUpdated(uint256 newMinBet);
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyResolver() {
        require(msg.sender == owner || resolvers[msg.sender], "Not resolver");
        _;
    }
    
    modifier predictionExists(uint256 predictionId) {
        require(predictions[predictionId].registered, "Prediction not registered");
        _;
    }
    
    modifier predictionActive(uint256 predictionId) {
        Prediction storage pred = predictions[predictionId];
        require(pred.registered, "Prediction not registered");
        require(!pred.resolved, "Prediction resolved");
        require(!pred.cancelled, "Prediction cancelled");
        require(block.timestamp < pred.deadline, "Betting closed");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _usdc) {
        require(_usdc != address(0), "Invalid USDC address");
        owner = msg.sender;
        usdc = IERC20(_usdc);
        resolvers[msg.sender] = true;
    }
    
    // ============ Prediction Registration ============
    
    /**
     * @dev Register a prediction for USDC betting (called by admin/backend)
     * @param predictionId The ID matching Redis (e.g., pred_v2_123 -> 123)
     * @param creator The creator's address (receives 0.5% reward)
     * @param deadline Unix timestamp when betting closes
     */
    function registerPrediction(
        uint256 predictionId,
        address creator,
        uint256 deadline
    ) external onlyResolver {
        require(!predictions[predictionId].registered, "Already registered");
        require(deadline > block.timestamp, "Deadline must be future");
        require(creator != address(0), "Invalid creator");
        
        predictions[predictionId] = Prediction({
            registered: true,
            creator: creator,
            deadline: deadline,
            yesPool: 0,
            noPool: 0,
            resolved: false,
            cancelled: false,
            outcome: false,
            createdAt: block.timestamp,
            resolvedAt: 0,
            creatorReward: 0
        });
        
        emit PredictionRegistered(predictionId, creator, deadline);
    }
    
    /**
     * @dev Batch register multiple predictions
     */
    function registerPredictionsBatch(
        uint256[] calldata predictionIds,
        address[] calldata creators,
        uint256[] calldata deadlines
    ) external onlyResolver {
        require(
            predictionIds.length == creators.length && 
            creators.length == deadlines.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < predictionIds.length; i++) {
            if (!predictions[predictionIds[i]].registered && 
                deadlines[i] > block.timestamp &&
                creators[i] != address(0)) {
                
                predictions[predictionIds[i]] = Prediction({
                    registered: true,
                    creator: creators[i],
                    deadline: deadlines[i],
                    yesPool: 0,
                    noPool: 0,
                    resolved: false,
                    cancelled: false,
                    outcome: false,
                    createdAt: block.timestamp,
                    resolvedAt: 0,
                    creatorReward: 0
                });
                
                emit PredictionRegistered(predictionIds[i], creators[i], deadlines[i]);
            }
        }
    }
    
    /**
     * @dev Update prediction deadline (if not yet resolved)
     */
    function updateDeadline(uint256 predictionId, uint256 newDeadline) 
        external 
        onlyResolver 
        predictionExists(predictionId)
    {
        Prediction storage pred = predictions[predictionId];
        require(!pred.resolved && !pred.cancelled, "Prediction ended");
        require(newDeadline > block.timestamp, "Deadline must be future");
        
        pred.deadline = newDeadline;
    }
    
    // ============ Betting ============
    
    /**
     * @dev Place a bet on a prediction
     * @param predictionId The prediction to bet on
     * @param isYes true for YES, false for NO
     * @param amount Amount of USDC to bet (6 decimals)
     */
    function placeBet(
        uint256 predictionId,
        bool isYes,
        uint256 amount
    ) external predictionActive(predictionId) {
        require(amount >= minBet, "Below minimum bet");
        
        Prediction storage pred = predictions[predictionId];
        Position storage pos = positions[predictionId][msg.sender];
        
        // Transfer USDC from user
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        
        // Calculate current price before adding to pool
        uint256 totalPool = pred.yesPool + pred.noPool;
        uint256 currentPrice;
        
        if (totalPool == 0) {
            currentPrice = 5000; // 50% for first bet
        } else if (isYes) {
            currentPrice = (pred.noPool * BASIS_POINTS) / totalPool;
        } else {
            currentPrice = (pred.yesPool * BASIS_POINTS) / totalPool;
        }
        
        // Update pools and positions
        if (isYes) {
            // Calculate weighted average entry price
            if (pos.yesAmount > 0) {
                pos.yesEntryPrice = ((pos.yesEntryPrice * pos.yesAmount) + (currentPrice * amount)) / (pos.yesAmount + amount);
            } else {
                pos.yesEntryPrice = currentPrice;
            }
            pos.yesAmount += amount;
            pred.yesPool += amount;
        } else {
            if (pos.noAmount > 0) {
                pos.noEntryPrice = ((pos.noEntryPrice * pos.noAmount) + (currentPrice * amount)) / (pos.noAmount + amount);
            } else {
                pos.noEntryPrice = currentPrice;
            }
            pos.noAmount += amount;
            pred.noPool += amount;
        }
        
        // Track participant
        if (!isParticipant[predictionId][msg.sender]) {
            participants[predictionId].push(msg.sender);
            isParticipant[predictionId][msg.sender] = true;
        }
        
        emit BetPlaced(
            predictionId, 
            msg.sender, 
            isYes, 
            amount, 
            currentPrice,
            pred.yesPool,
            pred.noPool
        );
    }
    
    // ============ Early Exit (Tradeable Feature) ============
    
    /**
     * @dev Exit a position early with 5% fee
     * @param predictionId The prediction to exit from
     * @param isYes true to exit YES position, false for NO
     * @param amount Amount to exit
     */
    function exitEarly(
        uint256 predictionId,
        bool isYes,
        uint256 amount
    ) external predictionActive(predictionId) {
        Position storage pos = positions[predictionId][msg.sender];
        Prediction storage pred = predictions[predictionId];
        
        uint256 userAmount = isYes ? pos.yesAmount : pos.noAmount;
        require(amount > 0 && amount <= userAmount, "Invalid amount");
        
        uint256 totalPool = pred.yesPool + pred.noPool;
        require(totalPool > 0, "Empty pool");
        
        uint256 oppositePool = isYes ? pred.noPool : pred.yesPool;
        uint256 grossValue;
        uint256 fee;
        uint256 netValue;
        
        if (oppositePool == 0) {
            // SOLO EXIT: No one on opposite side - return stake minus fee
            // User gets 95% of their stake back (5% fee to platform)
            fee = (amount * earlyExitFee) / BASIS_POINTS;
            netValue = amount - fee;
            grossValue = amount;
        } else {
            // NORMAL AMM EXIT: Calculate value based on current price
            uint256 currentPrice = (oppositePool * BASIS_POINTS) / totalPool;
            grossValue = (amount * currentPrice) / BASIS_POINTS;
            fee = (grossValue * earlyExitFee) / BASIS_POINTS;
            netValue = grossValue - fee;
            
            require(netValue > 0, "Exit value too small");
        }
        
        // Ensure we have enough in the contract
        require(netValue <= totalPool, "Insufficient liquidity");
        
        // Update position
        if (isYes) {
            pos.yesAmount -= amount;
            pred.yesPool -= amount;
        } else {
            pos.noAmount -= amount;
            pred.noPool -= amount;
        }
        
        // Add fee to platform balance
        platformFeeBalance += fee;
        
        // Transfer USDC to user
        require(usdc.transfer(msg.sender, netValue), "USDC transfer failed");
        
        emit EarlyExit(predictionId, msg.sender, isYes, amount, netValue, fee);
    }
    
    /**
     * @dev Calculate what user would receive for early exit
     */
    function calculateExitValue(
        uint256 predictionId,
        bool isYes,
        uint256 amount
    ) external view returns (uint256 grossValue, uint256 fee, uint256 netValue) {
        Prediction storage pred = predictions[predictionId];
        uint256 totalPool = pred.yesPool + pred.noPool;
        
        if (totalPool == 0) return (0, 0, 0);
        
        uint256 oppositePool = isYes ? pred.noPool : pred.yesPool;
        
        if (oppositePool == 0) {
            // SOLO EXIT: Return stake minus 5% fee
            grossValue = amount;
            fee = (amount * earlyExitFee) / BASIS_POINTS;
            netValue = amount - fee;
        } else {
            // NORMAL AMM EXIT
            uint256 currentPrice = (oppositePool * BASIS_POINTS) / totalPool;
            grossValue = (amount * currentPrice) / BASIS_POINTS;
            fee = (grossValue * earlyExitFee) / BASIS_POINTS;
            netValue = grossValue - fee;
        }
    }
    
    // ============ Resolution ============
    
    /**
     * @dev Resolve a prediction (only resolver/admin)
     * @param predictionId The prediction to resolve
     * @param outcome true = YES wins, false = NO wins
     */
    function resolvePrediction(
        uint256 predictionId,
        bool outcome
    ) external onlyResolver predictionExists(predictionId) {
        Prediction storage pred = predictions[predictionId];
        require(!pred.resolved, "Already resolved");
        require(!pred.cancelled, "Prediction cancelled");
        
        pred.resolved = true;
        pred.outcome = outcome;
        pred.resolvedAt = block.timestamp;
        
        // Calculate fees from losers pool
        uint256 losersPool = outcome ? pred.noPool : pred.yesPool;
        uint256 winnersPool = outcome ? pred.yesPool : pred.noPool;
        
        uint256 platformFeeAmount;
        uint256 creatorReward;
        
        if (winnersPool == 0) {
            // NO WINNERS: Platform takes all losers pool (house wins)
            // Creator still gets their share
            creatorReward = (losersPool * creatorFee) / BASIS_POINTS;
            platformFeeAmount = losersPool - creatorReward;
        } else {
            // Normal case: standard fees from losers pool
            platformFeeAmount = (losersPool * platformFee) / BASIS_POINTS;
            creatorReward = (losersPool * creatorFee) / BASIS_POINTS;
        }
        
        platformFeeBalance += platformFeeAmount;
        pred.creatorReward = creatorReward;
        
        // Transfer creator reward immediately
        if (creatorReward > 0 && pred.creator != address(0)) {
            require(usdc.transfer(pred.creator, creatorReward), "Creator reward transfer failed");
        }
        
        emit PredictionResolved(predictionId, outcome, platformFeeAmount, creatorReward, winnersPool, losersPool);
    }
    
    // ============ Claiming ============
    
    /**
     * @dev Claim winnings after prediction resolution
     * @param predictionId The prediction to claim from
     */
    function claimWinnings(uint256 predictionId) external predictionExists(predictionId) {
        Prediction storage pred = predictions[predictionId];
        Position storage pos = positions[predictionId][msg.sender];
        
        require(pred.resolved, "Not resolved");
        require(!pos.claimed, "Already claimed");
        
        uint256 winningStake = pred.outcome ? pos.yesAmount : pos.noAmount;
        require(winningStake > 0, "No winning position");
        
        pos.claimed = true;
        
        // Calculate payout
        uint256 winnersPool = pred.outcome ? pred.yesPool : pred.noPool;
        uint256 losersPool = pred.outcome ? pred.noPool : pred.yesPool;
        
        // Deduct fees from losers pool (platform + creator)
        uint256 totalFees = ((platformFee + creatorFee) * losersPool) / BASIS_POINTS;
        uint256 netLosersPool = losersPool - totalFees;
        
        // User's share of the losers pool
        uint256 userShare = winnersPool > 0 ? (winningStake * netLosersPool) / winnersPool : 0;
        uint256 payout = winningStake + userShare;
        uint256 profit = userShare;
        
        require(usdc.transfer(msg.sender, payout), "Payout transfer failed");
        
        emit WinningsClaimed(predictionId, msg.sender, payout, profit);
    }
    
    // ============ Cancellation & Refunds ============
    
    /**
     * @dev Cancel a prediction (only resolver)
     */
    function cancelPrediction(uint256 predictionId, string calldata reason) 
        external 
        onlyResolver 
        predictionExists(predictionId) 
    {
        Prediction storage pred = predictions[predictionId];
        require(!pred.resolved, "Already resolved");
        require(!pred.cancelled, "Already cancelled");
        
        pred.cancelled = true;
        
        emit PredictionCancelled(predictionId, reason);
    }
    
    /**
     * @dev Claim refund for cancelled prediction
     */
    function claimRefund(uint256 predictionId) external predictionExists(predictionId) {
        Prediction storage pred = predictions[predictionId];
        Position storage pos = positions[predictionId][msg.sender];
        
        require(pred.cancelled, "Not cancelled");
        require(!pos.claimed, "Already claimed");
        
        uint256 totalRefund = pos.yesAmount + pos.noAmount;
        require(totalRefund > 0, "No position");
        
        pos.claimed = true;
        
        require(usdc.transfer(msg.sender, totalRefund), "Refund transfer failed");
        
        emit RefundClaimed(predictionId, msg.sender, totalRefund);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @dev Withdraw accumulated platform fees
     */
    function withdrawPlatformFees(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 amount = platformFeeBalance;
        require(amount > 0, "No fees to withdraw");
        
        platformFeeBalance = 0;
        require(usdc.transfer(to, amount), "Withdrawal failed");
        
        emit PlatformFeesWithdrawn(to, amount);
    }
    
    /**
     * @dev Set resolver authorization
     */
    function setResolver(address resolver, bool authorized) external onlyOwner {
        require(resolver != address(0), "Invalid address");
        resolvers[resolver] = authorized;
        emit ResolverUpdated(resolver, authorized);
    }
    
    /**
     * @dev Start ownership transfer (two-step for safety)
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }
    
    /**
     * @dev Accept ownership transfer
     */
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }
    
    /**
     * @dev Emergency withdraw for non-USDC tokens
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(token != address(usdc), "Use rescueOrphanedUSDC for USDC");
        IERC20(token).transfer(owner, amount);
    }
    
    /**
     * @dev Rescue orphaned USDC (from failed exits, bugs, etc.)
     * Only withdraws excess USDC beyond what's tracked in pools + fees
     * @param expectedPoolsTotal Sum of all active prediction pools (calculated off-chain)
     */
    function rescueOrphanedUSDC(uint256 expectedPoolsTotal) external onlyOwner {
        uint256 actualBalance = usdc.balanceOf(address(this));
        uint256 expectedBalance = expectedPoolsTotal + platformFeeBalance;
        
        require(actualBalance > expectedBalance, "No orphaned USDC");
        
        uint256 orphanedAmount = actualBalance - expectedBalance;
        require(usdc.transfer(owner, orphanedAmount), "Rescue transfer failed");
        
        emit OrphanedUSDCRescued(orphanedAmount);
    }
    
    event OrphanedUSDCRescued(uint256 amount);
    
    // ============ Fee Management ============
    
    /**
     * @dev Update platform fee (max 5%)
     */
    function setPlatformFee(uint256 _platformFee) external onlyOwner {
        require(_platformFee <= MAX_PLATFORM_FEE, "Platform fee too high");
        platformFee = _platformFee;
        emit FeeUpdated("platformFee", _platformFee);
    }
    
    /**
     * @dev Update creator fee (max 2%)
     */
    function setCreatorFee(uint256 _creatorFee) external onlyOwner {
        require(_creatorFee <= MAX_CREATOR_FEE, "Creator fee too high");
        creatorFee = _creatorFee;
        emit FeeUpdated("creatorFee", _creatorFee);
    }
    
    /**
     * @dev Update early exit fee (max 10%)
     */
    function setEarlyExitFee(uint256 _earlyExitFee) external onlyOwner {
        require(_earlyExitFee <= MAX_EARLY_EXIT_FEE, "Early exit fee too high");
        earlyExitFee = _earlyExitFee;
        emit FeeUpdated("earlyExitFee", _earlyExitFee);
    }
    
    /**
     * @dev Update all fees at once
     */
    function setAllFees(
        uint256 _platformFee,
        uint256 _creatorFee,
        uint256 _earlyExitFee
    ) external onlyOwner {
        require(_platformFee <= MAX_PLATFORM_FEE, "Platform fee too high");
        require(_creatorFee <= MAX_CREATOR_FEE, "Creator fee too high");
        require(_earlyExitFee <= MAX_EARLY_EXIT_FEE, "Early exit fee too high");
        
        platformFee = _platformFee;
        creatorFee = _creatorFee;
        earlyExitFee = _earlyExitFee;
        
        emit FeesUpdated(_platformFee, _creatorFee, _earlyExitFee);
    }
    
    /**
     * @dev Update minimum bet amount (min 0.1 USDC)
     */
    function setMinBet(uint256 _minBet) external onlyOwner {
        require(_minBet >= MIN_BET_FLOOR, "Min bet too low");
        minBet = _minBet;
        emit MinBetUpdated(_minBet);
    }
    
    /**
     * @dev Get current fee configuration
     */
    function getFeeConfig() external view returns (
        uint256 _platformFee,
        uint256 _creatorFee,
        uint256 _earlyExitFee,
        uint256 _minBet
    ) {
        return (platformFee, creatorFee, earlyExitFee, minBet);
    }
    
    // ============ View Functions ============
    
    /**
     * @dev Get current prices for a prediction
     */
    function getPrices(uint256 predictionId) external view returns (uint256 yesPrice, uint256 noPrice) {
        Prediction storage pred = predictions[predictionId];
        uint256 totalPool = pred.yesPool + pred.noPool;
        
        if (totalPool == 0) {
            return (5000, 5000); // 50/50
        }
        
        yesPrice = (pred.noPool * BASIS_POINTS) / totalPool;
        noPrice = (pred.yesPool * BASIS_POINTS) / totalPool;
    }
    
    /**
     * @dev Get prediction info
     */
    function getPrediction(uint256 predictionId) external view returns (
        bool registered,
        address creator,
        uint256 deadline,
        uint256 yesPool,
        uint256 noPool,
        bool resolved,
        bool cancelled,
        bool outcome,
        uint256 participantCount
    ) {
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
            participants[predictionId].length
        );
    }
    
    /**
     * @dev Get user position
     */
    function getPosition(uint256 predictionId, address user) external view returns (
        uint256 yesAmount,
        uint256 noAmount,
        uint256 yesEntryPrice,
        uint256 noEntryPrice,
        bool claimed
    ) {
        Position storage pos = positions[predictionId][user];
        return (
            pos.yesAmount,
            pos.noAmount,
            pos.yesEntryPrice,
            pos.noEntryPrice,
            pos.claimed
        );
    }
    
    /**
     * @dev Get participant count
     */
    function getParticipantCount(uint256 predictionId) external view returns (uint256) {
        return participants[predictionId].length;
    }
    
    /**
     * @dev Get all participants
     */
    function getParticipants(uint256 predictionId) external view returns (address[] memory) {
        return participants[predictionId];
    }
    
    /**
     * @dev Calculate potential winnings if user bets now
     */
    function calculatePotentialWinnings(
        uint256 predictionId,
        bool isYes,
        uint256 amount
    ) external view returns (uint256 potentialPayout, uint256 potentialProfit) {
        Prediction storage pred = predictions[predictionId];
        
        uint256 currentPool = isYes ? pred.yesPool : pred.noPool;
        uint256 oppositePool = isYes ? pred.noPool : pred.yesPool;
        
        // After adding user's bet
        uint256 newPool = currentPool + amount;
        
        // User's share of the opposite pool (minus fees)
        uint256 netOppositePool = (oppositePool * (BASIS_POINTS - platformFee - creatorFee)) / BASIS_POINTS;
        uint256 userShareOfProfit = newPool > 0 ? (amount * netOppositePool) / newPool : 0;
        
        potentialPayout = amount + userShareOfProfit;
        potentialProfit = userShareOfProfit;
    }
    
    /**
     * @dev Check if prediction is active for betting
     */
    function isPredictionActive(uint256 predictionId) external view returns (bool) {
        Prediction storage pred = predictions[predictionId];
        return pred.registered && 
               !pred.resolved && 
               !pred.cancelled && 
               block.timestamp < pred.deadline;
    }
    
    /**
     * @dev Get contract stats
     */
    function getContractStats() external view returns (
        uint256 pendingFees,
        address usdcAddress
    ) {
        return (platformFeeBalance, address(usdc));
    }
}
