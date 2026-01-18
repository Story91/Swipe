// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SwipeDailyRewards V3 - Fully secured daily task rewards system
 * @dev V3 improvements over V2:
 * - Signature verification for daily claims (prevents direct contract farming)
 * - All functions now require backend signature verification
 * - Full migration support from both V1 and V2
 *
 * Security: All reward claims (daily, tasks, achievements, referrals) now require
 * backend signature verification, making it impossible to farm directly from contract.
 *
 * Pool: 250M SWIPE
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ISwipeDailyRewardsV1 {
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

    function users(address) external view returns (
        uint256 lastClaimTimestamp,
        uint256 currentStreak,
        uint256 longestStreak,
        uint256 totalClaimed,
        uint256 lastTaskResetDay,
        uint256 jackpotsWon,
        bool isBetaTester,
        bool hasFollowedSocials,
        bool hasStreak7Achievement,
        bool hasStreak30Achievement
    );

    function referredBy(address) external view returns (address);
    function referralCount(address) external view returns (uint256);
    function hasUsedReferral(address) external view returns (bool);
}

interface ISwipeDailyRewardsV2 {
    function users(address) external view returns (
        uint256 lastClaimTimestamp,
        uint256 currentStreak,
        uint256 longestStreak,
        uint256 totalClaimed,
        uint256 lastTaskResetDay,
        uint256 jackpotsWon,
        bool isBetaTester,
        bool hasFollowedSocials,
        bool hasStreak7Achievement,
        bool hasStreak30Achievement,
        bool migrated
    );

    function referredBy(address) external view returns (address);
    function referralCount(address) external view returns (uint256);
    function hasUsedReferral(address) external view returns (bool);
}

