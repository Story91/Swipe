// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PredictionMarket - Optimized for Remix (Stack-safe version)
 * @dev Tinder-style prediction market with optimized return values
 * This version prevents "Stack too deep" errors by using structs and fewer return values
 */
contract PredictionMarket {
    address public owner;

    struct Prediction {
        string question;
        string description;
        string category;
        string imageUrl;
        uint256 yesTotalAmount;
        uint256 noTotalAmount;
        uint256 deadline;
        uint256 resolutionDeadline;
        bool resolved;
        bool outcome;
        bool cancelled;
        uint256 createdAt;
        address creator;
        bool verified;
        bool approved;
        bool needsApproval;
    }

    // OPTIMIZED: Use struct for return values instead of multiple values
    struct PredictionView {
        string question;
        string description;
        string category;
        uint256 yesTotalAmount;
        uint256 noTotalAmount;
        uint256 deadline;
        bool resolved;
        bool outcome;
        bool approved;
        address creator;
    }

    struct UserStake {
        uint256 yesAmount;
        uint256 noAmount;
        bool claimed;
    }

    struct PayoutInfo {
        uint256 payout;
        uint256 profit;
    }

    struct MarketStats {
        uint256 totalPool;
        uint256 participantsCount;
        uint256 yesPercentage;
        uint256 noPercentage;
        uint256 timeLeft;
    }

    struct ContractStats {
        uint256 totalPredictions;
        uint256 platformFee;
        uint256 collectedFees;
        uint256 minStake;
        uint256 maxStake;
        uint256 contractBalance;
    }

    // ============ STORAGE ============
    mapping(uint256 => Prediction) public predictions;
    mapping(uint256 => mapping(address => UserStake)) public userStakes;
    mapping(uint256 => address[]) public participants;
    mapping(address => bool) public approvedCreators;

    // APPROVAL SYSTEM
    mapping(uint256 => mapping(address => bool)) public predictionApprovals;
    mapping(address => bool) public approvers;
    mapping(uint256 => uint256) public approvalCount;

    uint256 public nextPredictionId = 1;
    uint256 public platformFeePercentage = 100;    // 1% = 100 basis points
    uint256 public minimumStake = 0.001 ether;     // Min bet: 0.001 ETH
    uint256 public maximumStake = 100 ether;       // Max bet: 100 ETH
    uint256 public collectedFees;                  // Platform fees collected
    uint256 public maxResolutionTime = 7 days;     // Max time to resolve after deadline
    uint256 public creationFee = 0.01 ether;       // Fee for non-approved creators
    bool public publicCreationEnabled = false;     // Can anyone create predictions?
    uint256 public requiredApprovals = 1;          // How many approvals needed

    bool private _paused;

    // ============ EVENTS ============
    event PredictionCreated(
        uint256 indexed predictionId,
        string question,
        string category,
        string imageUrl,
        uint256 deadline,
        address indexed creator,
        bool verified,
        bool needsApproval
    );

    event PredictionApproved(
        uint256 indexed predictionId,
        address indexed approver,
        uint256 totalApprovals,
        bool isNowLive
    );

    event PredictionRejected(
        uint256 indexed predictionId,
        address indexed approver,
        string reason
    );

    event PredictionResolved(
        uint256 indexed predictionId,
        bool outcome,
        uint256 winnersPool,
        uint256 losersPool,
        uint256 platformFee
    );

    event RewardClaimed(
        uint256 indexed predictionId,
        address indexed user,
        uint256 payout,
        uint256 originalStake,
        uint256 profit
    );

    event PredictionCancelled(
        uint256 indexed predictionId,
        string reason
    );

    event EmergencyRefund(
        uint256 indexed predictionId,
        address indexed user,
        uint256 amount
    );

    event StakePlaced(
        uint256 indexed predictionId,
        address indexed user,
        bool isYes,
        uint256 amount,
        uint256 newYesTotal,
        uint256 newNoTotal
    );

    // ============ MODIFIERS ============
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!_paused, "Contract paused");
        _;
    }

    modifier validPrediction(uint256 _predictionId) {
        require(_predictionId > 0 && _predictionId < nextPredictionId, "Invalid prediction ID");
        _;
    }

    modifier canCreate() {
        require(
            msg.sender == owner ||
            approvedCreators[msg.sender] ||
            publicCreationEnabled,
            "Not authorized to create"
        );
        _;
    }

    modifier canBet(uint256 _predictionId) {
        Prediction storage p = predictions[_predictionId];
        require(p.approved || !p.needsApproval, "Prediction not approved yet");
        _;
    }

    modifier isApprover() {
        require(approvers[msg.sender] || msg.sender == owner, "Not an approver");
        _;
    }

    modifier beforeDeadline(uint256 _predictionId) {
        require(block.timestamp < predictions[_predictionId].deadline, "Betting closed");
        _;
    }

    modifier afterDeadline(uint256 _predictionId) {
        require(block.timestamp >= predictions[_predictionId].deadline, "Betting still active");
        _;
    }

    modifier notResolved(uint256 _predictionId) {
        require(!predictions[_predictionId].resolved, "Already resolved");
        require(!predictions[_predictionId].cancelled, "Prediction cancelled");
        _;
    }

    modifier canResolve(uint256 _predictionId) {
        require(
            block.timestamp <= predictions[_predictionId].resolutionDeadline,
            "Resolution deadline passed"
        );
        _;
    }

    // ============ CONSTRUCTOR ============
    constructor() {
        owner = msg.sender;
    }

    // ============ CORE FUNCTIONS ============

    /**
     * @dev Create new prediction market
     */
    function createPrediction(
        string memory _question,
        string memory _description,
        string memory _category,
        string memory _imageUrl,
        uint256 _durationInHours
    ) external payable canCreate whenNotPaused returns (uint256) {
        require(bytes(_question).length > 0, "Question required");
        require(bytes(_question).length <= 200, "Question too long");
        require(bytes(_category).length > 0, "Category required");
        require(_durationInHours >= 1 && _durationInHours <= 8760, "Duration: 1h-1year");

        // Collect creation fee if not owner or approved creator
        if (msg.sender != owner && !approvedCreators[msg.sender]) {
            require(msg.value >= creationFee, "Pay creation fee");
            collectedFees += msg.value;
        }

        uint256 predictionId = nextPredictionId++;
        uint256 deadline = block.timestamp + (_durationInHours * 1 hours);
        bool isVerified = (msg.sender == owner || approvedCreators[msg.sender]);
        bool needsApproval = !isVerified && publicCreationEnabled;

        predictions[predictionId] = Prediction({
            question: _question,
            description: _description,
            category: _category,
            imageUrl: _imageUrl,
            yesTotalAmount: 0,
            noTotalAmount: 0,
            deadline: deadline,
            resolutionDeadline: deadline + maxResolutionTime,
            resolved: false,
            outcome: false,
            cancelled: false,
            createdAt: block.timestamp,
            creator: msg.sender,
            verified: isVerified,
            approved: !needsApproval,
            needsApproval: needsApproval
        });

        emit PredictionCreated(
            predictionId,
            _question,
            _category,
            _imageUrl,
            deadline,
            msg.sender,
            isVerified,
            needsApproval
        );
        return predictionId;
    }

    /**
     * @dev Place stake on YES or NO
     */
    function placeStake(uint256 _predictionId, bool _isYes)
        external
        payable
        validPrediction(_predictionId)
        beforeDeadline(_predictionId)
        notResolved(_predictionId)
        canBet(_predictionId)
        whenNotPaused
    {
        require(msg.value >= minimumStake, "Stake too low");
        require(msg.value <= maximumStake, "Stake too high");

        Prediction storage prediction = predictions[_predictionId];
        UserStake storage userStake = userStakes[_predictionId][msg.sender];

        // Add to participants list if first time betting
        if (userStake.yesAmount == 0 && userStake.noAmount == 0) {
            participants[_predictionId].push(msg.sender);
        }

        // Update user stake and total pools
        if (_isYes) {
            userStake.yesAmount += msg.value;
            prediction.yesTotalAmount += msg.value;
        } else {
            userStake.noAmount += msg.value;
            prediction.noTotalAmount += msg.value;
        }

        emit StakePlaced(
            _predictionId,
            msg.sender,
            _isYes,
            msg.value,
            prediction.yesTotalAmount,
            prediction.noTotalAmount
        );
    }

    /**
     * @dev Admin resolves the prediction outcome
     */
    function resolvePrediction(uint256 _predictionId, bool _outcome)
        external
        onlyOwner
        validPrediction(_predictionId)
        afterDeadline(_predictionId)
        notResolved(_predictionId)
        canResolve(_predictionId)
    {
        Prediction storage prediction = predictions[_predictionId];
        prediction.resolved = true;
        prediction.outcome = _outcome;

        uint256 winnersPool = _outcome ? prediction.yesTotalAmount : prediction.noTotalAmount;
        uint256 losersPool = _outcome ? prediction.noTotalAmount : prediction.yesTotalAmount;

        // Calculate platform fee: 1% from losers pool
        uint256 platformFee = 0;
        if (losersPool > 0 && winnersPool > 0) {
            platformFee = (losersPool * platformFeePercentage) / 10000;
            collectedFees += platformFee;
        }

        emit PredictionResolved(_predictionId, _outcome, winnersPool, losersPool, platformFee);
    }

    /**
     * @dev Approve a prediction
     */
    function approvePrediction(uint256 _predictionId)
        external
        validPrediction(_predictionId)
        isApprover
        notResolved(_predictionId)
    {
        require(!predictionApprovals[_predictionId][msg.sender], "Already approved by you");

        Prediction storage prediction = predictions[_predictionId];
        require(prediction.needsApproval, "Prediction doesn't need approval");
        require(!prediction.cancelled, "Prediction cancelled");

        predictionApprovals[_predictionId][msg.sender] = true;
        approvalCount[_predictionId]++;

        // Check if enough approvals to go live
        bool isNowLive = approvalCount[_predictionId] >= requiredApprovals;
        if (isNowLive) {
            prediction.approved = true;
        }

        emit PredictionApproved(_predictionId, msg.sender, approvalCount[_predictionId], isNowLive);
    }

    /**
     * @dev Reject a prediction with reason
     */
    function rejectPrediction(uint256 _predictionId, string memory _reason)
        external
        validPrediction(_predictionId)
        isApprover
        notResolved(_predictionId)
    {
        Prediction storage prediction = predictions[_predictionId];
        require(prediction.needsApproval, "Prediction doesn't need approval");
        require(!prediction.cancelled, "Prediction already cancelled");

        // Cancel the prediction
        prediction.cancelled = true;

        emit PredictionRejected(_predictionId, msg.sender, _reason);
        emit PredictionCancelled(_predictionId, _reason);
    }

    /**
     * @dev Emergency cancel prediction
     */
    function cancelPrediction(uint256 _predictionId, string memory _reason)
        external
        onlyOwner
        validPrediction(_predictionId)
        notResolved(_predictionId)
    {
        predictions[_predictionId].cancelled = true;
        emit PredictionCancelled(_predictionId, _reason);
    }

    /**
     * @dev Users claim their rewards manually
     */
    function claimReward(uint256 _predictionId)
        external
        validPrediction(_predictionId)
    {
        Prediction storage prediction = predictions[_predictionId];
        require(prediction.resolved || prediction.cancelled, "Not resolved yet");

        UserStake storage userStake = userStakes[_predictionId][msg.sender];
        require(!userStake.claimed, "Already claimed");
        require(
            userStake.yesAmount > 0 || userStake.noAmount > 0,
            "No stake found"
        );

        userStake.claimed = true;
        uint256 payout = 0;
        uint256 originalStake = userStake.yesAmount + userStake.noAmount;
        uint256 profit = 0;

        if (prediction.cancelled) {
            // Full refund if cancelled
            payout = originalStake;
            emit EmergencyRefund(_predictionId, msg.sender, payout);
        } else {
            // Calculate proportional winnings
            PayoutInfo memory payoutInfo = calculatePayout(_predictionId, msg.sender);
            payout = payoutInfo.payout;
            profit = payoutInfo.profit;
        }

        if (payout > 0) {
            (bool success, ) = payable(msg.sender).call{value: payout}("");
            require(success, "Transfer failed");

            emit RewardClaimed(
                _predictionId,
                msg.sender,
                payout,
                originalStake,
                profit
            );
        }
    }

    // ============ OPTIMIZED VIEW FUNCTIONS ============

    /**
     * @dev Get prediction basic info (optimized for stack)
     */
    function getPredictionBasic(uint256 _predictionId)
        external
        view
        validPrediction(_predictionId)
        returns (PredictionView memory)
    {
        Prediction storage p = predictions[_predictionId];
        return PredictionView({
            question: p.question,
            description: p.description,
            category: p.category,
            yesTotalAmount: p.yesTotalAmount,
            noTotalAmount: p.noTotalAmount,
            deadline: p.deadline,
            resolved: p.resolved,
            outcome: p.outcome,
            approved: p.approved,
            creator: p.creator
        });
    }

    /**
     * @dev Get prediction extended info
     */
    function getPredictionExtended(uint256 _predictionId)
        external
        view
        validPrediction(_predictionId)
        returns (
            string memory imageUrl,
            uint256 resolutionDeadline,
            bool cancelled,
            uint256 createdAt,
            bool verified,
            bool needsApproval,
            uint256 approvalCount_
        )
    {
        Prediction storage p = predictions[_predictionId];
        return (
            p.imageUrl,
            p.resolutionDeadline,
            p.cancelled,
            p.createdAt,
            p.verified,
            p.needsApproval,
            approvalCount[_predictionId]
        );
    }

    /**
     * @dev Calculate what user would receive if they claimed now
     */
    function calculatePayout(uint256 _predictionId, address _user)
        public
        view
        validPrediction(_predictionId)
        returns (PayoutInfo memory)
    {
        Prediction storage prediction = predictions[_predictionId];

        // If not resolved or cancelled, no payout
        if (!prediction.resolved || prediction.cancelled) {
            return PayoutInfo(0, 0);
        }

        UserStake storage userStake = userStakes[_predictionId][_user];

        uint256 winnersPool = prediction.outcome ? prediction.yesTotalAmount : prediction.noTotalAmount;
        uint256 losersPool = prediction.outcome ? prediction.noTotalAmount : prediction.yesTotalAmount;
        uint256 userWinningStake = prediction.outcome ? userStake.yesAmount : userStake.noAmount;

        // If user didn't bet on winning side or no winners, no payout
        if (userWinningStake == 0 || winnersPool == 0) {
            return PayoutInfo(0, 0);
        }

        // Platform takes 1% fee from losers pool
        uint256 platformFee = (losersPool * platformFeePercentage) / 10000;
        uint256 netLosersPool = losersPool - platformFee;

        // User gets: their original winning stake + proportional share of net losers pool
        uint256 userShareOfProfit = (userWinningStake * netLosersPool) / winnersPool;
        uint256 payout = userWinningStake + userShareOfProfit;
        uint256 profit = userShareOfProfit;

        return PayoutInfo(payout, profit);
    }

    /**
     * @dev Get user's stake and potential payout info
     */
    function getUserStakeInfo(uint256 _predictionId, address _user)
        external
        view
        validPrediction(_predictionId)
        returns (
            uint256 yesAmount,
            uint256 noAmount,
            bool claimed,
            uint256 potentialPayout,
            uint256 potentialProfit
        )
    {
        UserStake storage userStake = userStakes[_predictionId][_user];
        PayoutInfo memory payoutInfo = calculatePayout(_predictionId, _user);

        return (
            userStake.yesAmount,
            userStake.noAmount,
            userStake.claimed,
            payoutInfo.payout,
            payoutInfo.profit
        );
    }

    /**
     * @dev Get prediction market statistics
     */
    function getMarketStats(uint256 _predictionId)
        external
        view
        validPrediction(_predictionId)
        returns (MarketStats memory)
    {
        Prediction storage p = predictions[_predictionId];
        uint256 totalPool = p.yesTotalAmount + p.noTotalAmount;
        uint256 participantsCount = participants[_predictionId].length;

        uint256 yesPercentage = 0;
        uint256 noPercentage = 0;
        if (totalPool > 0) {
            yesPercentage = (p.yesTotalAmount * 100) / totalPool;
            noPercentage = (p.noTotalAmount * 100) / totalPool;
        }

        uint256 timeLeft = block.timestamp >= p.deadline ? 0 : p.deadline - block.timestamp;

        return MarketStats({
            totalPool: totalPool,
            participantsCount: participantsCount,
            yesPercentage: yesPercentage,
            noPercentage: noPercentage,
            timeLeft: timeLeft
        });
    }

    /**
     * @dev Get list of all participants for a prediction
     */
    function getParticipants(uint256 _predictionId)
        external
        view
        validPrediction(_predictionId)
        returns (address[] memory)
    {
        return participants[_predictionId];
    }

    /**
     * @dev Check if prediction can still be resolved
     */
    function canStillResolve(uint256 _predictionId)
        external
        view
        validPrediction(_predictionId)
        returns (bool)
    {
        Prediction storage p = predictions[_predictionId];
        return !p.resolved &&
               !p.cancelled &&
               block.timestamp >= p.deadline &&
               block.timestamp <= p.resolutionDeadline;
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @dev Add/remove approvers
     */
    function setApprover(address _approver, bool _approved) external onlyOwner {
        approvers[_approver] = _approved;
    }

    /**
     * @dev Set how many approvals are needed
     */
    function setRequiredApprovals(uint256 _required) external onlyOwner {
        require(_required > 0 && _required <= 10, "Invalid approval count");
        requiredApprovals = _required;
    }

    /**
     * @dev Approve/remove creators
     */
    function setApprovedCreator(address _creator, bool _approved) external onlyOwner {
        approvedCreators[_creator] = _approved;
    }

    /**
     * @dev Enable/disable public prediction creation
     */
    function setPublicCreation(bool _enabled) external onlyOwner {
        publicCreationEnabled = _enabled;
    }

    /**
     * @dev Set creation fee for non-approved users
     */
    function setCreationFee(uint256 _fee) external onlyOwner {
        creationFee = _fee;
    }

    /**
     * @dev Manually verify/unverify a prediction
     */
    function setPredictionVerified(uint256 _predictionId, bool _verified)
        external
        onlyOwner
        validPrediction(_predictionId)
    {
        predictions[_predictionId].verified = _verified;
    }

    /**
     * @dev Set platform fee (max 10%)
     */
    function setPlatformFee(uint256 _feePercentage) external onlyOwner {
        require(_feePercentage <= 1000, "Fee cannot exceed 10%");
        platformFeePercentage = _feePercentage;
    }

    /**
     * @dev Set minimum and maximum stake limits
     */
    function setStakeLimits(uint256 _minimum, uint256 _maximum) external onlyOwner {
        require(_minimum > 0 && _minimum < _maximum, "Invalid limits");
        minimumStake = _minimum;
        maximumStake = _maximum;
    }

    /**
     * @dev Set maximum resolution time after deadline
     */
    function setMaxResolutionTime(uint256 _maxTime) external onlyOwner {
        require(_maxTime >= 1 hours && _maxTime <= 30 days, "Invalid resolution time");
        maxResolutionTime = _maxTime;
    }

    /**
     * @dev Withdraw collected platform fees
     */
    function withdrawFees() external onlyOwner {
        uint256 amount = collectedFees;
        require(amount > 0, "No fees to withdraw");

        collectedFees = 0;

        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev Pause/unpause contract
     */
    function pause() external onlyOwner {
        _paused = true;
    }

    function unpause() external onlyOwner {
        _paused = false;
    }

    /**
     * @dev Emergency withdraw all funds
     */
    function emergencyWithdraw() external onlyOwner {
        require(_paused, "Contract must be paused first");

        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev Get contract info
     */
    function getContractStats()
        external
        view
        returns (ContractStats memory)
    {
        return ContractStats({
            totalPredictions: nextPredictionId - 1,
            platformFee: platformFeePercentage,
            collectedFees: collectedFees,
            minStake: minimumStake,
            maxStake: maximumStake,
            contractBalance: address(this).balance
        });
    }

    // ============ RECEIVE FUNCTION ============

    /**
     * @dev Contract can receive ETH
     */
    receive() external payable {}
}
