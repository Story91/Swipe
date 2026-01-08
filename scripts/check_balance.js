const hre = require("hardhat");

async function main() {
  const SWIPE_TOKEN = "0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9";
  const DAILY_REWARDS_CONTRACT = "0x68F12a2fE1fBA2B5bfaED1eA2d844641b95b2dF0";
  
  const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)"
  ];
  
  const token = new hre.ethers.Contract(SWIPE_TOKEN, ERC20_ABI, hre.ethers.provider);
  const balance = await token.balanceOf(DAILY_REWARDS_CONTRACT);
  
  console.log("\n📊 SwipeDailyRewards Contract Balance:");
  console.log("   ", hre.ethers.formatEther(balance), "SWIPE\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

