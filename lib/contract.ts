import { ethers } from 'ethers';

// Contract Configuration
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0xdc21A340835C41a14Eb1C856Ce902464D04774E3';

// ABI generated from PredictionMarket_Optimized.sol
export const CONTRACT_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "predictionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "EmergencyRefund",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "predictionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "approver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "totalApprovals",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "isNowLive",
        "type": "bool"
      }
    ],
    "name": "PredictionApproved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "predictionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "question",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "category",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "imageUrl",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "verified",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "needsApproval",
        "type": "bool"
      }
    ],
    "name": "PredictionCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "predictionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "approver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "reason",
        "type": "string"
      }
    ],
    "name": "PredictionRejected",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "predictionId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "winnersPool",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "losersPool",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "platformFee",
        "type": "uint256"
      }
    ],
    "name": "PredictionResolved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "predictionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "payout",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "originalStake",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "profit",
        "type": "uint256"
      }
    ],
    "name": "RewardClaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "predictionId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "reason",
        "type": "string"
      }
    ],
    "name": "PredictionCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "predictionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "isYes",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newYesTotal",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newNoTotal",
        "type": "uint256"
      }
    ],
    "name": "StakePlaced",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      }
    ],
    "name": "approvalCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "collectedFees",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "creationFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maximumStake",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minimumStake",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextPredictionId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "platformFeePercentage",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "publicCreationEnabled",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "requiredApprovals",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "predictionApprovals",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "predictions",
    "outputs": [
      {
        "internalType": "string",
        "name": "question",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "category",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "imageUrl",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "yesTotalAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "noTotalAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "resolutionDeadline",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "resolved",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "cancelled",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "createdAt",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "verified",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "approved",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "needsApproval",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "userStakes",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "yesAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "noAmount",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "claimed",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      }
    ],
    "name": "participants",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "approvedCreators",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "approvers",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_question",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_description",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_category",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_imageUrl",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "_durationInHours",
        "type": "uint256"
      }
    ],
    "name": "createPrediction",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "_isYes",
        "type": "bool"
      }
    ],
    "name": "placeStake",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "_outcome",
        "type": "bool"
      }
    ],
    "name": "resolvePrediction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      }
    ],
    "name": "approvePrediction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "_reason",
        "type": "string"
      }
    ],
    "name": "rejectPrediction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "_reason",
        "type": "string"
      }
    ],
    "name": "cancelPrediction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      }
    ],
    "name": "claimReward",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      }
    ],
    "name": "getPredictionBasic",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "question",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "description",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "category",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "yesTotalAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "noTotalAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "deadline",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "resolved",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "outcome",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "approved",
            "type": "bool"
          },
          {
            "internalType": "address",
            "name": "creator",
            "type": "address"
          }
        ],
        "internalType": "struct PredictionMarket.PredictionView",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      }
    ],
    "name": "getPredictionExtended",
    "outputs": [
      {
        "internalType": "string",
        "name": "imageUrl",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "resolutionDeadline",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "cancelled",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "createdAt",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "verified",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "needsApproval",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "approvalCount_",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "_user",
        "type": "address"
      }
    ],
    "name": "calculatePayout",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "payout",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "profit",
            "type": "uint256"
          }
        ],
        "internalType": "struct PredictionMarket.PayoutInfo",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "_user",
        "type": "address"
      }
    ],
    "name": "getUserStakeInfo",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "yesAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "noAmount",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "claimed",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "potentialPayout",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "potentialProfit",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      }
    ],
    "name": "getMarketStats",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "totalPool",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "participantsCount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "yesPercentage",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "noPercentage",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "timeLeft",
            "type": "uint256"
          }
        ],
        "internalType": "struct PredictionMarket.MarketStats",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      }
    ],
    "name": "getParticipants",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      }
    ],
    "name": "canStillResolve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_approver",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "_approved",
        "type": "bool"
      }
    ],
    "name": "setApprover",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_required",
        "type": "uint256"
      }
    ],
    "name": "setRequiredApprovals",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_creator",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "_approved",
        "type": "bool"
      }
    ],
    "name": "setApprovedCreator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bool",
        "name": "_enabled",
        "type": "bool"
      }
    ],
    "name": "setPublicCreation",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_fee",
        "type": "uint256"
      }
    ],
    "name": "setCreationFee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_predictionId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "_verified",
        "type": "bool"
      }
    ],
    "name": "setPredictionVerified",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_feePercentage",
        "type": "uint256"
      }
    ],
    "name": "setPlatformFee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_minimum",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_maximum",
        "type": "uint256"
      }
    ],
    "name": "setStakeLimits",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_maxTime",
        "type": "uint256"
      }
    ],
    "name": "setMaxResolutionTime",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdrawFees",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "emergencyWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractStats",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "totalPredictions",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "platformFee",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "collectedFees",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "minStake",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "maxStake",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "contractBalance",
            "type": "uint256"
          }
        ],
        "internalType": "struct PredictionMarket.ContractStats",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "receive",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
] as const;

// Contract instance helper
export function getContract(signer?: ethers.Signer) {
  if (!signer) {
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI);
  }
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

// Type definitions for TypeScript
export interface PredictionView {
  question: string;
  description: string;
  category: string;
  yesTotalAmount: bigint;
  noTotalAmount: bigint;
  deadline: bigint;
  resolved: boolean;
  outcome: boolean;
  approved: boolean;
  creator: string;
}

export interface PayoutInfo {
  payout: bigint;
  profit: bigint;
}

export interface MarketStats {
  totalPool: bigint;
  participantsCount: bigint;
  yesPercentage: bigint;
  noPercentage: bigint;
  timeLeft: bigint;
}

export interface ContractStats {
  totalPredictions: bigint;
  platformFee: bigint;
  collectedFees: bigint;
  minStake: bigint;
  maxStake: bigint;
  contractBalance: bigint;
}
