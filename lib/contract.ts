import { ethers } from 'ethers';

// V1 Contract Configuration (Legacy)
export const V1_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_V1_CONTRACT_ADDRESS || '0xdc21A340835C41a14Eb1C856Ce902464D04774E3';

// V2 Contract Configuration (New)
export const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_V2_CONTRACT_ADDRESS || '0x2bA339Df34B98099a9047d9442075F7B3a792f74';

// SWIPE Token Configuration
export const SWIPE_TOKEN = {
  address: '0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9',
  symbol: 'SWIPE',
  decimals: 18,
  name: 'Swipe'
};

// Migration date - when V2 was deployed
export const MIGRATION_DATE = new Date('2024-01-15'); // Will be updated after deploy

// Helper functions
export const getContractForPrediction = (createdAt: Date) => {
  return createdAt < MIGRATION_DATE ? CONTRACTS.V1 : CONTRACTS.V2;
};

export const getContractForAction = (action: 'create' | 'stake' | 'claim', predictionId?: string) => {
  if (action === 'create' || action === 'stake') {
    return CONTRACTS.V2; // zawsze V2 dla nowych akcji
  }
  
  // Dla claimów - sprawdzamy datę utworzenia prediction
  // To będzie implementowane w komponentach
  return CONTRACTS.V1; // fallback
};

