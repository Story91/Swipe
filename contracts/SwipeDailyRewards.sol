// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SwipeDailyRewards - Daily task rewards system for SWIPE token
 * @dev Allows users to claim daily SWIPE rewards with streaks, jackpots, and task bonuses
 * 
 * Pool: 250M SWIPE
 * 
 * Reward Structure:
 * - Base daily claim: 50,000 SWIPE
 * - Streak bonus: +10,000 SWIPE per day (max +100,000 at 10 days)
 * - Jackpot: 5% chance for 250,000 SWIPE extra
 * 
 * Tasks (verified off-chain):
 * - Share cast: +50,000 SWIPE
 * - Create prediction: +75,000 SWIPE
 * - Trading volume: +100,000 SWIPE
 * - Invite friend: +150,000 SWIPE each
 * 
 * Achievements (one-time):
 * - Beta tester: 500,000 SWIPE
 * - Follow socials: 100,000 SWIPE
 * - 7-day streak: 250,000 SWIPE
 * - 30-day streak: 1,000,000 SWIPE
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SwipeDailyRewards {
    // Immutable state
    address public owner;
    IERC20 public immutable swipeToken;
    
    // Reward constants - base ~50k SWIPE minimum
    uint256 public constant BASE_DAILY_REWARD = 50_000 * 10**18;      // 50,000 SWIPE
    uint256 public constant STREAK_BONUS_PER_DAY = 10_000 * 10**18;   // +10,000 SWIPE per streak day
    uint256 public constant MAX_STREAK_BONUS_DAYS = 10;               // Max 10 days for streak bonus (+100k max)
    uint256 public constant JACKPOT_AMOUNT = 250_000 * 10**18;        // 250,000 SWIPE jackpot
    uint256 public constant JACKPOT_CHANCE = 5;                        // 5% chance
    
    // Task reward constants - 50k-100k range
    uint256 public constant SHARE_CAST_REWARD = 50_000 * 10**18;       // Share on Farcaster
    uint256 public constant CREATE_PREDICTION_REWARD = 75_000 * 10**18; // Create prediction
    uint256 public constant TRADING_VOLUME_REWARD = 100_000 * 10**18;  // Volume >500 SWIPE
    uint256 public constant REFERRAL_REWARD = 150_000 * 10**18;        // Invite friend (each)
    
    // Achievement reward constants
    uint256 public constant BETA_TESTER_REWARD = 500_000 * 10**18;     // 500k SWIPE
    uint256 public constant FOLLOW_SOCIALS_REWARD = 100_000 * 10**18;  // 100k SWIPE
    uint256 public constant STREAK_7_REWARD = 250_000 * 10**18;        // 250k SWIPE
    uint256 public constant STREAK_30_REWARD = 1_000_000 * 10**18;     // 1M SWIPE
    
    // Pool configuration
    uint256 public constant INITIAL_POOL_SIZE = 250_000_000 * 10**18; // 250M SWIPE
    
    // State variables
    uint256 public totalDistributed;
    uint256 public totalUsers;
    uint256 public totalClaims;
    address public taskVerifier; // Backend wallet for task signature verification
    bool public claimingEnabled = true;
    bool public paused = false;
    
    // User data structure
    struct UserData {
        uint256 lastClaimTimestamp;
        uint256 currentStreak;
        uint256 longestStreak;
        uint256 totalClaimed;
        uint256 lastTaskResetDay;
        uint256 jackpotsWon;
        bool isBetaTester;
        bool hasFollowedSocials;
        bool hasStreak7Achievement;
        bool hasStreak30Achievement;
    }
    
    // Daily task completion tracking (reset every 24h)
    struct DailyTasks {
        bool shareCast;
        bool createPrediction;
        bool tradingVolume;
        uint256 resetDay;
    }
    
    // Mappings
    mapping(address => UserData) public users;
    mapping(address => DailyTasks) public dailyTasks;
    mapping(address => address) public referredBy;
    mapping(address => uint256) public referralCount;
    mapping(address => bool) public hasUsedReferral; // Track if user has used a referral
    
    // Events
    event DailyClaimed(
        address indexed user, 
        uint256 baseAmount, 
        uint256 streakBonus, 
        uint256 totalAmount, 
        uint256 currentStreak, 
        bool wonJackpot
    );
    event TaskCompleted(address indexed user, string taskType, uint256 reward);
    event AchievementUnlocked(address indexed user, string achievement, uint256 reward);
    event ReferralRegistered(address indexed referrer, address indexed referred, uint256 rewardEach);
    event TaskVerifierUpdated(address indexed newVerifier);
    event ClaimingToggled(bool enabled);
    event Paused(bool isPaused);
    event EmergencyWithdraw(address indexed to, uint256 amount);
    event SwipeDeposited(address indexed from, uint256 amount);
    event DepositCapReached(uint256 totalDeposited);  // Warn at 90% capacity
    
    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    
    modifier whenClaimingEnabled() {
        require(claimingEnabled, "Claiming is disabled");
        _;
    }
    
    /**
     * @dev Constructor
     * @param _swipeToken Address of SWIPE token contract
     * @param _taskVerifier Address of backend wallet for task verification
     */
    constructor(address _swipeToken, address _taskVerifier) {
        require(_swipeToken != address(0), "Invalid token address");
        require(_taskVerifier != address(0), "Invalid verifier address");
        
        owner = msg.sender;
        swipeToken = IERC20(_swipeToken);
        taskVerifier = _taskVerifier;
    }
    
    // ============ MAIN CLAIM FUNCTION ============
    
    /**
     * @dev Claim daily SWIPE rewards
     * - Base reward: 500 SWIPE
     * - Streak bonus: up to +1500 SWIPE at 15 days
     * - Jackpot: 5% chance for +5000 SWIPE
     */
    function claimDaily() external whenNotPaused whenClaimingEnabled {
        UserData storage user = users[msg.sender];
        
        // Check cooldown (24 hours)
        require(
            block.timestamp >= user.lastClaimTimestamp + 1 days,
            "Already claimed today"
        );
        
        // First time user
        if (user.lastClaimTimestamp == 0) {
            totalUsers++;
        }
        
        // Update streak
        if (user.lastClaimTimestamp > 0 && 
            block.timestamp <= user.lastClaimTimestamp + 2 days) {
            // Within streak window - continue streak
            user.currentStreak++;
        } else {
            // Reset streak
            user.currentStreak = 1;
        }
        
        // Update longest streak record
        if (user.currentStreak > user.longestStreak) {
            user.longestStreak = user.currentStreak;
        }
        
        // Calculate base reward
        uint256 baseReward = BASE_DAILY_REWARD;
        
        // Calculate streak bonus (capped at MAX_STREAK_BONUS_DAYS)
        uint256 streakDays = user.currentStreak > MAX_STREAK_BONUS_DAYS 
            ? MAX_STREAK_BONUS_DAYS 
            : user.currentStreak;
        uint256 streakBonus = streakDays * STREAK_BONUS_PER_DAY;
        
        uint256 totalReward = baseReward + streakBonus;
        
        // Jackpot check (pseudo-random)
        bool wonJackpot = _checkJackpot(msg.sender);
        if (wonJackpot) {
            totalReward += JACKPOT_AMOUNT;
            user.jackpotsWon++;
        }
        
        // Check sufficient balance
        require(
            swipeToken.balanceOf(address(this)) >= totalReward,
            "Insufficient pool balance"
        );
        
        // Update state
        user.lastClaimTimestamp = block.timestamp;
        user.totalClaimed += totalReward;
        totalDistributed += totalReward;
        totalClaims++;
        
        // Reset daily tasks if it's a new day
        _resetDailyTasksIfNeeded(msg.sender);
        
        // Check streak achievements
        _checkStreakAchievements(msg.sender);
        
        // Transfer tokens
        require(
            swipeToken.transfer(msg.sender, totalReward),
            "Transfer failed"
        );
        
        emit DailyClaimed(
            msg.sender, 
            baseReward, 
            streakBonus, 
            totalReward, 
            user.currentStreak, 
            wonJackpot
        );
    }
    
    // ============ TASK COMPLETION ============
    
    /**
     * @dev Complete a daily task (verified by backend signature)
     * @param taskType Type of task ("SHARE_CAST", "CREATE_PREDICTION", "TRADING_VOLUME")
     * @param signature Backend signature proving task completion
     */
    function completeTask(
        string calldata taskType,
        bytes calldata signature
    ) external whenNotPaused {
        // Verify signature from backend
        require(
            _verifyTaskSignature(msg.sender, taskType, signature),
            "Invalid signature"
        );
        
        // Reset daily tasks if needed
        _resetDailyTasksIfNeeded(msg.sender);
        
        DailyTasks storage tasks = dailyTasks[msg.sender];
        uint256 reward = 0;
        
        bytes32 taskHash = keccak256(bytes(taskType));
        
        if (taskHash == keccak256("SHARE_CAST")) {
            require(!tasks.shareCast, "Task already completed today");
            tasks.shareCast = true;
            reward = SHARE_CAST_REWARD;
        } else if (taskHash == keccak256("CREATE_PREDICTION")) {
            require(!tasks.createPrediction, "Task already completed today");
            tasks.createPrediction = true;
            reward = CREATE_PREDICTION_REWARD;
        } else if (taskHash == keccak256("TRADING_VOLUME")) {
            require(!tasks.tradingVolume, "Task already completed today");
            tasks.tradingVolume = true;
            reward = TRADING_VOLUME_REWARD;
        } else {
            revert("Invalid task type");
        }
        
        require(
            swipeToken.balanceOf(address(this)) >= reward,
            "Insufficient pool balance"
        );
        
        users[msg.sender].totalClaimed += reward;
        totalDistributed += reward;
        
        require(swipeToken.transfer(msg.sender, reward), "Transfer failed");
        
        emit TaskCompleted(msg.sender, taskType, reward);
    }
    
    /**
     * @dev Claim one-time achievements (verified by backend signature)
     * @param achievementType Type of achievement ("BETA_TESTER", "FOLLOW_SOCIALS")
     * @param signature Backend signature proving achievement
     */
    function claimAchievement(
        string calldata achievementType,
        bytes calldata signature
    ) external whenNotPaused {
        require(
            _verifyTaskSignature(msg.sender, achievementType, signature),
            "Invalid signature"
        );
        
        UserData storage user = users[msg.sender];
        uint256 reward = 0;
        
        bytes32 achievementHash = keccak256(bytes(achievementType));
        
        if (achievementHash == keccak256("BETA_TESTER")) {
            require(!user.isBetaTester, "Already claimed");
            user.isBetaTester = true;
            reward = BETA_TESTER_REWARD;
        } else if (achievementHash == keccak256("FOLLOW_SOCIALS")) {
            require(!user.hasFollowedSocials, "Already claimed");
            user.hasFollowedSocials = true;
            reward = FOLLOW_SOCIALS_REWARD;
        } else {
            revert("Invalid achievement type");
        }
        
        require(
            swipeToken.balanceOf(address(this)) >= reward,
            "Insufficient pool balance"
        );
        
        user.totalClaimed += reward;
        totalDistributed += reward;
        
        require(swipeToken.transfer(msg.sender, reward), "Transfer failed");
        
        emit AchievementUnlocked(msg.sender, achievementType, reward);
    }
    
    // ============ REFERRAL SYSTEM ============
    
    /**
     * @dev Register a referral (both parties get rewards)
     * @param referrer Address of the referrer
     */
    function registerReferral(address referrer) external whenNotPaused {
        require(!hasUsedReferral[msg.sender], "Already used referral");
        require(referrer != msg.sender, "Cannot refer yourself");
        require(referrer != address(0), "Invalid referrer");
        require(users[referrer].lastClaimTimestamp > 0, "Referrer must be active user");
        
        hasUsedReferral[msg.sender] = true;
        referredBy[msg.sender] = referrer;
        referralCount[referrer]++;
        
        uint256 totalReward = REFERRAL_REWARD * 2;
        require(
            swipeToken.balanceOf(address(this)) >= totalReward,
            "Insufficient pool balance"
        );
        
        // Reward referrer
        users[referrer].totalClaimed += REFERRAL_REWARD;
        totalDistributed += REFERRAL_REWARD;
        require(swipeToken.transfer(referrer, REFERRAL_REWARD), "Transfer to referrer failed");
        
        // Reward new user
        users[msg.sender].totalClaimed += REFERRAL_REWARD;
        totalDistributed += REFERRAL_REWARD;
        require(swipeToken.transfer(msg.sender, REFERRAL_REWARD), "Transfer to referred failed");
        
        emit ReferralRegistered(referrer, msg.sender, REFERRAL_REWARD);
    }
    
    // ============ VIEW FUNCTIONS ============
    
    /**
     * @dev Get comprehensive user stats
     */
    function getUserStats(address user) external view returns (
        uint256 lastClaimTimestamp,
        uint256 currentStreak,
        uint256 longestStreak,
        uint256 totalClaimed,
        uint256 jackpotsWon,
        bool canClaimToday,
        uint256 nextClaimTime,
        uint256 potentialReward
    ) {
        UserData storage userData = users[user];
        
        lastClaimTimestamp = userData.lastClaimTimestamp;
        currentStreak = userData.currentStreak;
        longestStreak = userData.longestStreak;
        totalClaimed = userData.totalClaimed;
        jackpotsWon = userData.jackpotsWon;
        
        // Can claim if never claimed or 24h passed
        canClaimToday = userData.lastClaimTimestamp == 0 || 
                        block.timestamp >= userData.lastClaimTimestamp + 1 days;
        
        // Calculate next claim time
        if (canClaimToday) {
            nextClaimTime = 0;
        } else {
            nextClaimTime = userData.lastClaimTimestamp + 1 days;
        }
        
        // Calculate potential reward (assuming streak continues)
        uint256 nextStreak = canClaimToday ? 
            (userData.lastClaimTimestamp > 0 && block.timestamp <= userData.lastClaimTimestamp + 2 days ? 
                userData.currentStreak + 1 : 1) : 
            userData.currentStreak;
        uint256 streakDays = nextStreak > MAX_STREAK_BONUS_DAYS ? MAX_STREAK_BONUS_DAYS : nextStreak;
        potentialReward = BASE_DAILY_REWARD + (streakDays * STREAK_BONUS_PER_DAY);
    }
    
    /**
     * @dev Get user's daily task completion status
     */
    function getUserDailyTasks(address user) external view returns (
        bool shareCast,
        bool createPrediction,
        bool tradingVolume,
        bool needsReset
    ) {
        DailyTasks storage tasks = dailyTasks[user];
        uint256 currentDay = block.timestamp / 1 days;
        
        // Check if tasks need reset
        needsReset = tasks.resetDay != currentDay;
        
        if (needsReset) {
            // Would be reset, so all are false
            return (false, false, false, true);
        }
        
        return (tasks.shareCast, tasks.createPrediction, tasks.tradingVolume, false);
    }
    
    /**
     * @dev Get user's achievements status
     */
    function getUserAchievements(address user) external view returns (
        bool isBetaTester,
        bool hasFollowedSocials,
        bool hasStreak7,
        bool hasStreak30,
        uint256 referrals
    ) {
        UserData storage userData = users[user];
        return (
            userData.isBetaTester,
            userData.hasFollowedSocials,
            userData.hasStreak7Achievement,
            userData.hasStreak30Achievement,
            referralCount[user]
        );
    }
    
    /**
     * @dev Get pool statistics
     */
    function getPoolStats() external view returns (
        uint256 poolBalance,
        uint256 distributed,
        uint256 userCount,
        uint256 claimCount
    ) {
        return (
            swipeToken.balanceOf(address(this)),
            totalDistributed,
            totalUsers,
            totalClaims
        );
    }
    
    // ============ INTERNAL FUNCTIONS ============
    
    function _checkJackpot(address user) internal view returns (bool) {
        // Pseudo-random (use Chainlink VRF for production)
        uint256 random = uint256(
            keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                user,
                totalDistributed,
                block.number
            ))
        ) % 100;
        
        return random < JACKPOT_CHANCE;
    }
    
    function _resetDailyTasksIfNeeded(address user) internal {
        uint256 currentDay = block.timestamp / 1 days;
        DailyTasks storage tasks = dailyTasks[user];
        
        if (tasks.resetDay != currentDay) {
            tasks.shareCast = false;
            tasks.createPrediction = false;
            tasks.tradingVolume = false;
            tasks.resetDay = currentDay;
        }
    }
    
    function _checkStreakAchievements(address userAddr) internal {
        UserData storage user = users[userAddr];
        
        // 7-day streak achievement
        if (user.currentStreak >= 7 && !user.hasStreak7Achievement) {
            user.hasStreak7Achievement = true;
            
            if (swipeToken.balanceOf(address(this)) >= STREAK_7_REWARD) {
                user.totalClaimed += STREAK_7_REWARD;
                totalDistributed += STREAK_7_REWARD;
                swipeToken.transfer(userAddr, STREAK_7_REWARD);
                emit AchievementUnlocked(userAddr, "7_DAY_STREAK", STREAK_7_REWARD);
            }
        }
        
        // 30-day streak achievement
        if (user.currentStreak >= 30 && !user.hasStreak30Achievement) {
            user.hasStreak30Achievement = true;
            
            if (swipeToken.balanceOf(address(this)) >= STREAK_30_REWARD) {
                user.totalClaimed += STREAK_30_REWARD;
                totalDistributed += STREAK_30_REWARD;
                swipeToken.transfer(userAddr, STREAK_30_REWARD);
                emit AchievementUnlocked(userAddr, "30_DAY_STREAK", STREAK_30_REWARD);
            }
        }
    }
    
    function _verifyTaskSignature(
        address user,
        string calldata taskType,
        bytes calldata signature
    ) internal view returns (bool) {
        // Create message hash (includes day to prevent replay within same day)
        bytes32 messageHash = keccak256(
            abi.encodePacked(user, taskType, block.timestamp / 1 days)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        
        address signer = _recoverSigner(ethSignedHash, signature);
        return signer == taskVerifier;
    }
    
    function _recoverSigner(
        bytes32 ethSignedHash,
        bytes calldata signature
    ) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        
        if (v < 27) {
            v += 27;
        }
        
        return ecrecover(ethSignedHash, v, r, s);
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    function setTaskVerifier(address newVerifier) external onlyOwner {
        require(newVerifier != address(0), "Invalid verifier");
        taskVerifier = newVerifier;
        emit TaskVerifierUpdated(newVerifier);
    }
    
    function setClaimingEnabled(bool enabled) external onlyOwner {
        claimingEnabled = enabled;
        emit ClaimingToggled(enabled);
    }
    
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }
    
  function depositSwipe(uint256 amount) external {
    require(amount > 0, "Amount must be greater than 0");
    require(amount <= MAX_DEPOSIT_PER_TX, "Exceeds maximum deposit per transaction");
    
    // Check deposit won't exceed total cap
    uint256 newTotalDeposited = totalDeposited + amount;
    require(newTotalDeposited <= MAX_TOTAL_DEPOSITS, "Exceeds maximum total deposits");
    
    // Check sender has sufficient balance
    require(
        swipeToken.balanceOf(msg.sender) >= amount,
        "Insufficient token balance"
    );
    
    // Check allowance
    require(
        swipeToken.allowance(msg.sender, address(this)) >= amount,
        "Insufficient allowance"
    );
    
    // Update state before external call (Checks-Effects-Interactions pattern)
    totalDeposited = newTotalDeposited;
    
    // Transfer tokens
    require(
        swipeToken.transferFrom(msg.sender, address(this), amount),
        "Token transfer failed"
    );
    
    // Emit deposit event
    emit SwipeDeposited(msg.sender, amount);
    
    // Emit capacity warning if approaching cap (90% full or more)
    if (newTotalDeposited >= MAX_TOTAL_DEPOSITS * 9 / 10) {
        emit DepositCapReached(newTotalDeposited);
    }
}
    
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = swipeToken.balanceOf(address(this));
        require(balance > 0, "No balance");
        require(swipeToken.transfer(owner, balance), "Transfer failed");
        emit EmergencyWithdraw(owner, balance);
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }
}

