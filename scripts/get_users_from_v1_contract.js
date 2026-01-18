const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Extract all user addresses from V1 contract by reading events
 * 
 * Usage:
 *   npx hardhat run scripts/get_users_from_v1_contract.js --network base
 */

async function main() {
  console.log("\n🔍 Extracting Users from V1 Contract Events...\n");

  const V1_CONTRACT_ADDRESS = process.env.V1_CONTRACT_ADDRESS || "0x68F12a2fE1fBA2B5bfaED1eA2d844641b95b2dF0";
  
  if (!V1_CONTRACT_ADDRESS) {
    console.error("❌ Error: V1_CONTRACT_ADDRESS must be set!");
    process.exit(1);
  }

  console.log("V1 Contract:", V1_CONTRACT_ADDRESS);
  console.log("");

  // Get V1 contract ABI (we only need the events)
  const v1Abi = [
    "event DailyClaimed(address indexed user, uint256 reward, uint256 streak, bool jackpot)",
    "event TaskCompleted(address indexed user, string taskType, uint256 reward)",
    "event AchievementUnlocked(address indexed user, string achievement, uint256 reward)",
    "event ReferralRegistered(address indexed referrer, address indexed referred, uint256 rewardEach)"
  ];

  const v1Contract = new hre.ethers.Contract(V1_CONTRACT_ADDRESS, v1Abi, hre.ethers.provider);

  // Get current block number
  const currentBlock = await hre.ethers.provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);

  // Try to get deployment block from contract creation
  // For Base, we can estimate or use a known block
  // Let's use a reasonable range - last 30 days or from block 0 if needed
  const FROM_BLOCK = process.env.FROM_BLOCK || Math.max(0, currentBlock - 1000000); // ~30 days on Base
  const TO_BLOCK = currentBlock;

  console.log(`Scanning blocks: ${FROM_BLOCK} to ${TO_BLOCK}`);
  console.log("");

  const userAddresses = new Set();

  // Get all DailyClaimed events
  console.log("📊 Scanning DailyClaimed events...");
  try {
    const dailyClaimedFilter = v1Contract.filters.DailyClaimed();
    const dailyClaimedEvents = await v1Contract.queryFilter(dailyClaimedFilter, FROM_BLOCK, TO_BLOCK);
    
    console.log(`  Found ${dailyClaimedEvents.length} DailyClaimed events`);
    for (const event of dailyClaimedEvents) {
      if (event.args && event.args.user) {
        userAddresses.add(event.args.user.toLowerCase());
      }
    }
  } catch (error) {
    console.error("  ⚠️  Error reading DailyClaimed events:", error.message);
  }

  // Get all TaskCompleted events
  console.log("📊 Scanning TaskCompleted events...");
  try {
    const taskCompletedFilter = v1Contract.filters.TaskCompleted();
    const taskCompletedEvents = await v1Contract.queryFilter(taskCompletedFilter, FROM_BLOCK, TO_BLOCK);
    
    console.log(`  Found ${taskCompletedEvents.length} TaskCompleted events`);
    for (const event of taskCompletedEvents) {
      if (event.args && event.args.user) {
        userAddresses.add(event.args.user.toLowerCase());
      }
    }
  } catch (error) {
    console.error("  ⚠️  Error reading TaskCompleted events:", error.message);
  }

  // Get all AchievementUnlocked events
  console.log("📊 Scanning AchievementUnlocked events...");
  try {
    const achievementFilter = v1Contract.filters.AchievementUnlocked();
    const achievementEvents = await v1Contract.queryFilter(achievementFilter, FROM_BLOCK, TO_BLOCK);
    
    console.log(`  Found ${achievementEvents.length} AchievementUnlocked events`);
    for (const event of achievementEvents) {
      if (event.args && event.args.user) {
        userAddresses.add(event.args.user.toLowerCase());
      }
    }
  } catch (error) {
    console.error("  ⚠️  Error reading AchievementUnlocked events:", error.message);
  }

  // Get all ReferralRegistered events (both referrer and referred)
  console.log("📊 Scanning ReferralRegistered events...");
  try {
    const referralFilter = v1Contract.filters.ReferralRegistered();
    const referralEvents = await v1Contract.queryFilter(referralFilter, FROM_BLOCK, TO_BLOCK);
    
    console.log(`  Found ${referralEvents.length} ReferralRegistered events`);
    for (const event of referralEvents) {
      if (event.args) {
        if (event.args.referrer) {
          userAddresses.add(event.args.referrer.toLowerCase());
        }
        if (event.args.referred) {
          userAddresses.add(event.args.referred.toLowerCase());
        }
      }
    }
  } catch (error) {
    console.error("  ⚠️  Error reading ReferralRegistered events:", error.message);
  }

  // Convert to array and sort
  let usersArray = Array.from(userAddresses).sort();
  
  console.log("");
  console.log("=".repeat(60));
  console.log(`✅ Found ${usersArray.length} unique user addresses from events`);
  console.log("=".repeat(60));

  // Filter users based on criteria
  const FILTER_USERS = process.env.FILTER_USERS !== "false"; // Default: true
  if (FILTER_USERS) {
    console.log("");
    console.log("🔍 Filtering users based on criteria...");
    
    // Filter criteria (from environment variables)
    const MIN_STREAK = parseInt(process.env.MIN_STREAK || "0"); // Default: 0 (any streak)
    const MIN_TOTAL_CLAIMED = hre.ethers.parseEther(process.env.MIN_TOTAL_CLAIMED || "0"); // Default: 0
    const REQUIRE_ACHIEVEMENTS = process.env.REQUIRE_ACHIEVEMENTS === "true"; // Default: false
    const EXCLUDE_REFERRAL_ONLY = process.env.EXCLUDE_REFERRAL_ONLY === "true"; // Default: false
    const MIN_CLAIMS_ESTIMATE = parseInt(process.env.MIN_CLAIMS || "0"); // Estimate based on totalClaimed

    console.log(`  Filters:`);
    console.log(`    - Min streak: ${MIN_STREAK}`);
    console.log(`    - Min total claimed: ${hre.ethers.formatEther(MIN_TOTAL_CLAIMED)} SWIPE`);
    if (MIN_CLAIMS_ESTIMATE > 0) {
      console.log(`    - Min estimated claims: ${MIN_CLAIMS_ESTIMATE}`);
    }
    console.log(`    - Require achievements: ${REQUIRE_ACHIEVEMENTS}`);
    console.log(`    - Exclude referral-only users: ${EXCLUDE_REFERRAL_ONLY}`);
    console.log("");

    // Get V1 contract ABI for reading user data
    const v1DataAbi = [
      "function users(address) view returns (uint256 lastClaimTimestamp, uint256 currentStreak, uint256 longestStreak, uint256 totalClaimed, uint256 lastTaskResetDay, uint256 jackpotsWon, bool isBetaTester, bool hasFollowedSocials, bool hasStreak7Achievement, bool hasStreak30Achievement)",
      "function referredBy(address) view returns (address)"
    ];
    const v1DataContract = new hre.ethers.Contract(V1_CONTRACT_ADDRESS, v1DataAbi, hre.ethers.provider);

    const filteredUsers = [];
    let checked = 0;

    for (const addr of usersArray) {
      try {
        const userData = await v1DataContract.users(addr);
        
        // Check if user exists (has lastClaimTimestamp)
        if (userData.lastClaimTimestamp === 0n) {
          continue;
        }

        // Check streak
        if (userData.longestStreak < MIN_STREAK) {
          continue;
        }

        // Check total claimed
        if (userData.totalClaimed < MIN_TOTAL_CLAIMED) {
          continue;
        }

        // Estimate claims (rough estimate: totalClaimed / 60000 = approximate claims)
        // Base reward is ~50k, plus streak bonuses, so average is around 60k-100k per claim
        if (MIN_CLAIMS_ESTIMATE > 0) {
          const estimatedClaims = Number(userData.totalClaimed) / (60_000 * 10**18);
          if (estimatedClaims < MIN_CLAIMS_ESTIMATE) {
            continue;
          }
        }

        // Check achievements
        if (REQUIRE_ACHIEVEMENTS) {
          const hasAnyAchievement = userData.isBetaTester || 
                                   userData.hasFollowedSocials || 
                                   userData.hasStreak7Achievement || 
                                   userData.hasStreak30Achievement;
          if (!hasAnyAchievement) {
            continue;
          }
        }

        // Check if referral-only (has referral but no real activity)
        if (EXCLUDE_REFERRAL_ONLY) {
          const referrer = await v1DataContract.referredBy(addr);
          if (referrer && referrer !== "0x0000000000000000000000000000000000000000") {
            // If user has referral but very low totalClaimed (just referral bonus), exclude
            // Referral bonus is 150k, so if totalClaimed is around that, might be referral-only
            const referralOnlyThreshold = 200_000 * 10**18; // 200k SWIPE
            if (userData.totalClaimed < referralOnlyThreshold && userData.longestStreak <= 1) {
              continue;
            }
          }
        }

        filteredUsers.push(addr);
      } catch (error) {
        // Skip on error
      }

      checked++;
      if (checked % 50 === 0) {
        console.log(`  Checked ${checked}/${usersArray.length} users... (${filteredUsers.length} passed)`);
      }
    }

    usersArray = filteredUsers;
    console.log("");
    console.log(`✅ After filtering: ${usersArray.length} users passed all criteria`);
  }

  // Remove blacklisted addresses
  const blacklistFile = path.join(__dirname, '..', 'blacklist.txt');
  if (fs.existsSync(blacklistFile)) {
    console.log("");
    console.log("🚫 Removing blacklisted addresses...");
    const blacklistContent = fs.readFileSync(blacklistFile, 'utf-8');
    const blacklistedAddrs = blacklistContent.split('\n')
      .map(line => line.trim().toLowerCase())
      .filter(line => line && line.startsWith('0x'));
    
    const beforeBlacklist = usersArray.length;
    usersArray = usersArray.filter(addr => !blacklistedAddrs.includes(addr.toLowerCase()));
    const removed = beforeBlacklist - usersArray.length;
    
    console.log(`  Removed ${removed} blacklisted address(es)`);
    console.log(`  Remaining: ${usersArray.length} users`);
  }

  // Save to file
  const outputFile = path.join(__dirname, '..', 'v1_users_from_events.txt');
  const outputContent = usersArray.join('\n');
  fs.writeFileSync(outputFile, outputContent, 'utf-8');
  
  console.log(`\n💾 Saved to: ${path.basename(outputFile)}`);
  console.log(`\n📋 First 10 addresses:`);
  usersArray.slice(0, 10).forEach((addr, i) => {
    console.log(`  ${i + 1}. ${addr}`);
  });
  
  if (usersArray.length > 10) {
    console.log(`  ... and ${usersArray.length - 10} more`);
  }

  console.log("");
  console.log("💡 To migrate these users, run:");
  console.log(`   npx hardhat run scripts/migrate_users_v1_to_v2.js --network base`);
  console.log("");
  console.log("📋 Filtering options (set as env vars):");
  console.log("   MIN_STREAK=2          - Minimum longest streak (default: 0)");
  console.log("   MIN_TOTAL_CLAIMED=500000 - Min total claimed in SWIPE (default: 0)");
  console.log("   MIN_CLAIMS=3          - Minimum estimated claims (default: 0)");
  console.log("   REQUIRE_ACHIEVEMENTS=true - Must have at least one achievement");
  console.log("   EXCLUDE_REFERRAL_ONLY=true - Exclude users who only used referral");
  console.log("   FILTER_USERS=false    - Disable filtering (migrate all)");
  console.log("");
  console.log("   Example:");
  console.log('   $env:MIN_STREAK="2"; $env:MIN_CLAIMS="3"; npx hardhat run scripts/get_users_from_v1_contract.js --network base');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });