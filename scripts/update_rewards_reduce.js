const hre = require("hardhat");

/**
 * Reduce rewards in SwipeDailyRewards contract
 * - Base daily and task rewards: reduce by 50%
 * - Referral reward: set to 10,000 SWIPE
 * 
 * Supports V2 and V3 contracts
 * 
 * Usage:
 *   npx hardhat run scripts/update_rewards_reduce.js --network base
 */

async function main() {
  console.log("\n💰 Updating Contract Rewards...\n");

  // Try V3 first, then V2
  const V3_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT || process.env.DAILY_REWARDS_V3_CONTRACT;
  const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT || process.env.DAILY_REWARDS_V2_CONTRACT || "0xb545c176b980B5dbfBc4af3F4f1d978b5F17aCF0";
  
  let contractAddress;
  let contractVersion;
  let contract;

  // Try V3 first
  if (V3_CONTRACT_ADDRESS && V3_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    try {
      contract = await hre.ethers.getContractAt("SwipeDailyRewards_V3", V3_CONTRACT_ADDRESS);
      contractAddress = V3_CONTRACT_ADDRESS;
      contractVersion = "V3";
      console.log("✅ Using V3 Contract");
    } catch (error) {
      console.log("⚠️  V3 contract not found, trying V2...");
    }
  }

  // Fallback to V2
  if (!contract) {
    contract = await hre.ethers.getContractAt("SwipeDailyRewards_V2", V2_CONTRACT_ADDRESS);
    contractAddress = V2_CONTRACT_ADDRESS;
    contractVersion = "V2";
    console.log("✅ Using V2 Contract");
  }

  console.log("Contract Address:", contractAddress);
  console.log("Contract Version:", contractVersion);
  console.log("");

  try {
    // Read current values
    console.log("📊 Current Reward Values:");
    console.log("=".repeat(70));
    
    const current = {
      baseDailyReward: await contract.baseDailyReward(),
      streakBonusPerDay: await contract.streakBonusPerDay(),
      shareCastReward: await contract.shareCastReward(),
      createPredictionReward: await contract.createPredictionReward(),
      tradingVolumeReward: await contract.tradingVolumeReward(),
      referralReward: await contract.referralReward(),
    };

    console.log("  Base Daily Reward:", hre.ethers.formatEther(current.baseDailyReward), "SWIPE");
    console.log("  Streak Bonus/Day:", hre.ethers.formatEther(current.streakBonusPerDay), "SWIPE");
    console.log("  Share Cast:", hre.ethers.formatEther(current.shareCastReward), "SWIPE");
    console.log("  Create Prediction:", hre.ethers.formatEther(current.createPredictionReward), "SWIPE");
    console.log("  Trading Volume:", hre.ethers.formatEther(current.tradingVolumeReward), "SWIPE");
    console.log("  Referral:", hre.ethers.formatEther(current.referralReward), "SWIPE");
    console.log("");

    // ORIGINAL values (before any changes) - calculate from original, not current
    const ORIGINAL_VALUES = {
      baseDailyReward: hre.ethers.parseEther("50000"),    // Original: 50,000 SWIPE
      streakBonusPerDay: hre.ethers.parseEther("10000"),  // Original: 10,000 SWIPE
      shareCastReward: hre.ethers.parseEther("50000"),    // Original: 50,000 SWIPE
      createPredictionReward: hre.ethers.parseEther("75000"), // Original: 75,000 SWIPE
      tradingVolumeReward: hre.ethers.parseEther("100000"),   // Original: 100,000 SWIPE
      referralReward: hre.ethers.parseEther("50000"),     // Original: 50,000 SWIPE
    };

    // Calculate new values (50% reduction from ORIGINAL values, not current)
    // Note: streakBonusPerDay stays at 10k (not reduced)
    const newRewards = {
      baseDailyReward: ORIGINAL_VALUES.baseDailyReward / 2n,  // 50k -> 25k (50% from original)
      streakBonusPerDay: ORIGINAL_VALUES.streakBonusPerDay,   // Keep at 10k (don't reduce)
      shareCastReward: ORIGINAL_VALUES.shareCastReward / 2n,  // 50k -> 25k (50% from original)
      createPredictionReward: ORIGINAL_VALUES.createPredictionReward / 2n,  // 75k -> 37.5k (50% from original)
      tradingVolumeReward: ORIGINAL_VALUES.tradingVolumeReward / 2n,  // 100k -> 50k (50% from original)
      referralReward: hre.ethers.parseEther("10000"),  // Set to 10,000 SWIPE (from original 50k)
    };

    console.log("📋 New Reward Values (50% from original values):");
    console.log("=".repeat(70));
    console.log("  Base Daily Reward:", hre.ethers.formatEther(newRewards.baseDailyReward), "SWIPE (50k -> 25k, -50% from original)");
    console.log("  Streak Bonus/Day:", hre.ethers.formatEther(newRewards.streakBonusPerDay), "SWIPE (unchanged, stays at 10k)");
    console.log("  Share Cast:", hre.ethers.formatEther(newRewards.shareCastReward), "SWIPE (50k -> 25k, -50% from original)");
    console.log("  Create Prediction:", hre.ethers.formatEther(newRewards.createPredictionReward), "SWIPE (75k -> 37.5k, -50% from original)");
    console.log("  Trading Volume:", hre.ethers.formatEther(newRewards.tradingVolumeReward), "SWIPE (100k -> 50k, -50% from original)");
    console.log("  Referral:", hre.ethers.formatEther(newRewards.referralReward), "SWIPE (50k -> 10k)");
    console.log("");

    // Verify all values are within contract limits
    const MIN_BASE_DAILY = hre.ethers.parseEther("10000");
    const MIN_SHARE_CAST = hre.ethers.parseEther("10000");
    const MIN_CREATE_PREDICTION = hre.ethers.parseEther("10000");
    const MIN_TRADING_VOLUME = hre.ethers.parseEther("10000");
    const MIN_REFERRAL = hre.ethers.parseEther("10000");

    if (newRewards.baseDailyReward < MIN_BASE_DAILY) {
      console.error(`❌ Error: baseDailyReward ${hre.ethers.formatEther(newRewards.baseDailyReward)} is below minimum ${hre.ethers.formatEther(MIN_BASE_DAILY)}`);
      process.exit(1);
    }
    if (newRewards.shareCastReward < MIN_SHARE_CAST) {
      console.error(`❌ Error: shareCastReward ${hre.ethers.formatEther(newRewards.shareCastReward)} is below minimum ${hre.ethers.formatEther(MIN_SHARE_CAST)}`);
      process.exit(1);
    }
    if (newRewards.createPredictionReward < MIN_CREATE_PREDICTION) {
      console.error(`❌ Error: createPredictionReward ${hre.ethers.formatEther(newRewards.createPredictionReward)} is below minimum ${hre.ethers.formatEther(MIN_CREATE_PREDICTION)}`);
      process.exit(1);
    }
    if (newRewards.tradingVolumeReward < MIN_TRADING_VOLUME) {
      console.error(`❌ Error: tradingVolumeReward ${hre.ethers.formatEther(newRewards.tradingVolumeReward)} is below minimum ${hre.ethers.formatEther(MIN_TRADING_VOLUME)}`);
      process.exit(1);
    }

    console.log("✅ All new values are within contract limits");
    console.log("\n⚠️  Ready to update rewards. Press Ctrl+C to cancel, or wait 5 seconds...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Update rewards
    console.log("\n🔄 Updating rewards...\n");

    // Helper function to send transaction with increased gas price
    const sendTxWithGasPrice = async (txFunction, description) => {
      try {
        // Get current gas price and add 10% buffer
        const [signer] = await hre.ethers.getSigners();
        const feeData = await hre.ethers.provider.getFeeData();
        const gasPrice = feeData.gasPrice ? feeData.gasPrice * 110n / 100n : undefined; // +10% buffer
        
        console.log(`  ${description}...`);
        const tx = await txFunction({ gasPrice });
        console.log("    TX:", tx.hash);
        console.log("    Waiting for confirmation...");
        await tx.wait();
        console.log("    ✅ Updated");
        
        // Wait a bit before next transaction to avoid nonce issues
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      } catch (error) {
        if (error.message.includes("replacement transaction underpriced") || error.message.includes("nonce")) {
          console.log("    ⚠️  Waiting for previous transaction to confirm...");
          await new Promise(resolve => setTimeout(resolve, 5000));
          // Retry once
          try {
            const tx = await txFunction();
            console.log("    TX (retry):", tx.hash);
            await tx.wait();
            console.log("    ✅ Updated (retry successful)");
            await new Promise(resolve => setTimeout(resolve, 2000));
            return true;
          } catch (retryError) {
            throw retryError;
          }
        }
        throw error;
      }
    };

    // Update base daily reward
    if (newRewards.baseDailyReward.toString() !== current.baseDailyReward.toString()) {
      await sendTxWithGasPrice(
        (opts) => contract.setBaseDailyReward(newRewards.baseDailyReward, opts),
        "Updating baseDailyReward"
      );
    } else {
      console.log("  ⏭️  baseDailyReward already at target value");
    }

    // Update streak bonus (only if different, but should stay at 10k)
    if (newRewards.streakBonusPerDay.toString() !== current.streakBonusPerDay.toString()) {
      console.log("  Updating streakBonusPerDay...");
      const tx2 = await contract.setStreakBonusPerDay(newRewards.streakBonusPerDay);
      console.log("    TX:", tx2.hash);
      await tx2.wait();
      console.log("    ✅ Updated");
    } else {
      console.log("  ⏭️  streakBonusPerDay unchanged (stays at 10k)");
    }

    // Update share cast reward
    if (newRewards.shareCastReward.toString() !== current.shareCastReward.toString()) {
      await sendTxWithGasPrice(
        (opts) => contract.setShareCastReward(newRewards.shareCastReward, opts),
        "Updating shareCastReward"
      );
    } else {
      console.log("  ⏭️  shareCastReward already at target value");
    }

    // Update create prediction reward
    if (newRewards.createPredictionReward.toString() !== current.createPredictionReward.toString()) {
      await sendTxWithGasPrice(
        (opts) => contract.setCreatePredictionReward(newRewards.createPredictionReward, opts),
        "Updating createPredictionReward"
      );
    } else {
      console.log("  ⏭️  createPredictionReward already at target value");
    }

    // Update trading volume reward
    if (newRewards.tradingVolumeReward.toString() !== current.tradingVolumeReward.toString()) {
      await sendTxWithGasPrice(
        (opts) => contract.setTradingVolumeReward(newRewards.tradingVolumeReward, opts),
        "Updating tradingVolumeReward"
      );
    } else {
      console.log("  ⏭️  tradingVolumeReward already at target value");
    }

    // Update referral reward
    if (newRewards.referralReward.toString() !== current.referralReward.toString()) {
      await sendTxWithGasPrice(
        (opts) => contract.setReferralReward(newRewards.referralReward, opts),
        "Updating referralReward"
      );
    } else {
      console.log("  ⏭️  referralReward already at target value");
    }

    // Verify final values
    console.log("\n📊 Verifying updated values...");
    const final = {
      baseDailyReward: await contract.baseDailyReward(),
      streakBonusPerDay: await contract.streakBonusPerDay(),
      shareCastReward: await contract.shareCastReward(),
      createPredictionReward: await contract.createPredictionReward(),
      tradingVolumeReward: await contract.tradingVolumeReward(),
      referralReward: await contract.referralReward(),
    };

    console.log("\n✅ Final Reward Values:");
    console.log("=".repeat(70));
    console.log("  Base Daily Reward:", hre.ethers.formatEther(final.baseDailyReward), "SWIPE");
    console.log("  Streak Bonus/Day:", hre.ethers.formatEther(final.streakBonusPerDay), "SWIPE");
    console.log("  Share Cast:", hre.ethers.formatEther(final.shareCastReward), "SWIPE");
    console.log("  Create Prediction:", hre.ethers.formatEther(final.createPredictionReward), "SWIPE");
    console.log("  Trading Volume:", hre.ethers.formatEther(final.tradingVolumeReward), "SWIPE");
    console.log("  Referral:", hre.ethers.formatEther(final.referralReward), "SWIPE");

    console.log("\n" + "=".repeat(70));
    console.log("✅ Reward update complete!");
    console.log("=".repeat(70));

  } catch (error) {
    console.error("\n❌ Error updating rewards:", error.message);
    if (error.reason) {
      console.error("  Reason:", error.reason);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
