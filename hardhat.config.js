require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ethers");

// This project keeps its secrets in .env.local (the Next.js convention, and what
// `vercel env pull` writes). Load it first: dotenv does not overwrite variables
// that are already set, so .env.local wins and .env stays a fallback.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // Enable IR-based compilation to prevent stack too deep errors
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    // Robinhood Chain — Arbitrum Orbit (Nitro, ArbOS 61), native gas token is ETH
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 46630,
    },
    robinhood: {
      url: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 4663,
    },
  },
  etherscan: {
    // Per-network keys. A bare string here makes hardhat-verify treat every chain
    // as Etherscan V2 and ignore customChains, which breaks Blockscout networks.
    apiKey: {
      base: process.env.ETHERSCAN_API_V2_KEY || process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY,
      baseSepolia: process.env.ETHERSCAN_API_V2_KEY || process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY,
      sepolia: process.env.ETHERSCAN_API_V2_KEY || process.env.ETHERSCAN_API_KEY,
      // Blockscout ignores the value but requires a non-empty string
      robinhoodTestnet: "blockscout",
      robinhood: "blockscout",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          // The V2 API needs chainid on every request. With a per-network apiKey
          // object hardhat-verify still speaks V1 and will not add it, so it is
          // pinned in the URL. Without this, verify fails with
          // "Missing chainid parameter (required for v2 api)".
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://basescan.org"
        }
      },
      // Robinhood Chain uses Blockscout, not Etherscan. Blockscout accepts any
      // non-empty API key, so the shared apiKey above is fine.
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com"
        }
      },
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com"
        }
      }
    ]
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
};
