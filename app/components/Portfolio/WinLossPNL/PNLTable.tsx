"use client";

import React, { useState, useRef, useCallback } from 'react';
import { Download, Share2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useComposeCast, useOpenUrl } from '@coinbase/onchainkit/minikit';
import { useAccount } from 'wagmi';
import sdk from '@farcaster/miniapp-sdk';
import { uploadToImgBB } from '@/lib/imgbb';
import './WinLossPNL.css';

export interface PredictionWithStakes {
  id: string;
  question: string;
  resolved: boolean;
  outcome?: boolean;
  cancelled: boolean;
  userStakes?: {
    ETH?: {
      yesAmount: number;
      noAmount: number;
      potentialProfit: number;
      potentialPayout: number;
      isWinner: boolean;
    };
    SWIPE?: {
      yesAmount: number;
      noAmount: number;
      potentialProfit: number;
      potentialPayout: number;
      isWinner: boolean;
    };
  };
  status: 'active' | 'resolved' | 'expired' | 'cancelled';
}

interface PNLTableProps {
  allUserPredictions: PredictionWithStakes[];
}

export function PNLTable({ allUserPredictions }: PNLTableProps) {
  const [selectedToken, setSelectedToken] = useState<'ETH' | 'SWIPE'>('ETH');
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const { composeCast: minikitComposeCast } = useComposeCast();
  const openUrl = useOpenUrl();
  const { address } = useAccount();

  const weiToEth = (wei: number): number => {
    return wei / Math.pow(10, 18);
  };

  const formatEth = (wei: number): string => {
    const eth = weiToEth(wei);
    if (eth === 0) return '0.0000';
    return eth.toFixed(6);
  };

  const formatSwipe = (wei: number): string => {
    const swipe = weiToEth(wei);
    if (swipe === 0) return '0';
    
    const absSwipe = Math.abs(swipe);
    const sign = swipe < 0 ? '-' : '';
    
    if (absSwipe >= 1000000) {
      return `${sign}${(absSwipe / 1000000).toFixed(2)}M`;
    } else if (absSwipe >= 1000) {
      return `${sign}${(absSwipe / 1000).toFixed(2)}K`;
    } else if (absSwipe >= 1) {
      return `${sign}${absSwipe.toFixed(2)}`;
    } else {
      return `${sign}${absSwipe.toFixed(4)}`;
    }
  };

  // Calculate PNL data
  const calculatePNL = () => {
    let totalStaked = 0;
    let totalPayout = 0;
    let totalProfit = 0;
    const positions: Array<{
      id: string;
      question: string;
      staked: number;
      payout: number;
      profit: number;
      status: string;
      isWinner: boolean;
    }> = [];

    allUserPredictions.forEach(prediction => {
      const stake = prediction.userStakes?.[selectedToken];
      if (!stake) return;

      const staked = stake.yesAmount + stake.noAmount;
      const payout = stake.potentialPayout || 0;
      const profit = stake.potentialProfit || 0;

      if (staked > 0) {
        totalStaked += staked;
        totalPayout += payout;
        totalProfit += profit;

        let status = 'Active';
        if (prediction.status === 'resolved') {
          status = stake.isWinner ? 'Win' : 'Loss';
        } else if (prediction.cancelled) {
          status = 'Cancelled';
        } else if (prediction.status === 'expired') {
          status = 'Expired';
        }

        positions.push({
          id: prediction.id,
          question: prediction.question,
          staked,
          payout,
          profit,
          status,
          isWinner: stake.isWinner || false
        });
      }
    });

    return { totalStaked, totalPayout, totalProfit, positions };
  };

  const { totalStaked, totalPayout, totalProfit, positions } = calculatePNL();

  const formatAmount = (wei: number) => {
    return selectedToken === 'ETH' ? formatEth(wei) : formatSwipe(wei);
  };

  // Calculate ROI (Return on Investment) - same as PNL percentage
  const calculateROI = () => {
    if (totalStaked === 0) return 0;
    return (totalProfit / totalStaked) * 100;
  };

  const roi = calculateROI();
  const isProfit = totalProfit >= 0;

  // Calculate wins and losses - count across all tokens
  const calculateWinsLosses = () => {
    const resolvedPredictions = allUserPredictions.filter(p => p.status === 'resolved');
    
    let wins = 0;
    let losses = 0;

    resolvedPredictions.forEach(prediction => {
      const ethStake = prediction.userStakes?.ETH;
      const swipeStake = prediction.userStakes?.SWIPE;
      
      // Check if user has any stake in this prediction
      const hasAnyStake = ethStake || swipeStake;
      if (!hasAnyStake) return;

      // Check if user won in any token
      const wonInEth = ethStake?.isWinner || false;
      const wonInSwipe = swipeStake?.isWinner || false;
      const hasWin = wonInEth || wonInSwipe;

      // Check if user lost in all tokens where they had stakes
      const lostInEth = ethStake && !ethStake.isWinner && (ethStake.potentialProfit || 0) < 0;
      const lostInSwipe = swipeStake && !swipeStake.isWinner && (swipeStake.potentialProfit || 0) < 0;
      const hasLoss = (ethStake && lostInEth) || (swipeStake && lostInSwipe);

      if (hasWin) {
        wins++;
      } else if (hasLoss) {
        losses++;
      }
    });

    return { wins, losses };
  };

  const { wins, losses } = calculateWinsLosses();

  const handleExportImage = async () => {
    if (!cardRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 5, // Increased for better quality
        logging: false,
        useCORS: true,
        width: cardRef.current.offsetWidth,
        height: cardRef.current.offsetHeight,
      });

      const link = document.createElement('a');
      link.download = `PNL_${selectedToken}_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to export image:', error);
      alert('Failed to export image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Universal composeCast function (works in both Base app and Warpcast)
  const composeCast = useCallback(async (params: { text: string; embeds?: string[] }) => {
    // Try MiniKit first (Base app)
    try {
      if (minikitComposeCast) {
        const embedsParam = params.embeds?.slice(0, 2) as [] | [string] | [string, string] | undefined;
        await minikitComposeCast({ text: params.text, embeds: embedsParam });
        return;
      }
    } catch (error) {
      console.log('MiniKit composeCast failed, trying Farcaster SDK...', error);
    }
    
    // Fallback to Farcaster SDK (Warpcast)
    try {
      await sdk.actions.composeCast({
        text: params.text,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        embeds: params.embeds?.map(url => ({ url })) as any
      });
    } catch (error) {
      console.error('Both composeCast methods failed:', error);
      throw error;
    }
  }, [minikitComposeCast]);

  const handleShare = async (platform: 'farcaster' | 'twitter') => {
    if (!cardRef.current || !address) {
      if (!address) {
        alert('Please connect your wallet to share PNL');
      }
      return;
    }

    setIsSharing(true);
    setShowShareDropdown(false);
    
    try {
      // Export to canvas with high quality
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 5, // High quality for sharing
        logging: false,
        useCORS: true,
        width: cardRef.current.offsetWidth,
        height: cardRef.current.offsetHeight,
      });

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        }, 'image/png');
      });

      // Convert blob to File
      const file = new File([blob], `PNL_${selectedToken}_${Date.now()}.png`, { type: 'image/png' });

      // Upload to ImgBB
      const uploadResult = await uploadToImgBB(file);
      const imageUrl = uploadResult.data.url;
      
      console.log('📸 PNL card uploaded to ImgBB:', imageUrl);

      // Save image URL to Redis for the /pnl/[address] page metadata
      // This follows Base Mini Apps documentation - the page will serve fc:miniapp metadata with this imageUrl
      const userAddressLower = address.toLowerCase();
      try {
        await fetch('/api/pnl/save-og-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: userAddressLower,
            ogImageUrl: imageUrl
          })
        });
        console.log('💾 Saved ogImageUrl to Redis for metadata');
      } catch (redisError) {
        console.error('Error saving to Redis (non-critical):', redisError);
      }

      // PNL share page URL - this page has fc:miniapp metadata with the uploaded image
      // Following Base Mini Apps documentation for dynamic embed images
      const pnlPageUrl = `${window.location.origin}/pnl/${userAddressLower}`;

      // Build share text with platform-specific tag
      // @swipeai for Farcaster/Base, @swipe_ai_ for Twitter/X
      const tag = platform === 'farcaster' ? '@swipeai' : '@swipe_ai_';
      
      // Motivational call-to-action texts in various styles
      // Includes Base references, crypto slang (mfer, gm, wagmi, etc.)
      const ctaTexts = [
        // Casual/Fun style
        'gm mfers! Check your PNL and see if you can beat mine 🎯',
        'Built different on Base. Show me your stats anon 👀',
        'wagmi but first - share your predictions! LFG 🚀',
        'ngmi if you\'re not tracking your PNL tbh 📊',
        'ser, are you even predicting on Base? 🤔',
        
        // Competitive style
        'Think you can outpredict me? Prove it mfer 💪',
        'My PNL speaks for itself. What about yours? 👀',
        'Stacking wins on Base. Your move anon 🎰',
        'Less talking, more predicting. Show your stats! 📈',
        'I\'m cooking on Base rn. Wbu? 🔥',
        
        // Motivational style
        'Every prediction is a chance to win. Start earning on Base! 💰',
        'The best time to start predicting was yesterday. The second best time is now 🚀',
        'Fortune favors the bold. Make your predictions count! ⚡',
        'Don\'t just watch the market - predict it and earn! 🎯',
        'Your portfolio, your predictions, your profits. Let\'s go! 💎',
        
        // Community style
        'Based predictions only. Join the movement on Base! 🔵',
        'The Base prediction community is thriving. Are you in? 🤝',
        'Onchain predictions, real profits. This is the way 🛡️',
        'Predict with the best on Base. lfg frens! 💙',
        'Base is home. Predictions are life. wagmi together! 🏠',
        
        // Challenge style
        'I bet you can\'t beat my ROI. Prove me wrong mfer 😤',
        'My predictions are printing. What\'s your excuse? 💸',
        'Less scrolling, more predicting. Get in here anon! 📲',
        'Touch grass? Nah, touch predictions on Base 🌱',
        'Imagine not tracking your PNL in 2026. couldn\'t be me 😂'
      ];
      const randomCta = ctaTexts[Math.floor(Math.random() * ctaTexts.length)];
      
      // Build share text
      let shareText = '';
      
      // Add PNL stats with intro
      if (isProfit && totalProfit > 0) {
        const profitFormatted = formatAmount(totalProfit);
        shareText = `📊 My ${selectedToken} P&L on ${tag}:\n\n`;
        shareText += `💰 Total P&L: +${profitFormatted} ${selectedToken}\n`;
        shareText += `📈 ROI: +${Math.round(roi)}%\n`;
      } else {
        const pnlFormatted = formatAmount(totalProfit);
        shareText = `📊 My ${selectedToken} P&L on ${tag}:\n\n`;
        shareText += `📉 Total P&L: ${pnlFormatted} ${selectedToken}\n`;
        shareText += `📊 ROI: ${Math.round(roi)}%\n`;
      }
      
      // Add wins/losses count
      shareText += `🏆 Wins: ${wins} | Losses: ${losses}\n\n`;
      
      // Add motivational CTA
      shareText += randomCta;

      if (platform === 'farcaster') {
        // Share to Farcaster/Base - use PNL page URL as embed
        // The page has fc:miniapp metadata with imageUrl pointing to the ImgBB image
        // This follows Base Mini Apps documentation for dynamic embed images
        await composeCast({
          text: shareText,
          embeds: [pnlPageUrl]
        });
      } else {
        // Share to Twitter/X - add PNL page URL to tweet
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pnlPageUrl)}`;
        await openUrl(twitterUrl);
      }
    } catch (error) {
      console.error('Failed to share:', error);
      alert('Failed to share. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  const formatQuestion = (question: string) => {
    if (question.length > 60) {
      return question.substring(0, 60) + '...';
    }
    return question;
  };

  const formatDate = () => {
    return new Date().toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="pnl-container">
      <div className="pnl-header">
        <h3 className="pnl-title">P&L Overview</h3>
        <div className="pnl-controls">
          <div className="pnl-token-switch">
            <button
              className={`pnl-switch-btn ${selectedToken === 'ETH' ? 'active' : ''}`}
              onClick={() => setSelectedToken('ETH')}
            >
              <img src="/Ethereum-icon-purple.svg" alt="ETH" className="pnl-switch-icon" />
              ETH
            </button>
            <button
              className={`pnl-switch-btn ${selectedToken === 'SWIPE' ? 'active' : ''}`}
              onClick={() => setSelectedToken('SWIPE')}
            >
              <img src="/splash.png" alt="SWIPE" className="pnl-switch-icon" />
              SWIPE
            </button>
          </div>
          <button
            className="pnl-export-btn pnl-export-icon-only"
            onClick={handleExportImage}
            disabled={isExporting}
            title="Export PNL Card"
          >
            <Download size={16} />
          </button>
          <div className="pnl-share-wrapper" style={{ position: 'relative' }}>
            <button
              className="pnl-export-btn pnl-share-btn pnl-share-icon-only"
              onClick={() => setShowShareDropdown(!showShareDropdown)}
              disabled={isSharing}
              title="Share PNL Card"
            >
              <Share2 size={16} />
            </button>
            {showShareDropdown && (
              <>
                <div className="pnl-share-overlay" onClick={() => setShowShareDropdown(false)} />
                <div className="pnl-share-dropdown">
                  <button 
                    className="pnl-share-option pnl-share-btn-farcaster-split"
                    onClick={() => handleShare('farcaster')}
                    disabled={isSharing}
                  >
                    <div className="pnl-share-btn-split-bg">
                      <div className="pnl-share-btn-half-purple"></div>
                      <div className="pnl-share-btn-half-white"></div>
                    </div>
                    <div className="pnl-share-btn-icons">
                      <img src="/farc.png" alt="Farcaster" className="pnl-share-btn-icon-left" />
                      <img src="/Base_square_blue.png" alt="Base" className="pnl-share-btn-icon-right" />
                    </div>
                  </button>
                  <div className="pnl-share-divider"></div>
                  <button 
                    className="pnl-share-option pnl-share-btn-twitter"
                    onClick={() => handleShare('twitter')}
                    disabled={isSharing}
                  >
                    <svg className="pnl-share-btn-x-icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* PNL Card - Horizontal Layout */}
      <div ref={cardRef} className="pnl-card pnl-card-horizontal">
        <div className="pnl-card-content">
          <div className="pnl-card-left">
            <div className="pnl-card-header">
              <div className="pnl-wins-losses">
                <span className="pnl-wins-text">WINS: <span className="pnl-wins-count">{wins}</span></span>
                <span className="pnl-losses-text">LOSSES: <span className="pnl-losses-count">{losses}</span></span>
              </div>
            </div>

            <div className="pnl-card-main-horizontal">
              <div className="pnl-metrics-row">
                <div className="pnl-metric-item">
                  <span className="pnl-metric-label">Total Staked:</span>
                  <span className="pnl-metric-value">{formatAmount(totalStaked)} {selectedToken}</span>
                </div>
                <div className="pnl-metric-item">
                  <span className="pnl-metric-label">Total Payout:</span>
                  <span className="pnl-metric-value">{formatAmount(totalPayout)} {selectedToken}</span>
                </div>
                <div className="pnl-metric-item">
                  <span className="pnl-metric-label">Total P&L:</span>
                  <span className={`pnl-metric-value ${isProfit ? 'pnl-profit-text' : 'pnl-loss-text'}`}>
                    {isProfit ? '+' : ''}{formatAmount(totalProfit)} {selectedToken}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pnl-card-right">
            <div className="pnl-character-wrapper">
              <img src="/swiper1.png" alt="Swiper" className="pnl-character-img" />
            </div>
            <div className="pnl-percentages-container">
              <div className="pnl-percentage-main">
                <div className="pnl-percentage-value" style={{ color: isProfit ? '#00ff41' : '#ff0040' }}>
                  {isProfit ? '+' : ''}{Math.round(roi)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pnl-card-footer">
          <div className="pnl-sharing-time">
            Sharing Time: {formatDate()}
          </div>
        </div>
      </div>
    </div>
  );
}
