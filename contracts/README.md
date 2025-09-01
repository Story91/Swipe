# Prediction Market Smart Contract

## 📋 Overview

This is a complete implementation of a Tinder-style prediction market built on Solidity. The contract features proportional payouts, community approval system, and emergency controls.

## 🚀 Key Features

- **Tinder-style betting**: Swipe right for YES, left for NO
- **Fair proportional payouts**: Everyone gets the same % return
- **1% platform fee** taken only from winners' profit
- **Community approval system** for quality control
- **Emergency cancellation** with full refunds
- **Pull-pattern rewards** for security

## 🛠️ Deployment

### Prerequisites

1. Install dependencies:
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @nomicfoundation/hardhat-ethers dotenv
```

2. Set up environment variables (copy from `deployment-config.js`):
```bash
cp deployment-config.js .env
# Edit .env with your actual values
```

### Deploy to Base

```bash
# Deploy to Base Goerli testnet
npx hardhat run scripts/deploy.js --network baseGoerli

# Deploy to Base mainnet
npx hardhat run scripts/deploy.js --network base

# Deploy to local Hardhat network
npx hardhat run scripts/deploy.js --network localhost
```

## 📋 Contract Functions

### Core Functions

#### Create Prediction
```solidity
function createPrediction(
    string memory _question,
    string memory _description,
    string memory _category,
    string memory _imageUrl,
    uint256 _durationInHours
) external payable returns (uint256)
```

#### Place Stake
```solidity
function placeStake(uint256 _predictionId, bool _isYes) external payable
```

#### Resolve Prediction
```solidity
function resolvePrediction(uint256 _predictionId, bool _outcome) external
```

#### Claim Reward
```solidity
function claimReward(uint256 _predictionId) external
```

### Admin Functions

#### Set Approver
```solidity
function setApprover(address _approver, bool _approved) external
```

#### Withdraw Fees
```solidity
function withdrawFees() external
```

#### Emergency Cancel
```solidity
function cancelPrediction(uint256 _predictionId, string memory _reason) external
```

## 🔧 Configuration

### Platform Parameters

- **Platform Fee**: 1% (100 basis points)
- **Minimum Stake**: 0.001 ETH
- **Maximum Stake**: 100 ETH
- **Creation Fee**: 0.01 ETH (for non-approved users)
- **Max Resolution Time**: 7 days
- **Required Approvals**: 1 (configurable)

### Setting Platform Parameters

```solidity
// Set platform fee (max 10%)
contract.setPlatformFee(200); // 2%

// Set stake limits
contract.setStakeLimits(0.001 ether, 50 ether);

// Set creation fee
contract.setCreationFee(0.05 ether);

// Set required approvals
contract.setRequiredApprovals(2);
```

## 📊 View Functions

### Get Prediction Details
```solidity
function getPrediction(uint256 _predictionId) external view returns (
    string question, string description, string category, string imageUrl,
    uint256 yesTotalAmount, uint256 noTotalAmount, uint256 deadline,
    uint256 resolutionDeadline, bool resolved, bool outcome, bool cancelled,
    uint256 createdAt, address creator, bool verified, bool approved, bool needsApproval
)
```

### Calculate Payout
```solidity
function calculatePayout(uint256 _predictionId, address _user) public view returns (
    uint256 payout, uint256 profit
)
```

### Get Market Stats
```solidity
function getMarketStats(uint256 _predictionId) external view returns (
    uint256 totalPool, uint256 participantsCount,
    uint256 yesPercentage, uint256 noPercentage, uint256 timeLeft
)
```

## 🎯 Usage Examples

### 1. Create a Prediction

```javascript
const predictionId = await contract.createPrediction(
    "Will Bitcoin hit $100k in 2024?",
    "Market analysis shows strong momentum",
    "Crypto",
    "https://ipfs.io/ipfs/...",
    168 // 1 week in hours
);
```

### 2. Place a Bet

```javascript
await contract.placeStake(predictionId, true, {
    value: ethers.parseEther("1.0") // Bet 1 ETH on YES
});
```

### 3. Resolve Prediction

```javascript
await contract.resolvePrediction(predictionId, true); // YES wins
```

### 4. Claim Reward

```javascript
await contract.claimReward(predictionId);
```

## 🛡️ Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Pausable**: Emergency stop functionality
- **Pull Pattern**: Users claim their own rewards
- **Input Validation**: Comprehensive parameter checks
- **Access Control**: Role-based permissions

## 📈 Fee Structure

- **Platform Fee**: 1% from winners' profit
- **Creation Fee**: 0.01 ETH for public users
- **No fees on original stakes**: Only profit is taxed

### Example Payout Calculation

```javascript
// Prediction: BTC hits $100k
// YES Pool: 10 ETH, NO Pool: 6 ETH
// User bet 1 ETH on YES
// Outcome: YES wins

// Platform fee: 6 ETH × 1% = 0.06 ETH
// Distributable profit: 6 ETH - 0.06 ETH = 5.94 ETH
// User's share: (1 ETH / 10 ETH) × 5.94 ETH = 0.594 ETH
// Total payout: 1 ETH + 0.594 ETH = 1.594 ETH
// User profit: 0.594 ETH (59.4% return)
```

## 🔍 Events

The contract emits the following events:

- `PredictionCreated`
- `PredictionApproved`
- `PredictionRejected`
- `PredictionResolved`
- `StakePlaced`
- `RewardClaimed`
- `PredictionCancelled`
- `EmergencyRefund`

## 📋 Deployment Checklist

- [ ] Test contract on local network
- [ ] Deploy to testnet and verify functionality
- [ ] Set up approvers and approved creators
- [ ] Configure platform parameters
- [ ] Deploy to mainnet
- [ ] Verify contract on block explorer
- [ ] Set up monitoring and alerts

## 🚨 Emergency Procedures

### Emergency Cancellation
```solidity
contract.cancelPrediction(predictionId, "Emergency: Oracle manipulation detected");
```

### Emergency Pause
```solidity
contract.pause(); // Stop all new bets
```

### Emergency Withdraw
```solidity
contract.emergencyWithdraw(); // Withdraw all funds (only when paused)
```

## 📞 Support

For questions or issues with the smart contract, please refer to the documentation or create an issue in the repository.