contract SwipeDailyRewards_V3 {
    // Immutable state
    address public owner;
    IERC20 public immutable swipeToken;
    ISwipeDailyRewardsV1 public immutable v1Contract; // V1 contract for migration
    ISwipeDailyRewardsV2 public immutable v2Contract; // V2 contract for migration

    // Reward variables (editable by owner)
    uint256 public baseDailyReward = 50_000 * 10**18;              // 50,000 SWIPE
    uint256 public streakBonusPerDay = 10_000 * 10**18;            // +10,000 SWIPE per streak day
    uint256 public maxStreakBonusDays = 10;                         // Max 10 days for streak bonus
    uint256 public jackpotAmount = 250_000 * 10**18;                // 250,000 SWIPE jackpot
    uint256 public jackpotChance = 5;                               // 5% chance

    // Task reward variables (editable)
    uint256 public shareCastReward = 50_000 * 10**18;               // Share on Farcaster
    uint256 public createPredictionReward = 75_000 * 10**18;       // Create prediction
    uint256 public tradingVolumeReward = 100_000 * 10**18;         // Volume >500 SWIPE
    uint256 public referralReward = 50_000 * 10**18;               // Invite friend

    // Achievement reward variables (editable)
    uint256 public betaTesterReward = 500_000 * 10**18;            // 500k SWIPE
    uint256 public followSocialsReward = 100_000 * 10**18;         // 100k SWIPE
    uint256 public streak7Reward = 250_000 * 10**18;               // 250k SWIPE
    uint256 public streak30Reward = 1_000_000 * 10**18;            // 1M SWIPE

    // State variables
    uint256 public totalDistributed;
    uint256 public totalUsers;
    uint256 public totalClaims;
    address public taskVerifier; // Backend wallet for signature verification
    bool public claimingEnabled = true;
    bool public paused = false;
    bool public migrationEnabled = true; // Allow migration from V1/V2

    // Blacklist
    mapping(address => bool) public blacklist;

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
        bool migrated; // Track if user data was migrated
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
    mapping(address => bool) public hasUsedReferral;

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
    event UserMigrated(address indexed user, uint256 streak, bool achievements);
    event BlacklistUpdated(address indexed user, bool blacklisted);
    event RewardUpdated(string rewardType, uint256 oldValue, uint256 newValue);

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

    modifier notBlacklisted(address user) {
        require(!blacklist[user], "Address is blacklisted");
        _;
    }

    /**
     * @dev Constructor
     * @param _swipeToken Address of SWIPE token contract
     * @param _taskVerifier Address of backend wallet for signature verification
     * @param _v1Contract Address of V1 contract for migration (can be address(0) if not needed)
     * @param _v2Contract Address of V2 contract for migration (can be address(0) if not needed)
     */
    constructor(
        address _swipeToken,
        address _taskVerifier,
        address _v1Contract,
        address _v2Contract
    ) {
        require(_swipeToken != address(0), "Invalid token address");
        require(_taskVerifier != address(0), "Invalid verifier address");
        // v1Contract and v2Contract can be address(0) if not needed

        owner = msg.sender;
        swipeToken = IERC20(_swipeToken);
        taskVerifier = _taskVerifier;
        v1Contract = ISwipeDailyRewardsV1(_v1Contract);
        v2Contract = ISwipeDailyRewardsV2(_v2Contract);
    }

    // ============ MIGRATION FROM V1/V2 ============

    /**
     * @dev Migrate user data from V1 or V2 contract
     * Preserves streaks, achievements, and referral data
     */
    function migrateFromV2() external {
        require(migrationEnabled, "Migration disabled");
        require(!users[msg.sender].migrated, "Already migrated");
        require(!blacklist[msg.sender], "Cannot migrate blacklisted address");
        require(address(v2Contract) != address(0), "V2 contract not set");

        // Read data from V2 contract
        (
            uint256 lastClaimTimestamp,
            uint256 currentStreak,
            uint256 longestStreak,
            uint256 totalClaimed,
            uint256 lastTaskResetDay,
            uint256 jackpotsWon,
            bool isBetaTester,
            bool hasFollowedSocials,
            bool hasStreak7Achievement,
            bool hasStreak30Achievement,
            bool v2Migrated
        ) = v2Contract.users(msg.sender);

        // Only migrate if user exists in V2
        require(lastClaimTimestamp > 0 || v2Migrated, "User not found in V2");

        // Migrate user data
        UserData storage user = users[msg.sender];
        user.lastClaimTimestamp = lastClaimTimestamp;
        user.currentStreak = currentStreak;
        user.longestStreak = longestStreak;
        user.totalClaimed = totalClaimed;
        user.lastTaskResetDay = lastTaskResetDay;
        user.jackpotsWon = jackpotsWon;
        user.isBetaTester = isBetaTester;
        user.hasFollowedSocials = hasFollowedSocials;
        user.hasStreak7Achievement = hasStreak7Achievement;
        user.hasStreak30Achievement = hasStreak30Achievement;
        user.migrated = true;

        // Migrate referral data from V2
        address v2Referrer = v2Contract.referredBy(msg.sender);
        if (v2Referrer != address(0)) {
            referredBy[msg.sender] = v2Referrer;
            hasUsedReferral[msg.sender] = v2Contract.hasUsedReferral(msg.sender);
        }

        // Update counters if first time in V3
        if (lastClaimTimestamp > 0) {
            totalUsers++;
        }

        emit UserMigrated(msg.sender, currentStreak, isBetaTester || hasFollowedSocials || hasStreak7Achievement || hasStreak30Achievement);
    }

    /**
     * @dev Migrate user data from V1 contract (if V2 not available)
     */
    function migrateFromV1() external {
        require(migrationEnabled, "Migration disabled");
        require(!users[msg.sender].migrated, "Already migrated");
        require(!blacklist[msg.sender], "Cannot migrate blacklisted address");
        require(address(v1Contract) != address(0), "V1 contract not set");

        // Read data from V1 contract
        (
            uint256 lastClaimTimestamp,
            uint256 currentStreak,
            uint256 longestStreak,
            uint256 totalClaimed,
            uint256 lastTaskResetDay,
            uint256 jackpotsWon,
            bool isBetaTester,
            bool hasFollowedSocials,
            bool hasStreak7Achievement,
            bool hasStreak30Achievement
        ) = v1Contract.users(msg.sender);

        require(lastClaimTimestamp > 0, "User not found in V1");

        // Migrate user data
        UserData storage user = users[msg.sender];
        user.lastClaimTimestamp = lastClaimTimestamp;
        user.currentStreak = currentStreak;
        user.longestStreak = longestStreak;
        user.totalClaimed = totalClaimed;
        user.lastTaskResetDay = lastTaskResetDay;
        user.jackpotsWon = jackpotsWon;
        user.isBetaTester = isBetaTester;
        user.hasFollowedSocials = hasFollowedSocials;
        user.hasStreak7Achievement = hasStreak7Achievement;
        user.hasStreak30Achievement = hasStreak30Achievement;
        user.migrated = true;

        // Migrate referral data from V1
        address v1Referrer = v1Contract.referredBy(msg.sender);
        if (v1Referrer != address(0)) {
            referredBy[msg.sender] = v1Referrer;
            hasUsedReferral[msg.sender] = v1Contract.hasUsedReferral(msg.sender);
        }

        if (lastClaimTimestamp > 0) {
            totalUsers++;
        }

        emit UserMigrated(msg.sender, currentStreak, isBetaTester || hasFollowedSocials || hasStreak7Achievement || hasStreak30Achievement);
    }

    /**
     * @dev Batch migrate multiple users from V2 (admin only)
     */
    function batchMigrateFromV2(address[] calldata usersToMigrate) external onlyOwner {
        require(migrationEnabled, "Migration disabled");
        require(address(v2Contract) != address(0), "V2 contract not set");

        for (uint256 i = 0; i < usersToMigrate.length; i++) {
            address userAddr = usersToMigrate[i];

            if (users[userAddr].migrated || blacklist[userAddr]) {
                continue;
            }

            (
                uint256 lastClaimTimestamp,
                uint256 currentStreak,
                uint256 longestStreak,
                uint256 totalClaimed,
                uint256 lastTaskResetDay,
                uint256 jackpotsWon,
                bool isBetaTester,
                bool hasFollowedSocials,
                bool hasStreak7Achievement,
                bool hasStreak30Achievement,
                bool v2Migrated
            ) = v2Contract.users(userAddr);

            if (lastClaimTimestamp == 0 && !v2Migrated) {
                continue;
            }

            UserData storage user = users[userAddr];
            user.lastClaimTimestamp = lastClaimTimestamp;
            user.currentStreak = currentStreak;
            user.longestStreak = longestStreak;
            user.totalClaimed = totalClaimed;
            user.lastTaskResetDay = lastTaskResetDay;
            user.jackpotsWon = jackpotsWon;
            user.isBetaTester = isBetaTester;
            user.hasFollowedSocials = hasFollowedSocials;
            user.hasStreak7Achievement = hasStreak7Achievement;
            user.hasStreak30Achievement = hasStreak30Achievement;
            user.migrated = true;

            address v2Referrer = v2Contract.referredBy(userAddr);
            if (v2Referrer != address(0)) {
                referredBy[userAddr] = v2Referrer;
                hasUsedReferral[userAddr] = v2Contract.hasUsedReferral(userAddr);
            }

            if (lastClaimTimestamp > 0) {
                totalUsers++;
            }

            emit UserMigrated(userAddr, currentStreak, isBetaTester || hasFollowedSocials || hasStreak7Achievement || hasStreak30Achievement);
        }
    }

    // ============ MAIN CLAIM FUNCTION (WITH SIGNATURE) ============

    /**
     * @dev Claim daily SWIPE rewards (REQUIRES BACKEND SIGNATURE)
     * @param signature Backend signature verifying claim eligibility
     */
    function claimDaily(bytes calldata signature) external whenNotPaused whenClaimingEnabled notBlacklisted(msg.sender) {
        // Verify signature from backend
        require(
            _verifyDailyClaimSignature(msg.sender, signature),
            "Invalid signature"
        );

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
        uint256 baseReward = baseDailyReward;

        // Calculate streak bonus (capped at maxStreakBonusDays)
        uint256 streakDays = user.currentStreak > maxStreakBonusDays
            ? maxStreakBonusDays
            : user.currentStreak;
        uint256 streakBonus = streakDays * streakBonusPerDay;

        uint256 totalReward = baseReward + streakBonus;

        // Jackpot check (pseudo-random)
        bool wonJackpot = _checkJackpot(msg.sender);
        if (wonJackpot) {
            totalReward += jackpotAmount;
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
    ) external whenNotPaused notBlacklisted(msg.sender) {
        require(
            _verifyTaskSignature(msg.sender, taskType, signature),
            "Invalid signature"
        );

        _resetDailyTasksIfNeeded(msg.sender);

        DailyTasks storage tasks = dailyTasks[msg.sender];
        uint256 reward = 0;

        bytes32 taskHash = keccak256(bytes(taskType));

        if (taskHash == keccak256("SHARE_CAST")) {
            require(!tasks.shareCast, "Task already completed today");
            tasks.shareCast = true;
            reward = shareCastReward;
        } else if (taskHash == keccak256("CREATE_PREDICTION")) {
            require(!tasks.createPrediction, "Task already completed today");
            tasks.createPrediction = true;
            reward = createPredictionReward;
        } else if (taskHash == keccak256("TRADING_VOLUME")) {
            require(!tasks.tradingVolume, "Task already completed today");
            tasks.tradingVolume = true;
            reward = tradingVolumeReward;
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
    ) external whenNotPaused notBlacklisted(msg.sender) {
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
            reward = betaTesterReward;
        } else if (achievementHash == keccak256("FOLLOW_SOCIALS")) {
            require(!user.hasFollowedSocials, "Already claimed");
            user.hasFollowedSocials = true;
            reward = followSocialsReward;
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

    // ============ REFERRAL SYSTEM (WITH SIGNATURE) ============

    /**
     * @dev Register a referral (both parties get rewards, requires signature)
     * @param referrer Address of the referrer
     * @param signature Backend signature proving valid referral
     */
    function registerReferral(
        address referrer,
        bytes calldata signature
    ) external whenNotPaused notBlacklisted(msg.sender) notBlacklisted(referrer) {
        require(!hasUsedReferral[msg.sender], "Already used referral");
        require(referrer != msg.sender, "Cannot refer yourself");
        require(referrer != address(0), "Invalid referrer");
        require(users[referrer].lastClaimTimestamp > 0, "Referrer must be active user");

        require(
            _verifyReferralSignature(msg.sender, referrer, signature),
            "Invalid referral signature"
        );

        hasUsedReferral[msg.sender] = true;
        referredBy[msg.sender] = referrer;
        referralCount[referrer]++;

        uint256 totalReward = referralReward * 2;
        require(
            swipeToken.balanceOf(address(this)) >= totalReward,
            "Insufficient pool balance"
        );

        users[referrer].totalClaimed += referralReward;
        totalDistributed += referralReward;
        require(swipeToken.transfer(referrer, referralReward), "Transfer to referrer failed");

        users[msg.sender].totalClaimed += referralReward;
        totalDistributed += referralReward;
        require(swipeToken.transfer(msg.sender, referralReward), "Transfer to referred failed");

        emit ReferralRegistered(referrer, msg.sender, referralReward);
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
        uint256 potentialReward,
        bool isMigrated
    ) {
        UserData storage userData = users[user];

        lastClaimTimestamp = userData.lastClaimTimestamp;
        currentStreak = userData.currentStreak;
        longestStreak = userData.longestStreak;
        totalClaimed = userData.totalClaimed;
        jackpotsWon = userData.jackpotsWon;
        isMigrated = userData.migrated;

        canClaimToday = userData.lastClaimTimestamp == 0 ||
                        block.timestamp >= userData.lastClaimTimestamp + 1 days;

        if (canClaimToday) {
            nextClaimTime = 0;
        } else {
            nextClaimTime = userData.lastClaimTimestamp + 1 days;
        }

        uint256 nextStreak = canClaimToday ?
            (userData.lastClaimTimestamp > 0 && block.timestamp <= userData.lastClaimTimestamp + 2 days ?
                userData.currentStreak + 1 : 1) :
            userData.currentStreak;
        uint256 streakDays = nextStreak > maxStreakBonusDays ? maxStreakBonusDays : nextStreak;
        potentialReward = baseDailyReward + (streakDays * streakBonusPerDay);
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

        needsReset = tasks.resetDay != currentDay;

        if (needsReset) {
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
        uint256 random = uint256(
            keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                user,
                totalDistributed,
                block.number
            ))
        ) % 100;

        return random < jackpotChance;
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

        if (user.currentStreak >= 7 && !user.hasStreak7Achievement) {
            user.hasStreak7Achievement = true;

            if (swipeToken.balanceOf(address(this)) >= streak7Reward) {
                user.totalClaimed += streak7Reward;
                totalDistributed += streak7Reward;
                swipeToken.transfer(userAddr, streak7Reward);
                emit AchievementUnlocked(userAddr, "7_DAY_STREAK", streak7Reward);
            }
        }

        if (user.currentStreak >= 30 && !user.hasStreak30Achievement) {
            user.hasStreak30Achievement = true;

            if (swipeToken.balanceOf(address(this)) >= streak30Reward) {
                user.totalClaimed += streak30Reward;
                totalDistributed += streak30Reward;
                swipeToken.transfer(userAddr, streak30Reward);
                emit AchievementUnlocked(userAddr, "30_DAY_STREAK", streak30Reward);
            }
        }
    }

    /**
     * @dev Verify signature for daily claim
     * Signature format: signed(user, "DAILY_CLAIM", currentDay)
     */
    function _verifyDailyClaimSignature(
        address user,
        bytes calldata signature
    ) internal view returns (bool) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(user, "DAILY_CLAIM", block.timestamp / 1 days)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address signer = _recoverSigner(ethSignedHash, signature);
        return signer == taskVerifier;
    }

    function _verifyTaskSignature(
        address user,
        string calldata taskType,
        bytes calldata signature
    ) internal view returns (bool) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(user, taskType, block.timestamp / 1 days)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address signer = _recoverSigner(ethSignedHash, signature);
        return signer == taskVerifier;
    }

    function _verifyReferralSignature(
        address referred,
        address referrer,
        bytes calldata signature
    ) internal view returns (bool) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(referred, referrer, "REFERRAL", block.timestamp / 1 days)
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

    function setMigrationEnabled(bool enabled) external onlyOwner {
        migrationEnabled = enabled;
    }

    function setBlacklist(address user, bool _blacklisted) external onlyOwner {
        blacklist[user] = _blacklisted;
        emit BlacklistUpdated(user, _blacklisted);
    }

    function batchSetBlacklist(address[] calldata userAddresses, bool[] calldata blacklisted) external onlyOwner {
        require(userAddresses.length == blacklisted.length, "Array length mismatch");
        for (uint256 i = 0; i < userAddresses.length; i++) {
            blacklist[userAddresses[i]] = blacklisted[i];
            emit BlacklistUpdated(userAddresses[i], blacklisted[i]);
        }
    }

    // Reward configuration (same limits as V2)
    function setBaseDailyReward(uint256 amount) external onlyOwner {
        require(amount >= 10_000 * 10**18 && amount <= 200_000 * 10**18, "Invalid amount");
        uint256 oldValue = baseDailyReward;
        baseDailyReward = amount;
        emit RewardUpdated("BASE_DAILY_REWARD", oldValue, amount);
    }

    function setStreakBonusPerDay(uint256 amount) external onlyOwner {
        require(amount >= 1_000 * 10**18 && amount <= 50_000 * 10**18, "Invalid amount");
        uint256 oldValue = streakBonusPerDay;
        streakBonusPerDay = amount;
        emit RewardUpdated("STREAK_BONUS_PER_DAY", oldValue, amount);
    }

    function setMaxStreakBonusDays(uint256 days_) external onlyOwner {
        require(days_ >= 5 && days_ <= 30, "Invalid days");
        uint256 oldValue = maxStreakBonusDays;
        maxStreakBonusDays = days_;
        emit RewardUpdated("MAX_STREAK_BONUS_DAYS", oldValue, days_);
    }

    function setJackpotAmount(uint256 amount) external onlyOwner {
        require(amount >= 50_000 * 10**18 && amount <= 1_000_000 * 10**18, "Invalid amount");
        uint256 oldValue = jackpotAmount;
        jackpotAmount = amount;
        emit RewardUpdated("JACKPOT_AMOUNT", oldValue, amount);
    }

    function setJackpotChance(uint256 chance) external onlyOwner {
        require(chance >= 1 && chance <= 20, "Invalid chance (1-20%)");
        uint256 oldValue = jackpotChance;
        jackpotChance = chance;
        emit RewardUpdated("JACKPOT_CHANCE", oldValue, chance);
    }

    function setShareCastReward(uint256 amount) external onlyOwner {
        require(amount >= 10_000 * 10**18 && amount <= 200_000 * 10**18, "Invalid amount");
        uint256 oldValue = shareCastReward;
        shareCastReward = amount;
        emit RewardUpdated("SHARE_CAST_REWARD", oldValue, amount);
    }

    function setCreatePredictionReward(uint256 amount) external onlyOwner {
        require(amount >= 10_000 * 10**18 && amount <= 200_000 * 10**18, "Invalid amount");
        uint256 oldValue = createPredictionReward;
        createPredictionReward = amount;
        emit RewardUpdated("CREATE_PREDICTION_REWARD", oldValue, amount);
    }

    function setTradingVolumeReward(uint256 amount) external onlyOwner {
        require(amount >= 10_000 * 10**18 && amount <= 200_000 * 10**18, "Invalid amount");
        uint256 oldValue = tradingVolumeReward;
        tradingVolumeReward = amount;
        emit RewardUpdated("TRADING_VOLUME_REWARD", oldValue, amount);
    }

    function setReferralReward(uint256 amount) external onlyOwner {
        require(amount >= 10_000 * 10**18 && amount <= 100_000 * 10**18, "Invalid amount");
        uint256 oldValue = referralReward;
        referralReward = amount;
        emit RewardUpdated("REFERRAL_REWARD", oldValue, amount);
    }

    function setBetaTesterReward(uint256 amount) external onlyOwner {
        require(amount >= 100_000 * 10**18 && amount <= 2_000_000 * 10**18, "Invalid amount");
        uint256 oldValue = betaTesterReward;
        betaTesterReward = amount;
        emit RewardUpdated("BETA_TESTER_REWARD", oldValue, amount);
    }

    function setFollowSocialsReward(uint256 amount) external onlyOwner {
        require(amount >= 10_000 * 10**18 && amount <= 500_000 * 10**18, "Invalid amount");
        uint256 oldValue = followSocialsReward;
        followSocialsReward = amount;
        emit RewardUpdated("FOLLOW_SOCIALS_REWARD", oldValue, amount);
    }

    function setStreak7Reward(uint256 amount) external onlyOwner {
        require(amount >= 50_000 * 10**18 && amount <= 1_000_000 * 10**18, "Invalid amount");
        uint256 oldValue = streak7Reward;
        streak7Reward = amount;
        emit RewardUpdated("STREAK_7_REWARD", oldValue, amount);
    }

    function setStreak30Reward(uint256 amount) external onlyOwner {
        require(amount >= 100_000 * 10**18 && amount <= 5_000_000 * 10**18, "Invalid amount");
        uint256 oldValue = streak30Reward;
        streak30Reward = amount;
        emit RewardUpdated("STREAK_30_REWARD", oldValue, amount);
    }

    function depositSwipe(uint256 amount) external {
        require(
            swipeToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        emit SwipeDeposited(msg.sender, amount);
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
