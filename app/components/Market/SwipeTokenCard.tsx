"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient, useReadContract, useSignTypedData } from "wagmi";
import { createFlaunch, ReadWriteFlaunchSDK } from "@flaunch/sdk";
import { parseEther, formatEther } from "viem";
import { useNotification } from "@coinbase/onchainkit/minikit";
import { SWIPE_TOKEN } from "../../../lib/contract";
import { useTokenPrices } from "../../../lib/hooks/useTokenPrices";
import Image from "next/image";
import "./SwipeTokenCard.css";

export function SwipeTokenCard() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const sendNotification = useNotification();
  
  // Use the token prices hook to get both ETH and SWIPE prices
  const { ethPrice, swipePrice, loading: priceLoading, formatUsdValue, getUsdValue } = useTokenPrices();
  
  const [isLoading, setIsLoading] = useState(false);
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | null>(null);
  const [buyAmount, setBuyAmount] = useState("0.001");
  const [buyAmountUsd, setBuyAmountUsd] = useState("");
  const [sellAmount, setSellAmount] = useState("10000");
  const [slippagePercent, setSlippagePercent] = useState(5);
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [inputMode, setInputMode] = useState<"eth" | "usd">("eth");
  
  // Signature state for Permit2
  const { data: signature, signTypedData } = useSignTypedData();

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

  // Calculate SWIPE tokens received for buy amount (ETH or USD)
  const calculateSwipeReceived = useCallback((amount: string, isUsd: boolean = false) => {
    if (!swipePrice || !ethPrice || !amount) return null;
    let usdValue: number;
    if (isUsd) {
      usdValue = parseFloat(amount);
    } else {
      const ethValue = parseFloat(amount);
      usdValue = ethValue * ethPrice;
    }
    const swipeAmount = usdValue / swipePrice;
    return swipeAmount;
  }, [swipePrice, ethPrice]);

  // Calculate ETH received for sell amount
  const calculateEthReceived = useCallback((swipeAmount: string) => {
    if (!swipePrice || !ethPrice || !swipeAmount) return null;
    const swipeValue = parseFloat(swipeAmount);
    const usdValue = swipeValue * swipePrice;
    const ethAmount = usdValue / ethPrice;
    return ethAmount;
  }, [swipePrice, ethPrice]);

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

  // Get slider background style
  const getSliderBackground = () => {
    const min = inputMode === "eth" ? 0.0001 : 1;
    const max = inputMode === "eth" ? 0.224 : 1000;
    const value = inputMode === "eth" ? parseFloat(buyAmount || "0.0001") : parseFloat(buyAmountUsd || "1");
    const percentage = ((value - min) / (max - min)) * 100;
    return `linear-gradient(to right, #d4ff00 0%, #d4ff00 ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`;
  };

  return (
    <div className="swipe-token-page">
      <div className="swipe-token-card">
        {/* Header with Logo */}
        <div className="swipe-token-header">
          <div className="swipe-token-logo-container">
            <div className="swipe-token-logo-wrapper">
              <Image 
                src="/logo.png" 
                alt="SWIPE Logo" 
                width={56} 
                height={56} 
                className="swipe-token-logo"
              />
            </div>
            <h2 className="swipe-token-title">$SWIPE</h2>
          </div>
        </div>

        {/* Balance Display */}
        {address && swipeBalance !== undefined && (
          <div className="swipe-token-balance">
            <div className="swipe-token-balance-label">Your Balance</div>
            <div className="swipe-token-balance-value">
              {Math.floor(parseFloat(formatEther(swipeBalance as bigint))).toLocaleString()} SWIPE
            </div>
            {/* Show balance value in USD */}
            {swipePrice && (
              <div className="swipe-token-balance-usd">
                ≈ ${(parseFloat(formatEther(swipeBalance as bigint)) * swipePrice).toLocaleString('en-US', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })} USD
              </div>
            )}
            <div className="swipe-token-address-row">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(SWIPE_TOKEN.address);
                  sendNotification({
                    title: "Copied!",
                    body: "Token address copied to clipboard",
                  });
                }}
                className="swipe-token-address"
              >
                {SWIPE_TOKEN.address.slice(0, 6)}...{SWIPE_TOKEN.address.slice(-4)}
              </button>
              <a
                href={`https://basescan.org/token/${SWIPE_TOKEN.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="swipe-token-link"
              >
                🔗
              </a>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="swipe-token-tabs">
          <button
            onClick={() => setActiveTab("buy")}
            className={`swipe-token-tab ${activeTab === "buy" ? "active" : ""}`}
          >
            Buy SWIPE
          </button>
          <button
            onClick={() => setActiveTab("sell")}
            className={`swipe-token-tab ${activeTab === "sell" ? "active" : ""}`}
          >
            Sell SWIPE
          </button>
        </div>

        {/* Buy Tab */}
        {activeTab === "buy" && (
          <div>
            {/* Quick Buy Buttons */}
            <div className="swipe-token-quick-buy">
              <div className="swipe-token-section-title">
                Quick Buy
              </div>
              <div className="swipe-token-quick-grid">
                {/* $10 */}
                <button
                  onClick={() => ethPrice ? buyWithETH((10 / ethPrice).toFixed(6)) : null}
                  disabled={isLoading || !flaunchSDK || !address || !ethPrice}
                  className="swipe-token-quick-btn"
                >
                  {isLoading ? (
                    <div className="swipe-token-quick-btn-loading"></div>
                  ) : (
                    <>
                      <span className="swipe-token-quick-btn-usd-main">$10</span>
                      {ethPrice && (
                        <div className="swipe-token-quick-btn-eth-small">
                          <Image src="/Ethereum-icon-purple.svg" alt="ETH" width={12} height={12} />
                          <span>{(10 / ethPrice).toFixed(4)}</span>
                        </div>
                      )}
                      {swipePrice && (
                        <div className="swipe-token-quick-btn-swipe">
                          ~{calculateSwipeReceived("10", true)?.toLocaleString('en-US', { 
                            maximumFractionDigits: 0,
                            minimumFractionDigits: 0
                          })} SWIPE
                        </div>
                      )}
                    </>
                  )}
                </button>

                {/* $50 */}
                <button
                  onClick={() => ethPrice ? buyWithETH((50 / ethPrice).toFixed(6)) : null}
                  disabled={isLoading || !flaunchSDK || !address || !ethPrice}
                  className="swipe-token-quick-btn"
                >
                  {isLoading ? (
                    <div className="swipe-token-quick-btn-loading"></div>
                  ) : (
                    <>
                      <span className="swipe-token-quick-btn-usd-main">$50</span>
                      {ethPrice && (
                        <div className="swipe-token-quick-btn-eth-small">
                          <Image src="/Ethereum-icon-purple.svg" alt="ETH" width={12} height={12} />
                          <span>{(50 / ethPrice).toFixed(4)}</span>
                        </div>
                      )}
                      {swipePrice && (
                        <div className="swipe-token-quick-btn-swipe">
                          ~{calculateSwipeReceived("50", true)?.toLocaleString('en-US', { 
                            maximumFractionDigits: 0,
                            minimumFractionDigits: 0
                          })} SWIPE
                        </div>
                      )}
                    </>
                  )}
                </button>

                {/* $100 */}
                <button
                  onClick={() => ethPrice ? buyWithETH((100 / ethPrice).toFixed(6)) : null}
                  disabled={isLoading || !flaunchSDK || !address || !ethPrice}
                  className="swipe-token-quick-btn"
                >
                  {isLoading ? (
                    <div className="swipe-token-quick-btn-loading"></div>
                  ) : (
                    <>
                      <span className="swipe-token-quick-btn-usd-main">$100</span>
                      {ethPrice && (
                        <div className="swipe-token-quick-btn-eth-small">
                          <Image src="/Ethereum-icon-purple.svg" alt="ETH" width={12} height={12} />
                          <span>{(100 / ethPrice).toFixed(4)}</span>
                        </div>
                      )}
                      {swipePrice && (
                        <div className="swipe-token-quick-btn-swipe">
                          ~{calculateSwipeReceived("100", true)?.toLocaleString('en-US', { 
                            maximumFractionDigits: 0,
                            minimumFractionDigits: 0
                          })} SWIPE
                        </div>
                      )}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Custom Amount */}
            <div className="swipe-token-custom">
              <div className="swipe-token-custom-header">
                <div className="swipe-token-section-title">
                  Custom Amount
                </div>
                {ethPrice && (
                  <span className="swipe-token-price-info">
                    1 ETH = ${ethPrice.toLocaleString()}
                  </span>
                )}
              </div>
              
              {/* Input Mode Toggle */}
              <div className="swipe-token-input-toggle">
                <button
                  onClick={() => setInputMode("eth")}
                  className={`swipe-token-toggle-btn ${inputMode === "eth" ? "active" : ""}`}
                >
                  ETH
                </button>
                <button
                  onClick={() => setInputMode("usd")}
                  className={`swipe-token-toggle-btn ${inputMode === "usd" ? "active" : ""}`}
                >
                  USD
                </button>
              </div>

              {/* Range Slider */}
              <div className="swipe-token-slider-container">
                <div className="swipe-token-slider-labels">
                  <span className="swipe-token-slider-label">
                    {inputMode === "eth" ? "0.0001 ETH" : "$1"}
                  </span>
                  <span className="swipe-token-slider-label">
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
                  className="swipe-token-slider"
                  style={{ background: getSliderBackground() }}
                />
                <div className="swipe-token-slider-value">
                  {inputMode === "eth" ? (buyAmount || "0.0001") : (buyAmountUsd || "1")} {inputMode === "eth" ? "ETH" : "USD"}
                </div>
              </div>

              <div className="swipe-token-input-row">
                <div className="swipe-token-input-wrapper">
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
                    className="swipe-token-input"
                    placeholder={inputMode === "eth" ? "0.001" : "100"}
                    disabled={isLoading}
                  />
                  {inputMode === "eth" && buyAmount && ethPrice && (
                    <div className="swipe-token-input-helper">
                      ≈ ${calculateUsdValue(buyAmount)} USD
                    </div>
                  )}
                  {inputMode === "usd" && buyAmountUsd && ethPrice && (
                    <div className="swipe-token-input-helper">
                      ≈ {calculateEthValue(buyAmountUsd)} ETH
                    </div>
                  )}
                  {/* Show SWIPE tokens received */}
                  {((inputMode === "eth" && buyAmount) || (inputMode === "usd" && buyAmountUsd)) && swipePrice && ethPrice && (
                    <div className="swipe-token-receive-info">
                      You will receive ~{calculateSwipeReceived(
                        inputMode === "eth" ? buyAmount : buyAmountUsd,
                        inputMode === "usd"
                      )?.toLocaleString('en-US', { 
                        maximumFractionDigits: 0,
                        minimumFractionDigits: 0
                      })} SWIPE
                    </div>
                  )}
                </div>
                <button
                  onClick={() => buyWithETH(buyAmount)}
                  disabled={isLoading || !flaunchSDK || !address || !buyAmount}
                  className="swipe-token-action-btn"
                >
                  Buy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sell Tab */}
        {activeTab === "sell" && (
          <div className="swipe-token-sell">
            <div className="swipe-token-section-title">
              SWIPE Amount to Sell
            </div>
            <div className="swipe-token-input-row">
              <div className="swipe-token-input-wrapper" style={{ flex: 1 }}>
                <input
                  type="number"
                  step="1000"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  className="swipe-token-input"
                  placeholder="10000"
                  disabled={isLoading}
                />
                {/* Show ETH and USD received */}
                {sellAmount && swipePrice && ethPrice && parseFloat(sellAmount) > 0 && (
                  <div className="swipe-token-receive-info">
                    You will receive ~{calculateEthReceived(sellAmount)?.toFixed(6)} ETH
                    {calculateEthReceived(sellAmount) && ethPrice && (
                      <span> (~${(parseFloat(calculateEthReceived(sellAmount) || "0") * ethPrice).toLocaleString('en-US', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })} USD)</span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={sellSWIPETokens}
                disabled={isLoading || !flaunchSDK || !address || !sellAmount}
                className="swipe-token-action-btn"
              >
                Sell
              </button>
            </div>
            <p className="swipe-token-min-info">
              Minimum: 10,000 SWIPE
            </p>
          </div>
        )}

        {/* Slippage Settings */}
        <div className="swipe-token-slippage">
          <div className="swipe-token-slippage-label">
            Slippage Tolerance: {slippagePercent}%
          </div>
          <div className="swipe-token-slippage-options">
            {[1, 3, 5, 10].map((percent) => (
              <button
                key={percent}
                onClick={() => setSlippagePercent(percent)}
                className={`swipe-token-slippage-btn ${slippagePercent === percent ? "active" : ""}`}
                disabled={isLoading}
              >
                {percent}%
              </button>
            ))}
          </div>
        </div>

        {/* Transaction Hash */}
        {transactionHash && (
          <div className="swipe-token-tx-status">
            <div className="swipe-token-tx-label">
              Transaction Submitted
            </div>
            <a
              href={`https://basescan.org/tx/${transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="swipe-token-tx-link"
            >
              {transactionHash}
            </a>
          </div>
        )}

        {/* SWIPERS Community - Compact */}
        <div className="swipe-token-swipers">
          <div className="swipe-token-swipers-info">
            💰 Earn ETH from trading fees • 👑 Owner 20% • ⚡ Creators 30% • 💎 Members 50%
          </div>
          <a
            href="https://flaunch.gg/base/group/0x7d96076c750e65b60561491278280e3c324e1944"
            target="_blank"
            rel="noopener noreferrer"
            className="swipe-token-swipers-btn"
          >
            <Image src="/flaunch.jpg" alt="Flaunch" width={18} height={18} className="swipe-token-swipers-btn-icon" />
            Join SWIPERS
          </a>
        </div>

        {/* DEX Icons */}
        <div className="swipe-token-dex-icons">
          <a
            href="https://flaunch.gg/base/coin/0xd0187d77af0ed6a44f0a631b406c78b30e160aa9"
            target="_blank"
            rel="noopener noreferrer"
            className="swipe-token-dex-icon"
            title="Flaunch"
          >
            <Image src="/flaunch.jpg" alt="Flaunch" width={56} height={56} />
          </a>
          <a
            href={`https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${SWIPE_TOKEN.address}&chain=base`}
            target="_blank"
            rel="noopener noreferrer"
            className="swipe-token-dex-icon"
            title="Uniswap"
          >
            <Image src="/uni.png" alt="Uniswap" width={56} height={56} />
          </a>
          <a
            href={`https://dexscreener.com/base/${SWIPE_TOKEN.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="swipe-token-dex-icon"
            title="DexScreener"
          >
            <Image src="/dexscreen.png" alt="DexScreener" width={56} height={56} />
          </a>
        </div>

        {/* Wallet Connection Notice */}
        {!address && (
          <div className="swipe-token-wallet-notice">
            <div className="swipe-token-wallet-text">
              Please connect your wallet to buy or sell SWIPE tokens
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
