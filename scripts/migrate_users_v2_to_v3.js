const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Migrate users from V2 to V3 contract
 * 
 * Usage:
 *   npx hardhat run scripts/migrate_users_v2_to_v3.js --network base
 */

async function main() {
  console.log("\n🔄 Migrating Users from V2 to V3...\n");

  // Contract addresses
  const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT || 
                               process.env.DAILY_REWARDS_V2_CONTRACT || 
                               "0xb545c176b980B5dbfBc4af3F4f1d978b5F17aCF0";
  const V3_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT || 
                              process.env.DAILY_REWARDS_V3_CONTRACT || 
                              "0x363fB0b68a6a2657daAE93bcfEe8fC1D472391fE"; // Default V3 address
  
  if (!V3_CONTRACT_ADDRESS || V3_CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("❌ Error: V3 contract address must be set!");
    console.log("   Set NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT or DAILY_REWARDS_V3_CONTRACT env var");
    process.exit(1);
  }

  console.log("V2 Contract:", V2_CONTRACT_ADDRESS);
  console.log("V3 Contract:", V3_CONTRACT_ADDRESS);
  console.log("");

  // Get contracts
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("");

  // Load users from env var or file
  let usersToMigrate = [];
  
  // Try environment variable first
  if (process.env.USERS_TO_MIGRATE) {
    usersToMigrate = process.env.USERS_TO_MIGRATE.split(',').map(addr => addr.trim()).filter(addr => addr.startsWith('0x'));
    console.log(`📋 Loaded ${usersToMigrate.length} users from USERS_TO_MIGRATE env var`);
  } else {
    // Try to load from v2_users_from_events.txt (from V2 contract events)
    const eventsFile = path.join(__dirname, '..', 'v2_users_from_events.txt');
    if (fs.existsSync(eventsFile)) {
      const fileContent = fs.readFileSync(eventsFile, 'utf-8');
      const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line && line.startsWith('0x'));
      usersToMigrate = lines;
      console.log(`📋 Loaded ${usersToMigrate.length} users from ${path.basename(eventsFile)} (from V2 contract events)`);
    } else {
      // Fallback to all_betting_users.txt (users already migrated from V1 to V2)
      const usersFile = path.join(__dirname, '..', 'all_betting_users.txt');
      if (fs.existsSync(usersFile)) {
        const fileContent = fs.readFileSync(usersFile, 'utf-8');
        const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line && line.startsWith('0x'));
        usersToMigrate = lines;
        console.log(`📋 Loaded ${usersToMigrate.length} users from ${path.basename(usersFile)} (users already in V2)`);
      }
    }
  }

  if (usersToMigrate.length === 0) {
    console.log("ℹ️  No users specified. Options:");
    console.log("   1. Set USERS_TO_MIGRATE env var:");
    console.log('      USERS_TO_MIGRATE="0x123...,0x456..." npx hardhat run scripts/migrate_users_v2_to_v3.js --network base');
    console.log("   2. Extract users from V2 contract events:");
    console.log("      (Use scripts/get_users_from_v2_contract.js - similar to V1 script)");
    console.log("   3. Place addresses in v2_users_from_events.txt (one per line)");
    console.log("   4. Call batchMigrateFromV2 directly from your wallet:");
    console.log(`      V3Contract.batchMigrateFromV2([address1, address2, ...])`);
    process.exit(0);
  }

  // Remove duplicates
  usersToMigrate = [...new Set(usersToMigrate)];
  console.log(`📋 Total unique users to migrate: ${usersToMigrate.length}`);

  // Remove blacklisted addresses
  const blacklistFile = path.join(__dirname, '..', 'blacklist.txt');
  if (fs.existsSync(blacklistFile)) {
    console.log("");
    console.log("🚫 Removing blacklisted addresses...");
    const blacklistContent = fs.readFileSync(blacklistFile, 'utf-8');
    const blacklistedAddrs = blacklistContent.split('\n')
      .map(line => line.trim().toLowerCase())
      .filter(line => line && line.startsWith('0x'));
    
    const beforeBlacklist = usersToMigrate.length;
    usersToMigrate = usersToMigrate.filter(addr => !blacklistedAddrs.includes(addr.toLowerCase()));
    const removed = beforeBlacklist - usersToMigrate.length;
    
    console.log(`  Removed ${removed} blacklisted address(es)`);
    console.log(`  Remaining: ${usersToMigrate.length} users`);
  }

  console.log("");

  // Get V3 contract
  const SwipeDailyRewards_V3 = await hre.ethers.getContractAt(
    "SwipeDailyRewards_V3",
    V3_CONTRACT_ADDRESS
  );

  // Check migration enabled
  const migrationEnabled = await SwipeDailyRewards_V3.migrationEnabled();
  if (!migrationEnabled) {
    console.error("❌ Migration is disabled on V3 contract!");
    console.log("   Enable it with: V3Contract.setMigrationEnabled(true)");
    process.exit(1);
  }

  console.log("✅ Migration is enabled on V3 contract");
  console.log("");

  // Optional: Verify users exist in V2 before migrating
  const VERIFY_V2 = process.env.VERIFY_V2 === "true";
  if (VERIFY_V2) {
    console.log("🔍 Verifying users exist in V2 contract...");
    const V2_ABI = [
      "function users(address) view returns (uint256 lastClaimTimestamp, uint256 currentStreak, uint256 longestStreak, uint256 totalClaimed, uint256 lastTaskResetDay, uint256 jackpotsWon, bool isBetaTester, bool hasFollowedSocials, bool hasStreak7Achievement, bool hasStreak30Achievement, bool migrated)"
    ];
    const v2Contract = new hre.ethers.Contract(V2_CONTRACT_ADDRESS, V2_ABI, hre.ethers.provider);
    
    const verifiedUsers = [];
    for (let i = 0; i < usersToMigrate.length; i++) {
      const addr = usersToMigrate[i];
      try {
        const userData = await v2Contract.users(addr);
        if (userData.lastClaimTimestamp > 0 || userData.migrated) {
          verifiedUsers.push(addr);
        }
      } catch (error) {
        // Skip if error
      }
      if ((i + 1) % 50 === 0) {
        console.log(`  Checked ${i + 1}/${usersToMigrate.length} users...`);
      }
    }
    usersToMigrate = verifiedUsers;
    console.log(`✅ Verified: ${usersToMigrate.length} users exist in V2`);
    console.log("");
  }

  // Batch size (to avoid gas limit issues)
  const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "50");
  const START_FROM_BATCH = parseInt(process.env.START_FROM_BATCH || "1"); // Start from specific batch (1-based)
  console.log(`📦 Batch size: ${BATCH_SIZE} users per transaction`);
  if (START_FROM_BATCH > 1) {
    console.log(`⏩ Starting from batch ${START_FROM_BATCH} (skipping first ${START_FROM_BATCH - 1} batches)`);
  }
  console.log("");

  // Process in batches
  let totalMigrated = 0;
  let totalSkipped = 0;
  const batches = [];
  
  for (let i = 0; i < usersToMigrate.length; i += BATCH_SIZE) {
    batches.push(usersToMigrate.slice(i, i + BATCH_SIZE));
  }

  console.log(`🔄 Processing ${batches.length} batch(es)...`);
  if (START_FROM_BATCH > 1) {
    console.log(`⏩ Skipping first ${START_FROM_BATCH - 1} batch(es), starting from batch ${START_FROM_BATCH}`);
  }
  console.log("");

  // Start from specific batch (0-based index)
  const startIndex = Math.max(0, START_FROM_BATCH - 1);
  for (let batchIndex = startIndex; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`\n📦 Batch ${batchIndex + 1}/${batches.length} (${batch.length} users)`);
    console.log("=".repeat(60));

    try {
      const tx = await SwipeDailyRewards_V3.batchMigrateFromV2(batch);
      console.log("  Transaction sent:", tx.hash);
      console.log("  Waiting for confirmation...");
      
      const receipt = await tx.wait();
      
      console.log("  ✅ Batch migrated!");
      console.log("  Gas used:", receipt.gasUsed.toString());
      console.log("  Block:", receipt.blockNumber);
      
      totalMigrated += batch.length;
      
      // Small delay between batches to avoid rate limiting
      if (batchIndex < batches.length - 1) {
        console.log("  ⏳ Waiting 2 seconds before next batch...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`  ❌ Batch ${batchIndex + 1} failed:`, error.message);
      if (error.reason) {
        console.error("  Reason:", error.reason);
      }
      console.log("  ⚠️  Continuing with next batch...");
      totalSkipped += batch.length;
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("📊 Migration Summary:");
  console.log(`  ✅ Successfully migrated: ${totalMigrated} users`);
  if (totalSkipped > 0) {
    console.log(`  ⚠️  Skipped/Failed: ${totalSkipped} users`);
  }
  console.log("=".repeat(60));
  
  // Optional: Verify some migrated users
  if (usersToMigrate.length <= 10) {
    console.log("");
    console.log("📊 Verifying migrations...");
    for (const userAddr of usersToMigrate.slice(0, 10)) {
      try {
        const userData = await SwipeDailyRewards_V3.users(userAddr);
        if (userData.migrated) {
          console.log(`  ✅ ${userAddr} - streak: ${userData.currentStreak}`);
        } else {
          console.log(`  ⚠️  ${userAddr} - not migrated (may not exist in V2)`);
        }
      } catch (error) {
        console.log(`  ❌ ${userAddr} - error: ${error.message}`);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
