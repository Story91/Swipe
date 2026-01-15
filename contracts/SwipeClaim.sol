// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// ERC20 Interface
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// V2 Contract Interface (simplified)
interface IV2Contract {
    // ETH stakes
    function userStakes(uint256 predictionId, address user) external view returns (
        uint256 yesAmount,
        uint256 noAmount,
        bool claimed
    );
    // SWIPE stakes
    function userSwipeStakes(uint256 predictionId, address user) external view returns (
        uint256 yesAmount,
        uint256 noAmount,
        bool claimed
    );
    function nextPredictionId() external view returns (uint256);
}

/**
 * @title SwipeClaim - Claim SWIPE tokens based on V2 contract bets
 * @dev Allows users who have bets in the V2 PredictionMarket contract to claim SWIPE rewards
 * Counts both ETH stakes (placeStake) and SWIPE token stakes (placeStakeWithToken)
 */
contract SwipeClaim {
    address public owner;
    address public immutable v2Contract; // V2 PredictionMarket contract address (0x2bA339Df34B98099a9047d9442075F7B3a792f74)
    address public immutable swipeToken; // SWIPE token address
    
    // Tier rewards: bet count => SWIPE amount (in wei)
    uint256 public constant TIER_10_BETS = 10;   // 10 bets
    uint256 public constant TIER_25_BETS = 25;   // 25 bets
    uint256 public constant TIER_50_BETS = 50;   // 50 bets
    uint256 public constant TIER_100_BETS = 100; // 100 bets
    
    uint256 public constant REWARD_10_BETS = 1_000_000 * 10**18;     // 1M SWIPE
    uint256 public constant REWARD_25_BETS = 10_000_000 * 10**18;    // 10M SWIPE
    uint256 public constant REWARD_50_BETS = 15_000_000 * 10**18;    // 15M SWIPE
    uint256 public constant REWARD_100_BETS = 25_000_000 * 10**18;   // 25M SWIPE (max)
    
    // Track if user has claimed
    mapping(address => bool) public hasClaimed;
    
    // Admin can manually set bet counts (optional, for efficiency)
    mapping(address => uint256) public userBetCounts;
    mapping(address => bool) public betCountSet; // Whether bet count was manually set by admin
    
    // Maximum prediction ID to check (set by admin)
    uint256 public maxPredictionId = 1000;
    
    bool public claimingEnabled = true;
    
    // Events
    event SwipeClaimed(address indexed user, uint256 betCount, uint256 swipeAmount);
    event BetCountSet(address indexed user, uint256 betCount);
    event MaxPredictionIdUpdated(uint256 newMax);
    event ClaimingToggled(bool enabled);
    event SwipeDeposited(uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(address _v2Contract, address _swipeToken) {
        owner = msg.sender;
        v2Contract = _v2Contract;
        swipeToken = _swipeToken;
    }
    
    /**
     * @dev Count user's bets from V2 contract by checking all prediction IDs
     * Counts both ETH stakes (placeStake) and SWIPE stakes (placeStakeWithToken)
     * @param _user User address to count bets for
     * @return betCount Number of unique predictions user has stakes in (ETH or SWIPE)
     */
    function countUserBets(address _user) public view returns (uint256 betCount) {
        IV2Contract v2 = IV2Contract(v2Contract);
        uint256 totalPredictions = v2.nextPredictionId();
        // nextPredictionId() returns the NEXT ID, so actual predictions are 1 to (totalPredictions - 1)
        // But we want to check up to maxPredictionId, so we use the minimum
        uint256 actualMaxPrediction = totalPredictions > 0 ? totalPredictions - 1 : 0;
        uint256 maxToCheck = actualMaxPrediction < maxPredictionId ? actualMaxPrediction : maxPredictionId;
        
        betCount = 0;
        // Fix: should be <= maxToCheck to include the last prediction
        for (uint256 i = 1; i <= maxToCheck; i++) {
            // Check ETH stakes (placeStake)
            (uint256 ethYesAmount, uint256 ethNoAmount, ) = v2.userStakes(i, _user);
            bool hasEthStake = ethYesAmount > 0 || ethNoAmount > 0;
            
            // Check SWIPE stakes (placeStakeWithToken)
            (uint256 swipeYesAmount, uint256 swipeNoAmount, ) = v2.userSwipeStakes(i, _user);
            bool hasSwipeStake = swipeYesAmount > 0 || swipeNoAmount > 0;
            
            // Count if user has any stake (ETH or SWIPE) in this prediction
            if (hasEthStake || hasSwipeStake) {
                betCount++;
            }
        }
        return betCount;
    }
    
    /**
     * @dev Get user's eligible reward amount based on bet count
     * @param betCount Number of bets user has
     * @return rewardAmount SWIPE amount user can claim (0 if not eligible)
     */
    function getRewardForBetCount(uint256 betCount) public pure returns (uint256 rewardAmount) {

        if (betCount >= TIER_100_BETS) {
            return REWARD_100_BETS; // 25M SWIPE - max tier
        } else if (betCount >= TIER_50_BETS) {
            return REWARD_50_BETS;  // 15M SWIPE
        } else if (betCount >= TIER_25_BETS) {
            return REWARD_25_BETS;  // 10M SWIPE
        } else if (betCount >= TIER_10_BETS) {
            return REWARD_10_BETS;  // 1M SWIPE
        }
        return 0; // Not eligible - need at least 10 bets
    }
    
    /**
     * @dev Get tier info for a bet count
     * @param betCount Number of bets
     * @return tierName Name of the tier (e.g., "10+", "25+", "50+", "100+")
     * @return rewardAmount SWIPE reward for this tier
     * @return nextTierBetCount Bet count needed for next tier (0 if max tier)
     */
    function getTierInfo(uint256 betCount) public pure returns (
        string memory tierName,
        uint256 rewardAmount,
        uint256 nextTierBetCount
    ) {
        if (betCount >= TIER_100_BETS) {
            return ("100+", REWARD_100_BETS, 0); // Max tier
        } else if (betCount >= TIER_50_BETS) {
            return ("50+", REWARD_50_BETS, TIER_100_BETS);
        } else if (betCount >= TIER_25_BETS) {
            return ("25+", REWARD_25_BETS, TIER_50_BETS);
        } else if (betCount >= TIER_10_BETS) {
            return ("10+", REWARD_10_BETS, TIER_25_BETS);
        }
        return ("Not Eligible", 0, TIER_10_BETS);
    }
    
    /**
     * @dev Get user's claimable amount
     * @param _user User address
     * @return eligible Whether user is eligible
     * @return betCount Number of bets
     * @return rewardAmount SWIPE amount they can claim
     */
    function getUserClaimInfo(address _user) external view returns (
        bool eligible,
        uint256 betCount,
        uint256 rewardAmount
    ) {
        if (hasClaimed[_user]) {
            return (false, 0, 0);
        }
        
        // Use manually set count if available, otherwise count from contract
        if (betCountSet[_user]) {
            betCount = userBetCounts[_user];
        } else {
            betCount = countUserBets(_user);
        }
        
        rewardAmount = getRewardForBetCount(betCount);
        eligible = (rewardAmount > 0);
        
        return (eligible, betCount, rewardAmount);
    }
    
    /**
     * @dev Claim SWIPE tokens based on bet count
     */
    function claimSwipe() external {
        require(claimingEnabled, "Claiming disabled");
        require(!hasClaimed[msg.sender], "Already claimed");
        
        // Get bet count (use manually set if available, otherwise count from contract)
        uint256 betCount;
        if (betCountSet[msg.sender]) {
            betCount = userBetCounts[msg.sender];
        } else {
            betCount = countUserBets(msg.sender);
        }
        
        // Calculate reward
        uint256 rewardAmount = getRewardForBetCount(betCount);
        require(rewardAmount > 0, "Not eligible for rewards");
        require(
            IERC20(swipeToken).balanceOf(address(this)) >= rewardAmount,
            "Insufficient SWIPE balance"
        );
        
        // Mark as claimed BEFORE transfer (reentrancy guard)
        hasClaimed[msg.sender] = true;
        
        // Transfer SWIPE tokens
        require(
            IERC20(swipeToken).transfer(msg.sender, rewardAmount),
            "SWIPE transfer failed"
        );
        
        emit SwipeClaimed(msg.sender, betCount, rewardAmount);
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @dev Manually set user's bet count (for efficiency, optional)
     * @param _user User address
     * @param _betCount Number of bets user has made
     */
    function setUserBetCount(address _user, uint256 _betCount) external onlyOwner {
        require(_user != address(0), "Invalid user address");
        require(_betCount > 0, "Bet count must be > 0");
        require(_betCount <= maxPredictionId, "Bet count cannot exceed total number of predictions");
        userBetCounts[_user] = _betCount;
        betCountSet[_user] = true;
        emit BetCountSet(_user, _betCount);
    }
    
    /**
     * @dev Batch set multiple users' bet counts
     */
    function batchSetBetCounts(address[] calldata _users, uint256[] calldata _betCounts) external onlyOwner {
        require(_users.length == _betCounts.length, "Array length mismatch");
        for (uint256 i = 0; i < _users.length; i++) {
            userBetCounts[_users[i]] = _betCounts[i];
            betCountSet[_users[i]] = true;
            emit BetCountSet(_users[i], _betCounts[i]);
        }
    }
    
    /**
     * @dev Set maximum prediction ID to check (for gas optimization)
     */
    function setMaxPredictionId(uint256 _maxId) external onlyOwner {
        
        require(_maxId > 0, "Invalid max ID");
        maxPredictionId = _maxId;
       
        emit MaxPredictionIdUpdated(_maxId);
    }
    
    /**
     * @dev Enable/disable claiming
     */
    function setClaimingEnabled(bool _enabled) external onlyOwner {
        claimingEnabled = _enabled;
        emit ClaimingToggled(_enabled);
    }
    
    /**
     * @dev Deposit SWIPE tokens to contract
     */
    function depositSwipe(uint256 _amount) external {
        require(
            IERC20(swipeToken).transferFrom(msg.sender, address(this), _amount),
            "SWIPE transfer failed"
        );
        emit SwipeDeposited(_amount);
    }
    
    /**
     * @dev Emergency withdraw SWIPE tokens (only owner)
     */
    function emergencyWithdrawSwipe() external onlyOwner {
        uint256 balance = IERC20(swipeToken).balanceOf(address(this));
        require(balance > 0, "No SWIPE to withdraw");
        require(
            IERC20(swipeToken).transfer(owner, balance),
            "SWIPE transfer failed"
        );
    }
    
    /**
     * @dev Get contract SWIPE balance
     */
    function getSwipeBalance() external view returns (uint256) {
        return IERC20(swipeToken).balanceOf(address(this));
    }
    
    /**
     * @dev Transfer ownership
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid new owner");
        owner = _newOwner;
    }
}

