"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient, useReadContract, useSignTypedData } from "wagmi";
import { createFlaunch, ReadWriteFlaunchSDK } from "@flaunch/sdk";
import { parseEther, formatEther } from "viem";
import { useNotification } from "@coinbase/onchainkit/minikit";
import { SWIPE_TOKEN } from "../../../lib/contract";
import Image from "next/image";

export function SwipeTokenCard() {
  // Add CSS for range slider
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        height: 20px;
        width: 20px;
        border-radius: 50%;
        background: #d4ff00;
        cursor: pointer;
        border: 2px solid #000;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
      input[type="range"]::-moz-range-thumb {
        height: 20px;
        width: 20px;
        border-radius: 50%;
        background: #d4ff00;
        cursor: pointer;
        border: 2px solid #000;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const sendNotification = useNotification();
  
  const [isLoading, setIsLoading] = useState(false);
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | null>(null);
  const [buyAmount, setBuyAmount] = useState("0.001");
  const [buyAmountUsd, setBuyAmountUsd] = useState("");
  const [sellAmount, setSellAmount] = useState("10000");
  const [slippagePercent, setSlippagePercent] = useState(5);
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [inputMode, setInputMode] = useState<"eth" | "usd">("eth");
  
  // Signature state for Permit2
  const { data: signature, signTypedData } = useSignTypedData();
  
  // Fetch ETH price from CoinGecko
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await response.json();
        setEthPrice(data.ethereum.usd);
        setPriceLoading(false);
      } catch (error) {
        console.error('Failed to fetch ETH price:', error);
        setPriceLoading(false);
      }
    };

    fetchEthPrice();
    
    // Refresh price every 30 seconds
    const interval = setInterval(fetchEthPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  // Calculate USD value
  const calculateUsdValue = useCallback((ethAmount: string) => {
    if (!ethPrice || !ethAmount) return null;
    const usdValue = parseFloat(ethAmount) * ethPrice;
    return usdValue.toFixed(2);
  }, [ethPrice]);

  // Calculate ETH value from USD
  const calculateEthValue = useCallback((usdAmount: string) => {
    if (!ethPrice || !usdAmount) return null;
    const ethValue = parseFloat(usdAmount) / ethPrice;
    return ethValue.toFixed(6);
  }, [ethPrice]);

  // Handle ETH amount change
  const handleEthAmountChange = useCallback((value: string) => {
    setBuyAmount(value);
    if (ethPrice && value) {
      const usdValue = calculateUsdValue(value);
      setBuyAmountUsd(usdValue || "");
    } else {
      setBuyAmountUsd("");
    }
  }, [ethPrice, calculateUsdValue]);

  // Handle USD amount change
  const handleUsdAmountChange = useCallback((value: string) => {
    setBuyAmountUsd(value);
    if (ethPrice && value) {
      const ethValue = calculateEthValue(value);
      setBuyAmount(ethValue || "");
    } else {
      setBuyAmount("");
    }
  }, [ethPrice, calculateEthValue]);
  
  // Initialize Flaunch SDK
  const flaunchSDK = useMemo(() => {
    if (!publicClient || !walletClient) return null;

    try {
      return createFlaunch({
        publicClient: publicClient as any,
        walletClient: walletClient as any,
      }) as ReadWriteFlaunchSDK;
    } catch (error) {
      console.error('Failed to initialize Flaunch SDK:', error);
      return null;
    }
  }, [publicClient, walletClient]);

  // Read SWIPE token balance
  const { data: swipeBalance, refetch: refetchBalance } = useReadContract({
    address: SWIPE_TOKEN.address as `0x${string}`,
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

  // Buy SWIPE with ETH using Flaunch SDK
  const buyWithETH = useCallback(async (ethAmount: string) => {
    if (!flaunchSDK || !address) {
      await sendNotification({
        title: "Error",
        body: "Wallet not connected or SDK not ready",
      });
      return;
    }

    setIsLoading(true);
    setTransactionHash(null);

    try {
      // STEP 1: Call buyCoin from Flaunch SDK
      const hash = await flaunchSDK.buyCoin({
        coinAddress: SWIPE_TOKEN.address as `0x${string}`,  // SWIPE token address
        slippagePercent: slippagePercent,  // Slippage tolerance (1-10%)
        swapType: "EXACT_IN",              // Exact ETH amount
        amountIn: parseEther(ethAmount),   // ETH amount to swap
      });

      setTransactionHash(hash);

      // STEP 2: Wait for confirmation
      const receipt = await flaunchSDK.drift.waitForTransaction({ hash });

      // STEP 3: Check status
      if (receipt && receipt.status === "success") {
        await sendNotification({
          title: "🎉 Purchase Successful!",
          body: `Successfully bought SWIPE tokens! TX: ${hash.slice(0, 10)}...`,
        });

        // STEP 4: Refresh balance
        refetchBalance();

        setTimeout(() => {
          setTransactionHash(null);
        }, 5000);
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      console.error("Buy failed:", error);
      await sendNotification({
        title: "❌ Purchase Failed",
        body: error instanceof Error ? error.message : "Transaction failed",
      });
    } finally {
      setIsLoading(false);
    }
  }, [flaunchSDK, address, slippagePercent, sendNotification, refetchBalance]);

  // Sell SWIPE tokens for ETH with Permit2
  const sellSWIPETokens = useCallback(async () => {
    if (!flaunchSDK || !address) {
      await sendNotification({
        title: "Error",
        body: "Wallet not connected or SDK not ready",
      });
      return;
    }

    setIsLoading(true);
    setTransactionHash(null);

    try {
      const amountIn = parseEther(sellAmount);

      // STEP 1: Check allowance through Permit2
      const { allowance } = await flaunchSDK.getPermit2AllowanceAndNonce(
        SWIPE_TOKEN.address as `0x${string}`
      );

      if (allowance < amountIn) {
        // STEP 2: Need permit - request signature
        const { typedData, permitSingle } = await flaunchSDK.getPermit2TypedData(
          SWIPE_TOKEN.address as `0x${string}`
        );

        await sendNotification({
          title: "🔐 Signature Required",
          body: "Please sign the permit to allow token sale",
        });

        signTypedData(typedData);

        // Wait for signature
        await new Promise((resolve) => {
          const checkSignature = () => {
            if (signature) {
              resolve(signature);
            } else {
              setTimeout(checkSignature, 100);
            }
          };
          checkSignature();
        });

        if (!signature) {
          throw new Error("Signature required for token sale");
        }

        // STEP 3: Sell with permit
        const hash = await flaunchSDK.sellCoin({
          coinAddress: SWIPE_TOKEN.address as `0x${string}`,
          amountIn,
          slippagePercent,
          permitSingle,
          signature,
        });

        setTransactionHash(hash);
      } else {
        // Already approved - sell directly
        const hash = await flaunchSDK.sellCoin({
          coinAddress: SWIPE_TOKEN.address as `0x${string}`,
          amountIn,
          slippagePercent,
        });

        setTransactionHash(hash);
      }

      // Wait for confirmation
      const receipt = await flaunchSDK.drift.waitForTransaction({
        hash: transactionHash as `0x${string}`,
      });

      if (receipt && receipt.status === "success") {
        await sendNotification({
          title: "🎉 Sale Successful!",
          body: `Successfully sold SWIPE tokens!`,
        });

        refetchBalance();
        
        setTimeout(() => {
          setTransactionHash(null);
        }, 5000);
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      console.error("Sell failed:", error);
      await sendNotification({
        title: "❌ Sale Failed",
        body: error instanceof Error ? error.message : "Transaction failed",
      });
    } finally {
      setIsLoading(false);
    }
  }, [flaunchSDK, address, sellAmount, slippagePercent, signature, sendNotification, refetchBalance, transactionHash, signTypedData]);

  return (
    <div className="max-w-md mx-auto p-6 bg-black rounded-2xl shadow-xl border border-[#d4ff00]">
      {/* Header with Logo */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-[#d4ff00] p-2 flex items-center justify-center border-2 border-[#d4ff00] shadow-lg">
            <Image 
              src="/logo.png" 
              alt="SWIPE Logo" 
              width={32} 
              height={32} 
              className="rounded-full"
            />
          </div>
          <h2 className="text-3xl font-bold text-[#d4ff00]">$SWIPE</h2>
        </div>
        {ethPrice && (
          <div className="text-sm text-gray-400 mb-2">
            ETH Price: ${ethPrice.toLocaleString()}
          </div>
        )}
        {priceLoading && (
          <div className="text-sm text-gray-500 mb-2">
            Loading ETH price...
          </div>
        )}
      </div>

      {/* Balance Display */}
      {address && swipeBalance !== undefined && (
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-4 mb-6 border border-gray-700">
          <div className="text-sm text-[#d4ff00] mb-1">Your Balance</div>
          <div className="text-lg font-bold text-white">
            {Math.floor(parseFloat(formatEther(swipeBalance as bigint))).toLocaleString()}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(SWIPE_TOKEN.address);
                sendNotification({
                  title: "Copied!",
                  body: "Token address copied to clipboard",
                });
              }}
              className="text-xs text-gray-400 hover:text-[#d4ff00] transition-colors cursor-pointer"
            >
              {SWIPE_TOKEN.address.slice(0, 6)}...{SWIPE_TOKEN.address.slice(-4)}
            </button>
            <a
              href={`https://basescan.org/token/${SWIPE_TOKEN.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-[#d4ff00] transition-colors"
            >
              🔗
            </a>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex mb-6 bg-gray-900 rounded-lg p-1 border border-gray-700">
        <button
          onClick={() => setActiveTab("buy")}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === "buy"
              ? "bg-[#d4ff00] text-black shadow"
              : "text-gray-400 hover:text-[#d4ff00]"
          }`}
        >
          Buy SWIPE
        </button>
        <button
          onClick={() => setActiveTab("sell")}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === "sell"
              ? "bg-[#d4ff00] text-black shadow"
              : "text-gray-400 hover:text-[#d4ff00]"
          }`}
        >
          Sell SWIPE
        </button>
      </div>

      {/* Buy Tab */}
      {activeTab === "buy" && (
        <div>
          {/* Quick Buy Buttons */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#d4ff00] mb-3">
              Quick Buy with ETH
            </label>
            <div className="grid grid-cols-3 gap-3">
              {/* 0.0001 ETH */}
              <button
                onClick={() => buyWithETH("0.0001")}
                disabled={isLoading || !flaunchSDK || !address}
                className="bg-gradient-to-r from-[#d4ff00] to-yellow-300 text-black px-3 py-2 rounded-lg hover:from-yellow-300 hover:to-[#d4ff00] transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-[#d4ff00]"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mx-auto"></div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <Image src="/Ethereum-icon-purple.svg" alt="ETH" width={14} height={14} />
                      <span className="text-sm font-bold">0.0001</span>
                    </div>
                    {ethPrice && (
                      <span className="text-xs text-black/70">
                        ${calculateUsdValue("0.0001")}
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* 0.001 ETH */}
              <button
                onClick={() => buyWithETH("0.001")}
                disabled={isLoading || !flaunchSDK || !address}
                className="bg-gradient-to-r from-[#d4ff00] to-green-400 text-black px-3 py-2 rounded-lg hover:from-green-400 hover:to-[#d4ff00] transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-[#d4ff00]"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mx-auto"></div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <Image src="/Ethereum-icon-purple.svg" alt="ETH" width={14} height={14} />
                      <span className="text-sm font-bold">0.001</span>
                    </div>
                    {ethPrice && (
                      <span className="text-xs text-black/70">
                        ${calculateUsdValue("0.001")}
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* 0.01 ETH */}
              <button
                onClick={() => buyWithETH("0.01")}
                disabled={isLoading || !flaunchSDK || !address}
                className="bg-gradient-to-r from-[#d4ff00] to-lime-400 text-black px-3 py-2 rounded-lg hover:from-lime-400 hover:to-[#d4ff00] transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-[#d4ff00]"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mx-auto"></div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <Image src="/Ethereum-icon-purple.svg" alt="ETH" width={14} height={14} />
                      <span className="text-sm font-bold">0.01</span>
                    </div>
                    {ethPrice && (
                      <span className="text-xs text-black/70">
                        ${calculateUsdValue("0.01")}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Custom Amount */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-[#d4ff00]">
                Custom Amount
              </label>
              {ethPrice && (
                <span className="text-xs text-gray-400">
                  1 ETH = ${ethPrice.toLocaleString()}
                </span>
              )}
            </div>
            
            {/* Input Mode Toggle */}
            <div className="flex mb-3 bg-gray-900 rounded-lg p-1 border border-gray-700">
              <button
                onClick={() => setInputMode("eth")}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                  inputMode === "eth"
                    ? "bg-[#d4ff00] text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                ETH
              </button>
              <button
                onClick={() => setInputMode("usd")}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                  inputMode === "usd"
                    ? "bg-[#d4ff00] text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                USD
              </button>
            </div>

            {/* Range Slider */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">
                  {inputMode === "eth" ? "0.0001 ETH" : "$1"}
                </span>
                <span className="text-xs text-gray-400">
                  {inputMode === "eth" ? "0.224 ETH" : "$1000"}
                </span>
              </div>
              <input
                type="range"
                min={inputMode === "eth" ? "0.0001" : "1"}
                max={inputMode === "eth" ? "0.224" : "1000"}
                step={inputMode === "eth" ? "0.0001" : "1"}
                value={inputMode === "eth" ? (buyAmount || "0.0001") : (buyAmountUsd || "1")}
                onChange={(e) => {
                  if (inputMode === "eth") {
                    handleEthAmountChange(e.target.value);
                  } else {
                    handleUsdAmountChange(e.target.value);
                  }
                }}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #d4ff00 0%, #d4ff00 ${
                    inputMode === "eth" 
                      ? ((parseFloat(buyAmount || "0.0001") - 0.0001) / (0.224 - 0.0001)) * 100
                      : ((parseFloat(buyAmountUsd || "1") - 1) / (1000 - 1)) * 100
                  }%, #374151 ${
                    inputMode === "eth" 
                      ? ((parseFloat(buyAmount || "0.0001") - 0.0001) / (0.224 - 0.0001)) * 100
                      : ((parseFloat(buyAmountUsd || "1") - 1) / (1000 - 1)) * 100
                  }%, #374151 100%)`
                }}
              />
              <div className="flex justify-center mt-1">
                <span className="text-xs text-[#d4ff00] font-medium">
                  {inputMode === "eth" ? (buyAmount || "0.0001") : (buyAmountUsd || "1")} {inputMode === "eth" ? "ETH" : "USD"}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  step={inputMode === "eth" ? "0.0001" : "0.01"}
                  value={inputMode === "eth" ? buyAmount : buyAmountUsd}
                  onChange={(e) => {
                    if (inputMode === "eth") {
                      handleEthAmountChange(e.target.value);
                    } else {
                      handleUsdAmountChange(e.target.value);
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-[#d4ff00] focus:border-[#d4ff00] text-white placeholder-gray-400"
                  placeholder={inputMode === "eth" ? "0.001" : "100"}
                  disabled={isLoading}
                />
                {inputMode === "eth" && buyAmount && ethPrice && (
                  <div className="text-xs text-gray-400 mt-1">
                    ≈ ${calculateUsdValue(buyAmount)} USD
                  </div>
                )}
                {inputMode === "usd" && buyAmountUsd && ethPrice && (
                  <div className="text-xs text-gray-400 mt-1">
                    ≈ {calculateEthValue(buyAmountUsd)} ETH
                  </div>
                )}
              </div>
              <button
                onClick={() => buyWithETH(buyAmount)}
                disabled={isLoading || !flaunchSDK || !address || !buyAmount}
                className="bg-[#d4ff00] text-black px-6 py-2 rounded-lg hover:bg-yellow-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium border border-[#d4ff00]"
              >
                Buy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Tab */}
      {activeTab === "sell" && (
        <div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#d4ff00] mb-2">
              SWIPE Amount to Sell
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="1000"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-[#d4ff00] focus:border-[#d4ff00] text-white placeholder-gray-400"
                placeholder="10000"
                disabled={isLoading}
              />
              <button
                onClick={sellSWIPETokens}
                disabled={isLoading || !flaunchSDK || !address || !sellAmount}
                className="bg-[#d4ff00] text-black px-6 py-2 rounded-lg hover:bg-yellow-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium border border-[#d4ff00]"
              >
                Sell
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Minimum: 10,000 SWIPE
            </p>
          </div>
        </div>
      )}

      {/* Slippage Settings */}
      <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-gray-700">
        <label className="block text-sm font-medium text-[#d4ff00] mb-2">
          Slippage Tolerance: {slippagePercent}%
        </label>
        <div className="flex space-x-2">
          {[1, 3, 5, 10].map((percent) => (
            <button
              key={percent}
              onClick={() => setSlippagePercent(percent)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                slippagePercent === percent
                  ? "bg-[#d4ff00] text-black"
                  : "bg-gray-800 text-gray-300 border border-gray-600 hover:border-[#d4ff00] hover:text-[#d4ff00]"
              }`}
              disabled={isLoading}
            >
              {percent}%
            </button>
          ))}
        </div>
      </div>

      {/* Transaction Hash */}
      {transactionHash && (
        <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
          <div className="text-sm font-medium text-[#d4ff00] mb-1">
            Transaction Submitted
          </div>
          <a
            href={`https://basescan.org/tx/${transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#d4ff00] hover:text-yellow-300 break-all"
          >
            {transactionHash}
          </a>
        </div>
      )}

      {/* SWIPERS Group on Flaunch */}
      <div className="space-y-3 mb-6">
        <div className="text-sm font-medium text-[#d4ff00] mb-2">
          🚀 Join SWIPERS Community
        </div>
        
        {/* SWIPERS Group */}
        <a
          href="https://flaunch.gg/base/group/0x7d96076c750e65b60561491278280e3c324e1944"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-gradient-to-r from-[#d4ff00] to-green-400 text-black p-4 rounded-lg hover:from-green-400 hover:to-[#d4ff00] transition-all border border-[#d4ff00]"
        >
          <div className="text-center">
            <div className="text-lg font-bold mb-2">💰 Earn ETH from subcoin trading fees</div>
            <div className="text-sm mb-3">
              🤝 Members receive pro-rata ETH rewards<br/>
              🧠 Coin creators & holders win together
            </div>
            <div className="text-xs bg-black bg-opacity-20 rounded p-2 mb-2">
              <strong>Fee split:</strong><br/>
              👑 Owner – 20%<br/>
              ⚡️ Creators – 30%<br/>
              💎 Members – 50%
            </div>
            <div className="text-sm font-medium">
              Join SWIPERS Group on Flaunch →
            </div>
          </div>
        </a>

        {/* SWIPE Token on Flaunch */}
        <a
          href="https://flaunch.gg/base/coin/0xd0187d77af0ed6a44f0a631b406c78b30e160aa9"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-gray-800 text-[#d4ff00] p-3 rounded-lg hover:bg-gray-700 transition-all border border-gray-600"
        >
          <div className="flex items-center justify-center space-x-2 text-sm font-medium">
            <span>🚀</span>
            <span>View SWIPE Token on Flaunch</span>
            <span>↗️</span>
          </div>
        </a>
      </div>

      {/* DEX Links */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-[#d4ff00] mb-2">
          Alternative DEX Options
        </div>
        
        {/* Uniswap ETH → SWIPE */}
        <a
          href={`https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${SWIPE_TOKEN.address}&chain=base`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-gradient-to-r from-[#d4ff00] to-yellow-400 text-black p-3 rounded-lg hover:from-yellow-400 hover:to-[#d4ff00] transition-all border border-[#d4ff00]"
        >
          <div className="flex items-center justify-center space-x-2 text-sm font-medium">
            <span>🦄</span>
            <span>Swap ETH → SWIPE on Uniswap</span>
            <span>↗️</span>
          </div>
        </a>

        {/* DexScreener */}
        <a
          href={`https://dexscreener.com/base/${SWIPE_TOKEN.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-gray-800 text-[#d4ff00] p-3 rounded-lg hover:bg-gray-700 transition-all border border-gray-600"
        >
          <div className="flex items-center justify-center space-x-2 text-sm font-medium">
            <span>📊</span>
            <span>View SWIPE on DexScreener</span>
            <span>↗️</span>
          </div>
        </a>
      </div>

      {/* Wallet Connection Notice */}
      {!address && (
        <div className="mt-6 bg-gray-800 border border-[#d4ff00] rounded-lg p-4">
          <div className="text-sm text-[#d4ff00] text-center">
            Please connect your wallet to buy or sell SWIPE tokens
          </div>
        </div>
      )}
    </div>
  );
}

