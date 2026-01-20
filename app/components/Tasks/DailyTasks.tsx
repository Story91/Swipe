"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, parseEther } from "viem";
import { useNotification, useComposeCast, useOpenUrl, useMiniKit } from "@coinbase/onchainkit/minikit";
import sdk from "@farcaster/miniapp-sdk";
import { notifyDailyTaskCompleted } from "@/lib/notification-helpers";
import Image from "next/image";
import { Share2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import "./DailyTasks.css";
import { HackScreen } from "../HackScreen/HackScreen";

// Contract addresses - UPDATE THESE AFTER DEPLOYMENT
// Use V3 if available, fallback to V2 (UI will still show "V1 to V2" for users)
const DAILY_REWARDS_CONTRACT = (
  (process.env.NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT as `0x${string}`) ||
  (process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000"
);
const SWIPE_TOKEN = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";

// Minimum SWIPE balance required (1M SWIPE)
const MIN_SWIPE_BALANCE = parseEther("1000000"); // 1,000,000 SWIPE

// Share text variants for Farcaster casts
const SHARE_TEXTS = [
  "Swiping my way to crypto glory 🎴 Who else is making predictions on @swipeai? $SWIPE",
  "Just made a bold prediction on @swipeai 🔮 Let's see if I'm a genius or a degen $SWIPE",
  "Prediction markets + Tinder vibes = @swipeai 💚 Swipe right on alpha! $SWIPE",
  "My crystal ball says... check @swipeai for the hottest predictions 🎯 $SWIPE",
  "Making predictions like a pro on @swipeai 🚀 Stack that $SWIPE!",
  "Who needs a magic 8-ball when you have @swipeai? 🎱 $SWIPE",
  "Swipe left on FUD, swipe right on @swipeai predictions 💪 $SWIPE",
  "Daily dose of alpha from @swipeai 📈 My streak is on fire! $SWIPE",
  "Feeling bullish today 🐂 Making moves on @swipeai $SWIPE",
  "Prediction game strong 💪 Thanks @swipeai for the $SWIPE rewards!",
  "Just claimed my daily on @swipeai 🎁 Free $SWIPE every day!",
  "The future is clear when you're swiping on @swipeai 🔮 $SWIPE",
];

// Get random share text (returns plain text, not encoded)
const getRandomShareText = () => {
  return SHARE_TEXTS[Math.floor(Math.random() * SHARE_TEXTS.length)];
};

// Contract ABI (only functions we need)
const DAILY_REWARDS_ABI = [
  {
    "inputs": [{"name": "signature", "type": "bytes"}],
    "name": "claimDaily",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getUserStats",
    "outputs": [
      {"name": "lastClaimTimestamp", "type": "uint256"},
      {"name": "currentStreak", "type": "uint256"},
      {"name": "longestStreak", "type": "uint256"},
      {"name": "totalClaimed", "type": "uint256"},
      {"name": "jackpotsWon", "type": "uint256"},
      {"name": "canClaimToday", "type": "bool"},
      {"name": "nextClaimTime", "type": "uint256"},
      {"name": "potentialReward", "type": "uint256"},
      {"name": "isMigrated", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getUserDailyTasks",
    "outputs": [
      {"name": "shareCast", "type": "bool"},
      {"name": "createPrediction", "type": "bool"},
      {"name": "tradingVolume", "type": "bool"},
      {"name": "needsReset", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getUserAchievements",
    "outputs": [
      {"name": "isBetaTester", "type": "bool"},
      {"name": "hasFollowedSocials", "type": "bool"},
      {"name": "hasStreak7", "type": "bool"},
      {"name": "hasStreak30", "type": "bool"},
      {"name": "referrals", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getPoolStats",
    "outputs": [
      {"name": "poolBalance", "type": "uint256"},
      {"name": "distributed", "type": "uint256"},
      {"name": "userCount", "type": "uint256"},
      {"name": "claimCount", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "taskType", "type": "string"},
      {"name": "signature", "type": "bytes"}
    ],
    "name": "completeTask",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "referrer", "type": "address"},
      {"name": "signature", "type": "bytes"}
    ],
    "name": "registerReferral",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "BASE_DAILY_REWARD",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "STREAK_BONUS_PER_DAY",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "achievementType", "type": "string"},
      {"name": "signature", "type": "bytes"}
    ],
    "name": "claimAchievement",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "hasUsedReferral",
    "outputs": [{"type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "migrateFromV1",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

interface UserStats {
  lastClaimTimestamp: bigint;
  currentStreak: bigint;
  longestStreak: bigint;
  totalClaimed: bigint;
  jackpotsWon: bigint;
  canClaimToday: boolean;
  nextClaimTime: bigint;
  potentialReward: bigint;
  isMigrated: boolean;
}

interface DailyTasksStatus {
  shareCast: boolean;
  createPrediction: boolean;
  tradingVolume: boolean;
  needsReset: boolean;
}

interface Achievements {
  isBetaTester: boolean;
  hasFollowedSocials: boolean;
  hasStreak7: boolean;
  hasStreak30: boolean;
  referrals: bigint;
}

interface PoolStats {
  poolBalance: bigint;
  distributed: bigint;
  userCount: bigint;
  claimCount: bigint;
}

export function DailyTasks() {
  const { address, isConnected } = useAccount();
  const sendNotification = useNotification();
  const publicClient = usePublicClient();
  const { composeCast: minikitComposeCast } = useComposeCast();
  const minikitOpenUrl = useOpenUrl();
  const { context } = useMiniKit();
  const searchParams = useSearchParams();
  
  // Helper function to get user's FID
  const getUserFid = async (): Promise<number | null> => {
    try {
      // Try user.fid first (newer MiniKit versions)
      if (context?.user?.fid) {
        return context.user.fid;
      }
      // Fallback to client.fid (older versions)
      else if (context?.client && 'fid' in context.client) {
        return (context.client as any).fid;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting user FID:', error);
      return null;
    }
  };
  
  // Universal openUrl function - works on both MiniKit (Base app) and Farcaster SDK (Warpcast)
  const openUrl = useCallback(async (url: string) => {
    // Try MiniKit first (Base app)
    try {
      if (minikitOpenUrl) {
        console.log('📱 Using MiniKit openUrl...');
        minikitOpenUrl(url);
        return;
      }
    } catch (error) {
      console.log('MiniKit openUrl failed, trying Farcaster SDK...', error);
    }
    
    // Fallback to Farcaster SDK (Warpcast and other clients)
    try {
      console.log('📱 Using Farcaster SDK openUrl...');
      await sdk.actions.openUrl(url);
    } catch (error) {
      console.error('Both openUrl methods failed, using window.open:', error);
      window.open(url, '_blank');
    }
  }, [minikitOpenUrl]);
  
  // Universal composeCast function - works on both MiniKit (Base app) and Farcaster SDK (Warpcast)
  const composeCast = useCallback(async (params: { text: string; embeds?: string[] }) => {
    // Try MiniKit first (Base app)
    try {
      if (minikitComposeCast) {
        console.log('📱 Using MiniKit composeCast for share...');
        const embedsParam = params.embeds?.slice(0, 2) as [] | [string] | [string, string] | undefined;
        await minikitComposeCast({ text: params.text, embeds: embedsParam });
        return;
      }
    } catch (error) {
      console.log('MiniKit composeCast failed, trying Farcaster SDK...', error);
    }
    
    // Fallback to Farcaster SDK (Warpcast and other clients)
    try {
      console.log('📱 Using Farcaster SDK composeCast for share...');
      await sdk.actions.composeCast({
        text: params.text,
        embeds: params.embeds?.map(url => ({ url })) as any
      });
    } catch (error) {
      console.error('Both composeCast methods failed:', error);
      throw error;
    }
  }, [minikitComposeCast]);
  
  const [countdown, setCountdown] = useState<string>("");
  const [isClaimLoading, setIsClaimLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [lastJackpotWin, setLastJackpotWin] = useState(false);
  
  // Task completion states
  const [castUrl, setCastUrl] = useState("");
  const [isVerifyingTask, setIsVerifyingTask] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [completedTasksLocal, setCompletedTasksLocal] = useState<Record<string, boolean>>({});
  const [verifiedTasks, setVerifiedTasks] = useState<Record<string, { signature: string }>>({});
  const [referralCode, setReferralCode] = useState("");
  const [isClaimingTask, setIsClaimingTask] = useState<string | null>(null);
  const [showCastInput, setShowCastInput] = useState(false);
  const [pendingConfirmTask, setPendingConfirmTask] = useState<string | null>(null); // Track which task to confirm after tx success
  
  // Follow status (checked via API, independent from claim status)
  const [isFollowingSwipeAI, setIsFollowingSwipeAI] = useState<boolean | null>(null);
  const [isCheckingFollow, setIsCheckingFollow] = useState(false);

  // Beta tester eligibility (checked via API, independent from claim status)
  const [isBetaTesterEligible, setIsBetaTesterEligible] = useState<boolean | null>(null);
  const [isCheckingBetaTester, setIsCheckingBetaTester] = useState(false);
  
  // Blacklist check
  const [isBlacklisted, setIsBlacklisted] = useState<boolean | null>(null);
  const [isCheckingBlacklist, setIsCheckingBlacklist] = useState(false);
  
  // Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  
  // Contract reads
  const { data: userStats, refetch: refetchStats } = useReadContract({
    address: DAILY_REWARDS_CONTRACT,
    abi: DAILY_REWARDS_ABI,
    functionName: "getUserStats",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000",
    }
  });

  const { data: dailyTasks, refetch: refetchTasks } = useReadContract({
    address: DAILY_REWARDS_CONTRACT,
    abi: DAILY_REWARDS_ABI,
    functionName: "getUserDailyTasks",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000",
    }
  });

  const { data: achievements, refetch: refetchAchievements } = useReadContract({
    address: DAILY_REWARDS_CONTRACT,
    abi: DAILY_REWARDS_ABI,
    functionName: "getUserAchievements",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000",
    }
  });

  const { data: poolStats } = useReadContract({
    address: DAILY_REWARDS_CONTRACT,
    abi: DAILY_REWARDS_ABI,
    functionName: "getPoolStats",
    query: {
      enabled: DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000",
    }
  });

  // Read baseDailyReward from contract (try both names - V2/V3 has public var, V1 has constant)
  const { data: baseDailyReward } = useReadContract({
    address: DAILY_REWARDS_CONTRACT,
    abi: [
      ...DAILY_REWARDS_ABI,
      {
        "inputs": [],
        "name": "baseDailyReward",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      }
    ],
    functionName: "baseDailyReward",
    query: {
      enabled: DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000",
    }
  });

  // Read streakBonusPerDay from contract
  const { data: streakBonusPerDay } = useReadContract({
    address: DAILY_REWARDS_CONTRACT,
    abi: [
      ...DAILY_REWARDS_ABI,
      {
        "inputs": [],
        "name": "streakBonusPerDay",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      }
    ],
    functionName: "streakBonusPerDay",
    query: {
      enabled: DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000",
    }
  });

  // Read SWIPE token balance
  const { data: swipeBalance } = useReadContract({
    address: SWIPE_TOKEN as `0x${string}`,
    abi: [
      {
        "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
      }
    ],
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Check if user has minimum balance (1M SWIPE)
  const hasMinimumBalance = swipeBalance ? swipeBalance >= MIN_SWIPE_BALANCE : false;

  // Check if user has already used a referral code
  const { data: hasUsedReferralData } = useReadContract({
    address: DAILY_REWARDS_CONTRACT,
    abi: DAILY_REWARDS_ABI,
    functionName: "hasUsedReferral",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000",
    }
  });

  const hasUsedReferral = hasUsedReferralData as boolean | undefined;

  // Check if user follows @swipeai (for showing Follow vs Claim button)
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (!address) return;
      
      // Skip if already claimed (hasFollowedSocials from contract)
      const hasClaimedFollow = achievements ? (achievements as any)[1] as boolean : false;
      if (hasClaimedFollow) {
        setIsFollowingSwipeAI(true);
        return;
      }
      
      setIsCheckingFollow(true);
      try {
        // Check follow status via API with checkOnly=true (won't mark as completed)
        const response = await fetch('/api/daily-tasks/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            taskType: 'FOLLOW_SOCIALS',
            checkOnly: true, // Just check, don't mark as completed
          }),
        });
        
        const data = await response.json();
        // If API returns success, user is following
        setIsFollowingSwipeAI(data.success === true);
      } catch (error) {
        console.error('Failed to check follow status:', error);
        setIsFollowingSwipeAI(false);
      } finally {
        setIsCheckingFollow(false);
      }
    };
    
    checkFollowStatus();
  }, [address, achievements]);

  // Check blacklist status on mount/address change
  useEffect(() => {
    const checkBlacklist = async () => {
      if (!address) {
        setIsBlacklisted(false);
        return;
      }
      
      setIsCheckingBlacklist(true);
      try {
        const response = await fetch(`/api/blacklist/check?address=${address}`);
        const data = await response.json();
        setIsBlacklisted(data.success && data.blacklisted === true);
      } catch (error) {
        console.error('Failed to check blacklist:', error);
        setIsBlacklisted(false);
      } finally {
        setIsCheckingBlacklist(false);
      }
    };
    
    checkBlacklist();
  }, [address]);

  // Auto-fill referral code from URL parameter ?ref=
  useEffect(() => {
    if (!hasUsedReferral && searchParams) {
      const refParam = searchParams.get('ref');
      if (refParam && refParam.startsWith('0x') && refParam.length === 42) {
        // Validate it's a valid address and not the user's own address
        if (address && refParam.toLowerCase() !== address.toLowerCase()) {
          setReferralCode(refParam);
          console.log('📋 Auto-filled referral code from URL:', refParam);
        }
      }
    }
  }, [searchParams, hasUsedReferral, address]);

  // Manual check for beta tester eligibility (called by button click)
  const handleCheckBetaTesterEligibility = async () => {
    if (!address) return;

    // Skip if already claimed (isBetaTester from contract)
    const hasClaimedBetaTester = achievements ? (achievements as any)[0] as boolean : false;
    if (hasClaimedBetaTester) {
      setIsBetaTesterEligible(false); // Already claimed, no need to check
      return;
    }

    setIsCheckingBetaTester(true);
    try {
      // Call our API to check beta tester eligibility (POST with body, not GET with query)
      const response = await fetch('/api/daily-tasks/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          taskType: 'BETA_TESTER',
          checkOnly: true, // Just check, don't mark as completed
        }),
      });
      const data = await response.json();

      if (data.success) {
        setIsBetaTesterEligible(true); // User is eligible, show highlighted button and claim
      } else {
        setIsBetaTesterEligible(false); // User is not eligible
      }
    } catch (error) {
      console.error('Error checking beta tester eligibility:', error);
      setIsBetaTesterEligible(false);
    } finally {
      setIsCheckingBetaTester(false);
    }
  };

  // Contract write
  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess, isError: isTxError } = useWaitForTransactionReceipt({
    hash,
  });
  
  // Handle transaction errors (user rejected, failed, etc.)
  useEffect(() => {
    if (writeError || isTxError) {
      // User rejected or tx failed - clear pending confirm task
      setPendingConfirmTask(null);
      setIsClaimingTask(null);
      setIsClaimLoading(false);
      
      if (writeError) {
        console.log('Transaction rejected or failed:', writeError.message);
      }
    }
  }, [writeError, isTxError]);

  // Handle successful transaction - confirm task in Redis
  useEffect(() => {
    if (isSuccess && hash) {
      setShowConfetti(true);
      
      // If we have a pending task/achievement to confirm, call /confirm endpoint
      if (pendingConfirmTask && address) {
        // Special handling for REFERRAL - clear input and show specific notification
        if (pendingConfirmTask === 'REFERRAL') {
          setReferralCode("");
          setIsVerifyingTask(null);
          sendNotification({
            title: "🎉 Referral Registered!",
            body: "You both received 10k SWIPE!",
          });
        } else {
          sendNotification({
            title: "🎉 Claim Successful!",
            body: `You received your SWIPE rewards!`,
          });
        }
        
        // Confirm task/achievement in Redis AFTER transaction is confirmed on blockchain
        const confirmTask = async () => {
          try {
            await fetch('/api/daily-tasks/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                address,
                taskType: pendingConfirmTask,
                txHash: hash,
              }),
            });
            console.log(`✅ Task ${pendingConfirmTask} confirmed in Redis with tx ${hash}`);
            
            // Send Farcaster notification about completed daily task (async, don't block)
            getUserFid().then(async (userFid) => {
              if (userFid && pendingConfirmTask !== 'REFERRAL') {
                try {
                  // Get reward amount from userStats (approximate)
                  const rewardAmount = "10k"; // Default, you can make this dynamic based on task type
                  await notifyDailyTaskCompleted(userFid, rewardAmount);
                  console.log('✅ Farcaster notification sent for daily task completion');
                } catch (notifyError) {
                  console.error('Failed to send Farcaster notification for daily task:', notifyError);
                  // Don't fail the whole operation if notification fails
                }
              }
            }).catch((error) => {
              console.error('Failed to get user FID for daily task notification:', error);
            });
            
            // Only refetch data AFTER confirmation in Redis is successful
            // This ensures achievement is marked as completed only after full confirmation
            refetchStats();
            refetchTasks();
            refetchAchievements();
            
            // Reset states after successful confirmation
            setPendingConfirmTask(null);
            setIsClaimingTask(null);
          } catch (error) {
            console.error('Failed to confirm task in Redis:', error);
            // Still refetch to update from blockchain, but achievement is already on blockchain
            refetchStats();
            refetchTasks();
            refetchAchievements();
            // Clear states after refetch (achievement is already on blockchain)
            setPendingConfirmTask(null);
            setIsClaimingTask(null);
          }
        };
        confirmTask();
      } else if (isMigrating) {
        // Migration successful
        sendNotification({
          title: "✅ Migration Successful!",
          body: "Your data has been migrated from V1 to V2!",
        });
        
        setIsMigrating(false);
        // Refetch data to update isMigrated status
        refetchStats();
        refetchTasks();
        refetchAchievements();
      } else {
        // Daily claim (claimDaily) - no Redis confirmation needed, just refetch
        sendNotification({
          title: "🎉 Claim Successful!",
          body: `You received your SWIPE rewards!`,
        });
        
        // Send Farcaster notification about daily claim (async, don't block UI)
        getUserFid().then(async (userFid) => {
          if (userFid) {
            try {
              // Get reward amount from userStats (approximate based on streak)
              const rewardAmount = "50k+"; // Default, can be dynamic based on actual reward
              await notifyDailyTaskCompleted(userFid, rewardAmount);
              console.log('✅ Farcaster notification sent for daily claim');
            } catch (notifyError) {
              console.error('Failed to send Farcaster notification for daily claim:', notifyError);
              // Don't fail the whole operation if notification fails
            }
          }
        }).catch((error) => {
          console.error('Failed to get user FID for daily claim notification:', error);
        });
        
        // Refetch data immediately for daily claim
        refetchStats();
        refetchTasks();
        refetchAchievements();
      }
      
      // Hide confetti after animation
      setTimeout(() => setShowConfetti(false), 3000);
    }
  }, [isSuccess, hash, pendingConfirmTask, address, sendNotification, refetchStats, refetchTasks, refetchAchievements]);

  // Countdown timer
  useEffect(() => {
    if (!userStats || (userStats as any)[5]) { // canClaimToday
      setCountdown("");
      return;
    }

    const nextClaimTime = Number((userStats as any)[6]); // nextClaimTime
    
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = nextClaimTime - now;
      
      if (remaining <= 0) {
        setCountdown("");
        refetchStats();
        return;
      }
      
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      
      setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [userStats, refetchStats]);

  // Migrate from V1 to V2
  const handleMigrate = async () => {
    if (!address) return;
    
    setIsMigrating(true);
    setTaskError(null);
    
    try {
      writeContract({
        address: DAILY_REWARDS_CONTRACT,
        abi: DAILY_REWARDS_ABI,
        functionName: "migrateFromV1",
      });
    } catch (error) {
      console.error("Migration failed:", error);
      setTaskError(error instanceof Error ? error.message : "Migration failed");
      sendNotification({
        title: "❌ Migration Failed",
        body: error instanceof Error ? error.message : "Transaction failed",
      });
      setIsMigrating(false);
    }
  };

  // Claim daily reward (with signature verification for V3)
  const handleClaim = async () => {
    if (!address || !userStats) return;
    
    // Check minimum balance requirement (1M SWIPE)
    if (!hasMinimumBalance) {
      setTaskError('Minimum 1M SWIPE required to claim daily rewards');
      sendNotification({
        title: "❌ Insufficient Balance",
        body: "You need at least 1M SWIPE to use Daily Tasks",
      });
      return;
    }
    
    setIsClaimLoading(true);
    setTaskError(null);
    
    try {
      // Step 1: Get signature from backend
      const verifyResponse = await fetch('/api/daily-claims/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
        }),
      });

      const verifyResult = await verifyResponse.json();

      if (!verifyResult.success) {
        setTaskError(verifyResult.error || 'Daily claim verification failed');
        sendNotification({
          title: "❌ Verification Failed",
          body: verifyResult.error || 'Could not verify daily claim',
        });
        setIsClaimLoading(false);
        return;
      }

      // Step 2: Call contract with signature
      writeContract({
        address: DAILY_REWARDS_CONTRACT,
        abi: DAILY_REWARDS_ABI,
        functionName: "claimDaily",
        args: [verifyResult.signature as `0x${string}`],
      });
    } catch (error) {
      console.error("Claim failed:", error);
      setTaskError(error instanceof Error ? error.message : "Transaction failed");
      sendNotification({
        title: "❌ Claim Failed",
        body: error instanceof Error ? error.message : "Transaction failed",
      });
      setIsClaimLoading(false);
    }
  };

  // Verify task (step 1 - get signature from backend)
  const handleVerifyTask = async (taskType: string, proof?: { castHash?: string }) => {
    if (!address) return;
    
    setIsVerifyingTask(taskType);
    setTaskError(null);
    
    try {
      const response = await fetch('/api/daily-tasks/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          taskType,
          proof,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setTaskError(data.error || 'Verification failed');
        sendNotification({
          title: "❌ Verification Failed",
          body: data.error || 'Could not verify task',
        });
        return;
      }

      // Task verified! Save signature for claiming
      setVerifiedTasks(prev => ({ ...prev, [taskType]: { signature: data.signature } }));
      
      sendNotification({
        title: "✅ Task Verified!",
        body: "Click 'Claim' to receive your reward!",
      });
      
      setShowCastInput(false);
      setCastUrl("");
      
    } catch (error) {
      console.error("Task verification failed:", error);
      setTaskError(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setIsVerifyingTask(null);
    }
  };

  // Claim task reward (step 2 - call contract with signature)
  const handleClaimTask = async (taskType: string) => {
    if (!address || !verifiedTasks[taskType]) return;
    
    setIsClaimingTask(taskType);
    setPendingConfirmTask(taskType); // Track which task to confirm after tx success
    
    try {
      if (DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000") {
        writeContract({
          address: DAILY_REWARDS_CONTRACT,
          abi: DAILY_REWARDS_ABI,
          functionName: "completeTask",
          args: [taskType, verifiedTasks[taskType].signature as `0x${string}`],
        });
        
        // Mark as completed locally (UI optimistic update)
        setCompletedTasksLocal(prev => ({ ...prev, [taskType]: true }));
        setVerifiedTasks(prev => {
          const updated = { ...prev };
          delete updated[taskType];
          return updated;
        });
        
        sendNotification({
          title: "🎉 Reward Claimed!",
          body: `You received your ${taskType} reward!`,
        });
      }
      
      refetchTasks();
      
    } catch (error) {
      console.error("Claim failed:", error);
      sendNotification({
        title: "❌ Claim Failed",
        body: error instanceof Error ? error.message : 'Transaction failed',
      });
    } finally {
      setIsClaimingTask(null);
    }
  };

  // Register referral (with Farcaster verification to prevent Sybil attacks)
  const handleRegisterReferral = async () => {
    if (!address || !referralCode) return;
    
    // Check minimum balance requirement (1M SWIPE)
    if (!hasMinimumBalance) {
      setTaskError('Minimum 1M SWIPE required to use referral system');
      return;
    }
    
    // Validate referral code is a valid address
    if (!referralCode.startsWith('0x') || referralCode.length !== 42) {
      setTaskError('Invalid referral code. Must be a wallet address.');
      return;
    }
    
    if (referralCode.toLowerCase() === address.toLowerCase()) {
      setTaskError('You cannot refer yourself!');
      return;
    }
    
    setIsVerifyingTask('REFERRAL');
    setTaskError(null);
    
    try {
      // Verify referral and get signature from backend
      const verifyResponse = await fetch('/api/referrals/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referred: address,
          referrer: referralCode,
        }),
      });
      
      const verifyResult = await verifyResponse.json();
      
      if (!verifyResult.success) {
        setTaskError(verifyResult.error || 'Referral verification failed');
        setIsVerifyingTask(null);
        return;
      }
      
      // Verification passed - proceed with on-chain transaction with signature
      if (DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000") {
        writeContract({
          address: DAILY_REWARDS_CONTRACT,
          abi: DAILY_REWARDS_ABI,
          functionName: "registerReferral",
          args: [
            referralCode as `0x${string}`,
            verifyResult.signature as `0x${string}`
          ],
        });
        
        setPendingConfirmTask('REFERRAL');
      }
    } catch (error) {
      console.error("Referral failed:", error);
      setTaskError(error instanceof Error ? error.message : 'Referral failed');
      setIsVerifyingTask(null);
    }
  };

  // Claim achievement (Beta Tester, Follow Socials)
  const handleClaimAchievement = async (achievementType: string) => {
    if (!address) return;
    
    setIsClaimingTask(achievementType);
    setPendingConfirmTask(achievementType); // Track which achievement to confirm after tx success
    setTaskError(null);
    
    try {
      // First verify with backend to get signature (does NOT save to Redis yet)
      const response = await fetch('/api/daily-tasks/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          taskType: achievementType,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setTaskError(data.error || 'Verification failed');
        setPendingConfirmTask(null);
        setIsClaimingTask(null);
        return;
      }

      // Now claim on-chain with signature
      // Redis will be updated after successful tx via /confirm endpoint in useEffect
      // DO NOT mark as completed here - wait for transaction confirmation
      if (DAILY_REWARDS_CONTRACT !== "0x0000000000000000000000000000000000000000") {
        writeContract({
          address: DAILY_REWARDS_CONTRACT,
          abi: DAILY_REWARDS_ABI,
          functionName: "claimAchievement",
          args: [achievementType, data.signature as `0x${string}`],
        });
        // Keep setIsClaimingTask(achievementType) and setPendingConfirmTask(achievementType) active
        // They will be cleared in useEffect when transaction is confirmed or fails
      } else {
        // Contract not deployed - clear states
        setPendingConfirmTask(null);
        setIsClaimingTask(null);
      }
      
    } catch (error) {
      console.error("Achievement claim failed:", error);
      setTaskError(error instanceof Error ? error.message : 'Claim failed');
      // Clear states on error (transaction not sent)
      setPendingConfirmTask(null);
      setIsClaimingTask(null);
    }
  };

  // Get task button state
  const getTaskState = (taskType: string): 'todo' | 'verified' | 'claimed' => {
    if (isTaskCompleted(taskType)) return 'claimed';
    if (verifiedTasks[taskType]) return 'verified';
    return 'todo';
  };

  // Check which tasks are completed (from contract or local state)
  const isTaskCompleted = (taskType: string): boolean => {
    if (completedTasksLocal[taskType]) return true;
    if (!tasks) return false;
    
    switch (taskType) {
      case 'SHARE_CAST': return tasks.shareCast;
      case 'CREATE_PREDICTION': return tasks.createPrediction;
      case 'TRADING_VOLUME': return tasks.tradingVolume;
      default: return false;
    }
  };

  // Parse user stats
  const stats = userStats ? {
    currentStreak: Number((userStats as any)[1]),
    longestStreak: Number((userStats as any)[2]),
    totalClaimed: (userStats as any)[3] as bigint,
    jackpotsWon: Number((userStats as any)[4]),
    canClaimToday: (userStats as any)[5] as boolean,
    potentialReward: (userStats as any)[7] as bigint,
    isMigrated: (userStats as any)[8] as boolean,
  } : null;

  // Parse daily tasks
  const tasks = dailyTasks ? {
    shareCast: (dailyTasks as any)[0] as boolean,
    createPrediction: (dailyTasks as any)[1] as boolean,
    tradingVolume: (dailyTasks as any)[2] as boolean,
  } : null;

  // Parse achievements  
  const achievementData = achievements ? {
    isBetaTester: (achievements as any)[0] as boolean,
    hasFollowedSocials: (achievements as any)[1] as boolean,
    hasStreak7: (achievements as any)[2] as boolean,
    hasStreak30: (achievements as any)[3] as boolean,
    referrals: Number((achievements as any)[4]),
  } : null;

  // Parse pool stats
  const pool = poolStats ? {
    poolBalance: (poolStats as any)[0] as bigint,
    distributed: (poolStats as any)[1] as bigint,
    userCount: Number((poolStats as any)[2]),
    claimCount: Number((poolStats as any)[3]),
  } : null;

  // Calculate streak fire intensity
  const getStreakFireClass = () => {
    if (!stats) return "";
    if (stats.currentStreak >= 30) return "fire-legendary";
    if (stats.currentStreak >= 15) return "fire-epic";
    if (stats.currentStreak >= 7) return "fire-hot";
    if (stats.currentStreak >= 3) return "fire-warm";
    return "";
  };

  // Contract not deployed check
  if (DAILY_REWARDS_CONTRACT === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="daily-tasks-page">
        <div className="daily-tasks-card">
          <div className="daily-tasks-header">
            <div className="daily-tasks-logo-container">
              <div className="daily-tasks-logo-wrapper">
                <Image src="/logo.png" alt="SWIPE" width={64} height={64} className="daily-tasks-logo" />
              </div>
              <h2 className="daily-tasks-title">Daily Tasks</h2>
              <p className="daily-tasks-subtitle">Coming Soon! 🚀</p>
            </div>
          </div>
          
          <div className="daily-tasks-coming-soon">
            <div className="coming-soon-icon">🎁</div>
            <h3>Daily Rewards System</h3>
            <p>Earn SWIPE tokens every day by completing tasks!</p>
            <ul className="coming-soon-features">
              <li>✨ Daily claims: 25k SWIPE + streak bonuses</li>
              <li>🎰 5% chance for 250k SWIPE jackpot</li>
              <li>📣 Share on Farcaster: +25k SWIPE</li>
              <li>🎯 Create predictions: +75k SWIPE</li>
              <li>💰 Trading volume bonus: +100k SWIPE</li>
              <li>👥 Invite friends: +10k SWIPE each</li>
              <li>🏆 Achievement badges with rewards up to 1M</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Check if user is blacklisted - show hack screen instead of app
  if (isBlacklisted && address) {
    return <HackScreen address={address} />;
  }

  if (!isConnected) {
    return (
      <div className="daily-tasks-page">
        <div className="daily-tasks-card">
          <div className="daily-tasks-header">
            <div className="daily-tasks-logo-container">
              <div className="daily-tasks-logo-wrapper">
                <Image src="/logo.png" alt="SWIPE" width={64} height={64} className="daily-tasks-logo" />
              </div>
              <h2 className="daily-tasks-title">Daily Tasks</h2>
            </div>
          </div>
          
          <div className="daily-tasks-connect">
            <div className="connect-icon">🔗</div>
            <p>Connect your wallet to start earning SWIPE rewards!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="daily-tasks-page">
      {/* Confetti Effect */}
      {showConfetti && (
        <div className="confetti-container">
          {[...Array(50)].map((_, i) => (
            <div key={i} className={`confetti confetti-${i % 6}`} style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 0.5}s`,
            }} />
          ))}
        </div>
      )}

      <div className="daily-tasks-card">
        {/* Combined Header with Logo and Streak */}
        <div className="daily-tasks-header">
          <div className="header-row">
            {/* Logo side */}
            <div className="header-logo-side">
              <div className="daily-tasks-logo-wrapper pulse-glow">
                <Image src="/logo.png" alt="SWIPE" width={56} height={56} className="daily-tasks-logo" />
                {/* Basescan badge on logo */}
                <a 
                  href={`https://basescan.org/address/${DAILY_REWARDS_CONTRACT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="logo-basescan-badge"
                  title="View Contract on Basescan"
                >
                  <Image src="/Base_square_blue.png" alt="Base" width={14} height={14} />
                </a>
              </div>
              <div className="header-titles">
                <h2 className="daily-tasks-title">Daily Tasks</h2>
                <p className="daily-tasks-subtitle">Earn SWIPE every day!</p>
              </div>
            </div>
            
            {/* Streak side */}
            <div className="header-streak-side">
              <div className={`streak-fire ${getStreakFireClass()}`}>
                <span className="fire-emoji">🔥</span>
                <span className="streak-number">{stats?.currentStreak || 0}</span>
              </div>
              <div className="streak-info">
                <span className="streak-label">Day Streak</span>
                <span className="streak-best">Best: {stats?.longestStreak || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* SWIPE Balance Display - Thin line like jackpot */}
        {address && swipeBalance !== undefined && (
          <div className="daily-tasks-balance">
            <span className="daily-tasks-balance-label">Your Balance:</span>
            <span className="daily-tasks-balance-value">
              {Math.floor(parseFloat(formatEther(swipeBalance as bigint))).toLocaleString()} SWIPE
            </span>
            {!hasMinimumBalance && (
              <span className="daily-tasks-balance-requirement">
                1M min. required
              </span>
            )}
          </div>
        )}

        {/* Migration Banner - Show if user has not migrated from V1 */}
        {stats && !stats.isMigrated && (
          <div className="migration-banner" style={{
            backgroundColor: '#FFE5B4',
            border: '2px solid #FFA500',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔄</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#8B4513' }}>
              Migrate Your Data from V1
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#654321' }}>
              Transfer your streaks and achievements to the new V2 contract
            </p>
            <button
              onClick={handleMigrate}
              disabled={isPending || isConfirming || isMigrating}
              style={{
                backgroundColor: '#FFA500',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: isPending || isConfirming || isMigrating ? 'not-allowed' : 'pointer',
                opacity: isPending || isConfirming || isMigrating ? 0.6 : 1
              }}
            >
              {isMigrating || isPending || isConfirming ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                  {' Migrating...'}
                </>
              ) : (
                'Migrate Now'
              )}
            </button>
            {taskError && (
              <p style={{ marginTop: '12px', color: '#d32f2f', fontSize: '13px' }}>
                {taskError}
              </p>
            )}
          </div>
        )}

        {/* Main Claim Section */}
        <div className="claim-section">
          <div className="claim-reward-preview">
            <span className="reward-label">Today's Reward</span>
            <span className="reward-amount">
              {stats?.potentialReward ? 
                Math.floor(parseFloat(formatEther(stats.potentialReward))).toLocaleString() : 
                "50,000"
              } SWIPE
            </span>
            <span className="reward-breakdown">
              {baseDailyReward ? Math.floor(parseFloat(formatEther(baseDailyReward)) / 1000) : 25}k base {stats?.currentStreak && stats.currentStreak > 0 ? 
                `+ ${Math.min(stats.currentStreak, 10) * (streakBonusPerDay ? Math.floor(parseFloat(formatEther(streakBonusPerDay)) / 1000) : 10)}k streak bonus` : 
                ""
              }
            </span>
          </div>

          {stats?.canClaimToday ? (
            <button 
              className="claim-button pulse-button"
              onClick={handleClaim}
              disabled={isPending || isConfirming || !hasMinimumBalance}
            >
              {isPending || isConfirming ? (
                <span className="claim-loading">
                  <span className="loading-spinner"></span>
                  Claiming...
                </span>
              ) : (
                <>
                  <span className="claim-icon">🎁</span>
                  <span>Claim Daily Reward</span>
                </>
              )}
            </button>
          ) : (
            <div className="claim-cooldown">
              <span className="cooldown-label">Next claim in</span>
              <span className="cooldown-timer">{countdown || "..."}</span>
            </div>
          )}

          <div className="jackpot-chance">
            <span className="jackpot-icon">🎰</span>
            <span>5% chance for 250,000 SWIPE jackpot!</span>
          </div>
        </div>

        {/* Daily Tasks */}
        <div className="tasks-section">
          <h3 className="section-title">
            <span>📋</span> Daily Bonus Tasks
            <span className="reset-info">Resets daily</span>
          </h3>
          
          <div className="tasks-list">
            {/* Share Cast Task */}
            <div className={`task-item ${getTaskState('SHARE_CAST') === 'claimed' ? 'completed' : getTaskState('SHARE_CAST') === 'verified' ? 'verified' : ''}`}>
              <div className="task-icon">📣</div>
              <div className="task-info">
                <span className="task-name">Share on Farcaster</span>
                <span className="task-description">Post with @swipeai mention</span>
              </div>
              <div className="task-actions">
                {getTaskState('SHARE_CAST') === 'claimed' ? (
                  <span className="task-done">✅ Done</span>
                ) : getTaskState('SHARE_CAST') === 'verified' ? (
                  <button 
                    className="task-claim-btn pulse-claim"
                    onClick={() => handleClaimTask('SHARE_CAST')}
                    disabled={isClaimingTask === 'SHARE_CAST' || !hasMinimumBalance}
                  >
                      {isClaimingTask === 'SHARE_CAST' ? '...' : '🎁 Claim 25k'}
                  </button>
                ) : showCastInput ? (
                  <div className="task-input-group">
                    <input
                      type="text"
                      placeholder="Paste Warpcast URL..."
                      value={castUrl}
                      onChange={(e) => setCastUrl(e.target.value)}
                      className="task-input"
                    />
                    <button 
                      className="task-verify-btn"
                      onClick={() => handleVerifyTask('SHARE_CAST', { castHash: castUrl })}
                      disabled={isVerifyingTask === 'SHARE_CAST' || !castUrl || !hasMinimumBalance}
                    >
                      {isVerifyingTask === 'SHARE_CAST' ? '...' : '✓'}
                    </button>
                  </div>
                ) : (
                  <div className="task-buttons">
                    <button 
                      className="task-action-btn"
                      onClick={async () => {
                        try {
                          const shareText = getRandomShareText();
                          const shareUrl = window.location.origin;
                          await composeCast({
                            text: shareText,
                            embeds: [shareUrl]
                          });
                        } catch (error) {
                          console.error('Failed to share, falling back to URL:', error);
                          // Fallback to window.open if SDK fails completely
                          const shareText = getRandomShareText();
                          const shareUrl = window.location.origin;
                          const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`;
                          window.open(warpcastUrl, '_blank');
                        }
                      }}
                    >
                      <Share2 size={14} /> Share
                    </button>
                    <button 
                      className="task-verify-btn"
                      onClick={() => setShowCastInput(true)}
                    >
                      Verify
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Create Prediction Task */}
            <div className={`task-item ${getTaskState('CREATE_PREDICTION') === 'claimed' ? 'completed' : getTaskState('CREATE_PREDICTION') === 'verified' ? 'verified' : ''}`}>
              <div className="task-icon">🎯</div>
              <div className="task-info">
                <span className="task-name">Create Prediction</span>
                <span className="task-description">Submit a new prediction today</span>
              </div>
              <div className="task-actions">
                {getTaskState('CREATE_PREDICTION') === 'claimed' ? (
                  <span className="task-done">✅ Done</span>
                ) : getTaskState('CREATE_PREDICTION') === 'verified' ? (
                    <button 
                      className="task-claim-btn pulse-claim"
                      onClick={() => handleClaimTask('CREATE_PREDICTION')}
                      disabled={isClaimingTask === 'CREATE_PREDICTION' || !hasMinimumBalance}
                    >
                      {isClaimingTask === 'CREATE_PREDICTION' ? '...' : '🎁 Claim 37.5k'}
                    </button>
                  ) : (
                    <button 
                      className="task-verify-btn"
                      onClick={() => handleVerifyTask('CREATE_PREDICTION')}
                      disabled={isVerifyingTask === 'CREATE_PREDICTION' || !hasMinimumBalance}
                    >
                    {isVerifyingTask === 'CREATE_PREDICTION' ? '...' : 'Check'}
                  </button>
                )}
              </div>
            </div>

            {/* Trading Volume Task */}
            <div className={`task-item ${getTaskState('TRADING_VOLUME') === 'claimed' ? 'completed' : getTaskState('TRADING_VOLUME') === 'verified' ? 'verified' : ''}`}>
              <div className="task-icon">💰</div>
              <div className="task-info">
                <span className="task-name">Place a Bet</span>
                <span className="task-description">Bet on any prediction today</span>
              </div>
              <div className="task-actions">
                {getTaskState('TRADING_VOLUME') === 'claimed' ? (
                  <span className="task-done">✅ Done</span>
                ) : getTaskState('TRADING_VOLUME') === 'verified' ? (
                    <button 
                      className="task-claim-btn pulse-claim"
                      onClick={() => handleClaimTask('TRADING_VOLUME')}
                      disabled={isClaimingTask === 'TRADING_VOLUME' || !hasMinimumBalance}
                    >
                      {isClaimingTask === 'TRADING_VOLUME' ? '...' : '🎁 Claim 50k'}
                    </button>
                  ) : (
                    <button 
                      className="task-verify-btn"
                      onClick={() => handleVerifyTask('TRADING_VOLUME')}
                      disabled={isVerifyingTask === 'TRADING_VOLUME' || !hasMinimumBalance}
                    >
                    {isVerifyingTask === 'TRADING_VOLUME' ? '...' : 'Check'}
                  </button>
                )}
              </div>
            </div>

            {/* Error message */}
            {taskError && (
              <div className="task-error">
                ⚠️ {taskError}
                <button className="task-error-close" onClick={() => setTaskError(null)}>✕</button>
              </div>
            )}
          </div>
        </div>

        {/* Achievements */}
        <div className="achievements-section">
          <h3 className="section-title">
            <span>🏆</span> Achievements
            <span className="reset-info">One-time rewards</span>
          </h3>
          
          <div className="achievements-grid">
            {/* Beta Tester - claimable if eligible */}
            <div className={`achievement-badge ${
              achievementData?.isBetaTester 
                ? 'unlocked' 
                : isBetaTesterEligible === false
                  ? 'locked' 
                  : 'ready-to-claim'
            }`}>
              <span className="badge-icon">🧪</span>
              <span className="badge-name">Beta Tester</span>
              <span className="badge-reward">500k SWIPE</span>

              {/* Already claimed */}
              {achievementData?.isBetaTester && <span className="achievement-done">✅</span>}

              {/* Not checked yet - show Check Eligibility button */}
              {!achievementData?.isBetaTester && isBetaTesterEligible === null && (
                <button
                  className="achievement-check-btn"
                  onClick={handleCheckBetaTesterEligibility}
                  disabled={!address || isCheckingBetaTester}
                >
                  {isCheckingBetaTester ? 'Checking...' : 'Check Eligibility'}
                </button>
              )}

              {/* Eligible but not claimed yet - show highlighted Claim button */}
              {!achievementData?.isBetaTester && isBetaTesterEligible === true && (
                <button
                  className="achievement-claim-btn pulse-claim"
                  onClick={() => handleClaimAchievement('BETA_TESTER')}
                  disabled={isClaimingTask === 'BETA_TESTER' || isPending || isConfirming || !hasMinimumBalance}
                >
                  {isClaimingTask === 'BETA_TESTER' || isPending || isConfirming ? '...' : 'Claim'}
                </button>
              )}

              {/* Not eligible (checked and failed) - show message */}
              {!achievementData?.isBetaTester && isBetaTesterEligible === false && (
                <span className="achievement-not-eligible">Not eligible</span>
              )}
            </div>

            {/* Follow Socials - claimable */}
            <div className={`achievement-badge ${achievementData?.hasFollowedSocials ? 'unlocked' : isFollowingSwipeAI ? 'ready-to-claim' : 'locked'}`}>
              <span className="badge-icon">👥</span>
              <span className="badge-name">Follow @swipeai</span>
              <span className="badge-reward">100k SWIPE</span>
              
              {/* Already claimed */}
              {achievementData?.hasFollowedSocials && <span className="achievement-done">✅</span>}
              
              {/* Following but not claimed yet - show Claim button */}
              {!achievementData?.hasFollowedSocials && isFollowingSwipeAI && (
                <button 
                  className="achievement-claim-btn pulse-claim"
                  onClick={() => handleClaimAchievement('FOLLOW_SOCIALS')}
                  disabled={isClaimingTask === 'FOLLOW_SOCIALS' || isPending || isConfirming}
                >
                  {isClaimingTask === 'FOLLOW_SOCIALS' || isPending || isConfirming ? '...' : 'Claim'}
                </button>
              )}
              
              {/* Not following yet - show Follow button */}
              {!achievementData?.hasFollowedSocials && !isFollowingSwipeAI && (
                <button 
                  className="achievement-follow-btn"
                  onClick={() => openUrl('https://warpcast.com/swipeai')}
                >
                  {isCheckingFollow ? '...' : 'Follow'}
                </button>
              )}
            </div>

            {/* 7-Day Streak - automatic */}
            <div className={`achievement-badge ${achievementData?.hasStreak7 ? 'unlocked' : 'locked'}`}>
              <span className="badge-icon">📅</span>
              <span className="badge-name">7-Day Streak</span>
              <span className="badge-reward">250k SWIPE</span>
              {achievementData?.hasStreak7 ? (
                <span className="achievement-done">✅</span>
              ) : (
                <span className="achievement-progress">{stats?.currentStreak || 0}/7 days</span>
              )}
            </div>

            {/* 30-Day Streak - automatic */}
            <div className={`achievement-badge ${achievementData?.hasStreak30 ? 'unlocked' : 'locked'}`}>
              <span className="badge-icon">👑</span>
              <span className="badge-name">30-Day Legend</span>
              <span className="badge-reward">1M SWIPE</span>
              {achievementData?.hasStreak30 ? (
                <span className="achievement-done">✅</span>
              ) : (
                <span className="achievement-progress">{stats?.currentStreak || 0}/30 days</span>
              )}
            </div>
          </div>
        </div>

        {/* Referral Section */}
        <div className="referral-section">
          <h3 className="section-title">
            <span>🤝</span> Invite Friends
          </h3>
          
          <div className="referral-info">
            <p>Share your referral link and both get <strong>10,000 SWIPE</strong>!</p>
            
            <div className="referral-stats">
              <span className="referral-count">{achievementData?.referrals || 0}</span>
              <span className="referral-label">friends invited</span>
            </div>
            
            <button 
              className="referral-button"
              onClick={() => {
                const link = `${window.location.origin}?ref=${address}`;
                navigator.clipboard.writeText(link);
                sendNotification({
                  title: "📋 Copied!",
                  body: "Referral link copied to clipboard",
                });
              }}
            >
              📋 Copy Referral Link
            </button>
            
            {hasUsedReferral ? (
              <div className="referral-used-message">
                ✅ You've already used a referral code
              </div>
            ) : (
              <>
                <div className="referral-divider">
                  <span>or enter a friend's code</span>
                </div>
                
                <div className="referral-input-group">
                  <input
                    type="text"
                    placeholder="Paste friend's wallet address..."
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    className="referral-input"
                  />
                  <button 
                    className="referral-submit-btn"
                    onClick={handleRegisterReferral}
                    disabled={!referralCode || isVerifyingTask === 'REFERRAL' || !hasMinimumBalance}
                  >
                    {isVerifyingTask === 'REFERRAL' ? '...' : '🎁 Claim'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stats Footer */}
        <div className="stats-footer">
          <div className="stat-item">
            <span className="stat-value">
              {stats?.totalClaimed ? 
                Math.floor(parseFloat(formatEther(stats.totalClaimed))).toLocaleString() : 
                "0"
              }
            </span>
            <span className="stat-label">Total Earned</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-value">{stats?.jackpotsWon || 0}</span>
            <span className="stat-label">Jackpots Won</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-value">{pool?.userCount?.toLocaleString() || "0"}</span>
            <span className="stat-label">Total Users</span>
          </div>
        </div>

        {/* Pool Info */}
        {pool && (
          <div className="pool-info">
            <div className="pool-bar">
              <div 
                className="pool-bar-fill"
                style={{ 
                  width: `${Math.min(100, (Number(formatEther(pool.distributed)) / 250000000) * 100)}%` 
                }}
              ></div>
            </div>
            <div className="pool-stats">
              <span>
                {Math.floor(parseFloat(formatEther(pool.poolBalance))).toLocaleString()} SWIPE remaining
              </span>
              <span>
                {pool.claimCount.toLocaleString()} total claims
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