// ABI generated from PredictionMarket_Optimized.sol (V1)
export const V1_ABI = [
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

// ABI generated from PredictionMarket_V2.sol (V2)
const V2_ABI_DATA = require('../artifacts/contracts/PredictionMarket_V2.sol/PredictionMarketV2.json');
export const V2_ABI = V2_ABI_DATA.abi;

// Dual Contract Configuration
export const CONTRACTS = {
  V1: {
    address: V1_CONTRACT_ADDRESS,
    abi: V1_ABI,
    version: 'v1',
    active: true, // w pełni aktywny
    supportedTokens: ['ETH']
  },
  V2: {
    address: V2_CONTRACT_ADDRESS,
    abi: V2_ABI,
    version: 'v2',
    active: true, // dla nowych predictions
    supportedTokens: ['ETH', 'SWIPE']
  },
  USDC: {
    address: process.env.NEXT_PUBLIC_USDC_DUALPOOL_CONTRACT || '0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205',
    abi: [], // Will be populated after import
    version: 'usdc',
    active: true,
    supportedTokens: ['USDC']
  }
};

// Contract instance helpers
export function getV1Contract(signer?: ethers.Signer) {
  if (!signer) {
    return new ethers.Contract(V1_CONTRACT_ADDRESS, V1_ABI);
  }
  return new ethers.Contract(V1_CONTRACT_ADDRESS, V1_ABI, signer);
}

export function getV2Contract(signer?: ethers.Signer) {
  if (!signer) {
    return new ethers.Contract(V2_CONTRACT_ADDRESS, V2_ABI);
  }
  return new ethers.Contract(V2_CONTRACT_ADDRESS, V2_ABI, signer);
}

// Legacy function for backward compatibility
export function getContract(signer?: ethers.Signer) {
  return getV2Contract(signer); // Default to V2
}

// SwipeClaim Contract Configuration
export const SWIPE_CLAIM_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_SWIPE_CLAIM_CONTRACT || '0x0000000000000000000000000000000000000000';

// SwipeClaim Contract ABI (simplified - only functions we need)
export const SWIPE_CLAIM_ABI = [
  {
    inputs: [],
    name: 'claimSwipe',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: '_user', type: 'address' }],
    name: 'getUserClaimInfo',
    outputs: [
      { name: 'eligible', type: 'bool' },
      { name: 'betCount', type: 'uint256' },
      { name: 'rewardAmount', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_user', type: 'address' }],
    name: 'hasClaimed',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'claimingEnabled',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getSwipeBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

export const SWIPE_CLAIM_CONFIG = {
  address: SWIPE_CLAIM_CONTRACT_ADDRESS,
  abi: SWIPE_CLAIM_ABI,
};

// ============ USDC DualPool Contract Configuration ============

// USDC Token Address on Base
export const USDC_TOKEN = {
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  symbol: 'USDC',
  decimals: 6,
  name: 'USD Coin'
};

// USDC DualPool Contract Address (update after deployment)
export const USDC_DUALPOOL_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_USDC_DUALPOOL_CONTRACT || '0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205';

// USDC DualPool Contract ABI
export const USDC_DUALPOOL_ABI = [
  // Register prediction
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'creator', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'registerPrediction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Place bet
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'placeBet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Exit early
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'exitEarly',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Resolve prediction
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'outcome', type: 'bool' }
    ],
    name: 'resolvePrediction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Claim winnings
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'claimWinnings',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Claim refund
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'claimRefund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Cancel prediction
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'reason', type: 'string' }
    ],
    name: 'cancelPrediction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // View: Get prices
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'getPrices',
    outputs: [
      { name: 'yesPrice', type: 'uint256' },
      { name: 'noPrice', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // View: Get prediction
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'getPrediction',
    outputs: [
      { name: 'registered', type: 'bool' },
      { name: 'creator', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'yesPool', type: 'uint256' },
      { name: 'noPool', type: 'uint256' },
      { name: 'resolved', type: 'bool' },
      { name: 'cancelled', type: 'bool' },
      { name: 'outcome', type: 'bool' },
      { name: 'participantCount', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // View: Get position
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'user', type: 'address' }
    ],
    name: 'getPosition',
    outputs: [
      { name: 'yesAmount', type: 'uint256' },
      { name: 'noAmount', type: 'uint256' },
      { name: 'yesEntryPrice', type: 'uint256' },
      { name: 'noEntryPrice', type: 'uint256' },
      { name: 'claimed', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // View: Calculate exit value
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'calculateExitValue',
    outputs: [
      { name: 'grossValue', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'netValue', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // View: Calculate potential winnings
  {
    inputs: [
      { name: 'predictionId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'calculatePotentialWinnings',
    outputs: [
      { name: 'potentialPayout', type: 'uint256' },
      { name: 'potentialProfit', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // View: Is prediction active
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'isPredictionActive',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  // View: Get participant count
  {
    inputs: [{ name: 'predictionId', type: 'uint256' }],
    name: 'getParticipantCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'predictionId', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: false, name: 'deadline', type: 'uint256' }
    ],
    name: 'PredictionRegistered',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'predictionId', type: 'uint256' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'isYes', type: 'bool' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'priceAtEntry', type: 'uint256' },
      { indexed: false, name: 'newYesPool', type: 'uint256' },
      { indexed: false, name: 'newNoPool', type: 'uint256' }
    ],
    name: 'BetPlaced',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'predictionId', type: 'uint256' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'isYes', type: 'bool' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'received', type: 'uint256' },
      { indexed: false, name: 'fee', type: 'uint256' }
    ],
    name: 'EarlyExit',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'predictionId', type: 'uint256' },
      { indexed: false, name: 'outcome', type: 'bool' },
      { indexed: false, name: 'platformFee', type: 'uint256' },
      { indexed: false, name: 'creatorReward', type: 'uint256' },
      { indexed: false, name: 'winnersPool', type: 'uint256' },
      { indexed: false, name: 'losersPool', type: 'uint256' }
    ],
    name: 'PredictionResolved',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'predictionId', type: 'uint256' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'profit', type: 'uint256' }
    ],
    name: 'WinningsClaimed',
    type: 'event'
  }
] as const;

// USDC DualPool Contract Config
export const USDC_DUALPOOL_CONFIG = {
  address: USDC_DUALPOOL_CONTRACT_ADDRESS,
  abi: USDC_DUALPOOL_ABI,
  token: USDC_TOKEN,
  fees: {
    platform: 100, // 1% (basis points)
    creator: 50,   // 0.5% (basis points)
    earlyExit: 500 // 5% (basis points)
  },
  minBet: 1_000_000 // 1 USDC (6 decimals)
};

// Helper function to get USDC DualPool contract
export function getUSDCDualPoolContract(signer?: ethers.Signer) {
  if (!signer) {
    return new ethers.Contract(USDC_DUALPOOL_CONTRACT_ADDRESS, USDC_DUALPOOL_ABI);
  }
  return new ethers.Contract(USDC_DUALPOOL_CONTRACT_ADDRESS, USDC_DUALPOOL_ABI, signer);
}

// Helper function to get USDC token contract
export function getUSDCContract(signer?: ethers.Signer) {
  const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)'
  ];
  
  if (!signer) {
    return new ethers.Contract(USDC_TOKEN.address, ERC20_ABI);
  }
  return new ethers.Contract(USDC_TOKEN.address, ERC20_ABI, signer);
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
