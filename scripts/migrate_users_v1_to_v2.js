const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Migrate users from V1 to V2 contract
 * 
 * Usage:
 *   # From environment variable:
 *   USERS_TO_MIGRATE="0x123...,0x456..." npx hardhat run scripts/migrate_users_v1_to_v2.js --network base
 *   
 *   # From file (one address per line, skips first line if it's a header):
 *   npx hardhat run scripts/migrate_users_v1_to_v2.js --network base
 */

async function main() {
  // Check target contract version first (before printing message)
  const V3_CONTRACT_CHECK = process.env.NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT || 
                             process.env.DAILY_REWARDS_V3_CONTRACT || 
                             "0x363fB0b68a6a2657daAE93bcfEe8fC1D472391fE";
  const V2_CONTRACT_CHECK = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT || 
                             process.env.DAILY_REWARDS_V2_CONTRACT || 
                             "0xb545c176b980B5dbfBc4af3F4f1d978b5F17aCF0";
  const TARGET_CHECK = (V3_CONTRACT_CHECK && V3_CONTRACT_CHECK !== "0x0000000000000000000000000000000000000000") 
                       ? V3_CONTRACT_CHECK : V2_CONTRACT_CHECK;
  const VERSION_CHECK = (TARGET_CHECK === V3_CONTRACT_CHECK) ? "V3" : "V2";
  
  console.log(`\n🔄 Migrating Users from V1 to ${VERSION_CHECK}...\n`);

  // Contract addresses
  const V1_CONTRACT_ADDRESS = process.env.V1_CONTRACT_ADDRESS || "0x68F12a2fE1fBA2B5bfaED1eA2d844641b95b2dF0";
  // Use V3 if available, fallback to V2
  // Check both NEXT_PUBLIC_ (for frontend) and regular env var
  const V3_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT || 
                               process.env.DAILY_REWARDS_V3_CONTRACT || 
                               "0x363fB0b68a6a2657daAE93bcfEe8fC1D472391fE"; // Default V3 address
  const V2_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_DAILY_REWARDS_V2_CONTRACT || 
                               process.env.DAILY_REWARDS_V2_CONTRACT || 
                               "0xb545c176b980B5dbfBc4af3F4f1d978b5F17aCF0";
  
  // Use V3 if available (not empty/default), otherwise V2 (backwards compatible)
  const TARGET_CONTRACT_ADDRESS = (V3_CONTRACT_ADDRESS && V3_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") 
                                   ? V3_CONTRACT_ADDRESS 
                                   : V2_CONTRACT_ADDRESS;
  const CONTRACT_VERSION = (TARGET_CONTRACT_ADDRESS === V3_CONTRACT_ADDRESS) ? "V3" : "V2";
  
  if (!V1_CONTRACT_ADDRESS || !TARGET_CONTRACT_ADDRESS) {
    console.error("❌ Error: V1_CONTRACT_ADDRESS and target contract address must be set!");
    process.exit(1);
  }

  console.log("V1 Contract:", V1_CONTRACT_ADDRESS);
  console.log(`Target Contract (${CONTRACT_VERSION}):`, TARGET_CONTRACT_ADDRESS);
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
    // Try to load from v1_users_from_events.txt (from contract events)
    const eventsFile = path.join(__dirname, '..', 'v1_users_from_events.txt');
    if (fs.existsSync(eventsFile)) {
      const fileContent = fs.readFileSync(eventsFile, 'utf-8');
      const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line && line.startsWith('0x'));
      usersToMigrate = lines;
      console.log(`📋 Loaded ${usersToMigrate.length} users from ${path.basename(eventsFile)} (from V1 contract events)`);
    } else {
      // Fallback to all_betting_users.txt
      const usersFile = path.join(__dirname, '..', 'all_betting_users.txt');
      if (fs.existsSync(usersFile)) {
        const fileContent = fs.readFileSync(usersFile, 'utf-8');
        const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line && line.startsWith('0x'));
        usersToMigrate = lines;
        console.log(`📋 Loaded ${usersToMigrate.length} users from ${path.basename(usersFile)}`);
      }
    }
  }

  if (usersToMigrate.length === 0) {
    console.log("ℹ️  No users specified. Options:");
    console.log("   1. Set USERS_TO_MIGRATE env var:");
    console.log('      USERS_TO_MIGRATE="0x123...,0x456..." npx hardhat run scripts/migrate_users_v1_to_v2.js --network base');
    console.log("   2. Extract users from V1 contract events:");
    console.log("      npx hardhat run scripts/get_users_from_v1_contract.js --network base");
    console.log("      (Creates v1_users_from_events.txt automatically)");
    console.log("   3. Place addresses in all_betting_users.txt (one per line)");
    console.log("   4. Call batchMigrateFromV1 directly from your wallet:");
    console.log(`      TargetContract.batchMigrateFromV1([address1, address2, ...])`);
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

  // Get target contract (V3 or V2)
  const ContractName = (CONTRACT_VERSION === "V3") ? "SwipeDailyRewards_V3" : "SwipeDailyRewards_V2";
  const TargetContract = await hre.ethers.getContractAt(
    ContractName,
    TARGET_CONTRACT_ADDRESS
  );

  // Check migration enabled
  const migrationEnabled = await TargetContract.migrationEnabled();
  if (!migrationEnabled) {
    console.error(`❌ Migration is disabled on ${CONTRACT_VERSION} contract!`);
    console.log(`   Enable it with: TargetContract.setMigrationEnabled(true)`);
    process.exit(1);
  }

  console.log(`✅ Migration is enabled on ${CONTRACT_VERSION} contract`);
  console.log("");

  // Optional: Verify users exist in V1 before migrating
  const VERIFY_V1 = process.env.VERIFY_V1 === "true";
  if (VERIFY_V1) {
    console.log("🔍 Verifying users exist in V1 contract...");
    const V1_ABI = [
      "function users(address) view returns (uint256 lastClaimTimestamp, uint256 currentStreak, uint256 longestStreak, uint256 totalClaimed, uint256 lastTaskResetDay, uint256 jackpotsWon, bool isBetaTester, bool hasFollowedSocials, bool hasStreak7Achievement, bool hasStreak30Achievement)"
    ];
    const v1Contract = new hre.ethers.Contract(V1_CONTRACT_ADDRESS, V1_ABI, hre.ethers.provider);
    
    const verifiedUsers = [];
    for (let i = 0; i < usersToMigrate.length; i++) {
      const addr = usersToMigrate[i];
      try {
        const userData = await v1Contract.users(addr);
        if (userData.lastClaimTimestamp > 0) {
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
    console.log(`✅ Verified: ${usersToMigrate.length} users exist in V1`);
    console.log("");
  }

  // Batch size (to avoid gas limit issues)
  const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "50");
  console.log(`📦 Batch size: ${BATCH_SIZE} users per transaction`);
  console.log("");

  // Process in batches
  let totalMigrated = 0;
  let totalSkipped = 0;
  const batches = [];
  
  for (let i = 0; i < usersToMigrate.length; i += BATCH_SIZE) {
    batches.push(usersToMigrate.slice(i, i + BATCH_SIZE));
  }

  console.log(`🔄 Processing ${batches.length} batch(es)...`);
  console.log("");

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`\n📦 Batch ${batchIndex + 1}/${batches.length} (${batch.length} users)`);
    console.log("=".repeat(60));

    try {
      const tx = await TargetContract.batchMigrateFromV1(batch);
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
        const userData = await TargetContract.users(userAddr);
        if (userData.migrated) {
          console.log(`  ✅ ${userAddr} - streak: ${userData.currentStreak}`);
        } else {
          console.log(`  ⚠️  ${userAddr} - not migrated (may not exist in V1)`);
        }
      } catch (error) {
        console.log(`  ❌ ${userAddr} - error: ${error.message}`);
      }
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("✅ Migration Complete!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });