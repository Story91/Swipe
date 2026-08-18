"use client";

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Download, Share2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useComposeCast, useOpenUrl } from '@coinbase/onchainkit/minikit';
import { useAccount } from 'wagmi';
import sdk from '@farcaster/miniapp-sdk';
import { uploadToImgBB } from '@/lib/imgbb';
import { useActiveChain } from '@/lib/chains/activeChain';
import { tokenSymbol, COLLATERAL_LEG, type StakeToken } from '@/lib/userStake';
import type { PnlPrediction, PnlSummary } from './pnlTotals';
import { summarisePnl, formatTokenAmount, formatSignedAmount, formatRoi } from './pnlTotals';
import './WinLossPNL.css';

/**
 * The shape a page hands this card, defined once in pnlTotals and re-exported
 * under the name the two P&L pages already import.
 */
export type { PnlPrediction as PredictionWithStakes } from './pnlTotals';

/**
 * The tabs, collateral first because it is the only leg still live.
 *
 * Every bet placed today settles in the chain's stablecoin, USDC on Base and
 * Paxos USDG on Robinhood, and until now this card had nowhere to put one: the
 * type knew about ETH and SWIPE, the switch had two buttons, and the formatter
 * divided everything by 1e18. So the whole current product read as zero and
 * both P&L screens were archive viewers.
 *
 * ETH and SWIPE stay reachable and stay marked. They sat on the Base contracts
 * whose owner key is gone, so nothing new is placed there, and a tab that looks
 * current invites someone to read an old number as today's.
 */
const TOKEN_TABS: ReadonlyArray<{ token: StakeToken; icon: string; archived: boolean }> = [
  { token: COLLATERAL_LEG, icon: '/usdc.png', archived: false },
  { token: 'ETH', icon: '/Ethereum-icon-purple.svg', archived: true },
  { token: 'SWIPE', icon: '/splash.png', archived: true },
];

interface PNLTableProps {
  allUserPredictions: PnlPrediction[];
}

export function PNLTable({ allUserPredictions }: PNLTableProps) {
  const [selectedToken, setSelectedToken] = useState<StakeToken>(COLLATERAL_LEG);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const { composeCast: minikitComposeCast } = useComposeCast();
  const openUrl = useOpenUrl();
  const { address } = useAccount();
  /**
   * What the collateral is called on the network the user is looking at.
   *
   * The leg is stored under the key 'USDC' on every chain, Robinhood included,
   * where the token is actually Paxos USDG. Printing the key would tell a
   * Robinhood user they hold the wrong dollar.
   */
  const { chainKey } = useActiveChain();
  const symbolFor = (token: StakeToken) => tokenSymbol(token, chainKey);
  const symbol = symbolFor(selectedToken);

  /**
   * A separate set of totals per token, never a sum across them.
   *
   * ETH is 18 decimals and the collateral is 6, so a single figure over both is
   * the wei leg and nothing else. All three are worked out because the empty
   * state needs to know which other tab holds something. The arithmetic is in
   * pnlTotals, which is a .ts so a test can import it.
   */
  const summaries = useMemo(() => {
    const out = {} as Record<StakeToken, PnlSummary>;
    for (const { token } of TOKEN_TABS) out[token] = summarisePnl(allUserPredictions, token);
    return out;
  }, [allUserPredictions]);

  const summary = summaries[selectedToken];
  const { staked: totalStaked, payout: totalPayout, profit: totalProfit, roi, wins, losses } =
    summary;
  const tabsWithBets = TOKEN_TABS.filter(({ token }) => summaries[token].bets > 0);
  const isProfit = totalProfit >= 0;

  const formatAmount = (amount: number) => formatTokenAmount(amount, selectedToken);

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
      link.download = `PNL_${symbol}_${Date.now()}.png`;
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
        alert('Connect your wallet to share your P&L.');
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
      const file = new File([blob], `PNL_${symbol}_${Date.now()}.png`, { type: 'image/png' });

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
      // The currency is named on every figure. A number with no unit beside it
      // is the reason a 25 dollar bet once went out as "25000000 ETH".
      const pnlFormatted = formatSignedAmount(totalProfit, selectedToken);
      shareText = `📊 My ${symbol} P&L on ${tag}:\n\n`;
      shareText += `${isProfit ? '💰' : '📉'} Total P&L: ${pnlFormatted} ${symbol}\n`;
      shareText += `${isProfit ? '📈' : '📊'} ROI: ${formatRoi(roi)}\n`;
      
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
        <h3 className="pnl-title">P&L overview</h3>
        <div className="pnl-controls">
          <div className="pnl-token-switch">
            {TOKEN_TABS.map(({ token, icon, archived }) => (
              <button
                key={token}
                className={`pnl-switch-btn ${selectedToken === token ? 'active' : ''}`}
                onClick={() => setSelectedToken(token)}
                title={archived ? 'Archived, no new bets settle here' : undefined}
              >
                <img src={icon} alt="" className="pnl-switch-icon" />
                {symbolFor(token)}
                {archived && <span className="pnl-switch-tag">old</span>}
              </button>
            ))}
          </div>
          <button
            className="pnl-export-btn pnl-export-icon-only"
            onClick={handleExportImage}
            disabled={isExporting}
            title="Save the card as an image"
          >
            <Download size={16} />
          </button>
          <div className="pnl-share-wrapper" style={{ position: 'relative' }}>
            <button
              className="pnl-export-btn pnl-share-btn pnl-share-icon-only"
              onClick={() => setShowShareDropdown(!showShareDropdown)}
              disabled={isSharing}
              title="Share the card"
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

      {/*
        Two things worth saying before someone reads the figures. Which tab they
        are on, when it is one nobody can settle any more. And that an empty tab
        is empty, because a card of zeros reads as a losing account rather than
        as no account at all.
      */}
      {(selectedToken !== COLLATERAL_LEG || summary.bets === 0) && (
        <p className="pnl-archived-note">
          {selectedToken !== COLLATERAL_LEG && (
            <>
              {selectedToken} bets ran on the old Base contracts. Nothing new settles there,
              so this tab is history.{' '}
            </>
          )}
          {summary.bets === 0 && (
            <>
              Nothing staked in {symbol}.
              {tabsWithBets.length > 0 &&
                ` Your positions are under ${tabsWithBets
                  .map(({ token }) => symbolFor(token))
                  .join(' and ')}.`}
            </>
          )}
        </p>
      )}

      {/* PNL Card - Horizontal Layout */}
      <div ref={cardRef} className="pnl-card pnl-card-horizontal">
        <div className="pnl-card-content">
          <div className="pnl-card-left">
            <div className="pnl-card-header">
              <div className="pnl-wins-losses">
                {/*
                  The record is this token's, not every token's. It used to
                  count a win in any currency, so an ETH call from the archived
                  contracts landed on a card headed with dollar figures.
                */}
                <span className="pnl-card-token">{symbol}</span>
                <span className="pnl-wins-text">WINS: <span className="pnl-wins-count">{wins}</span></span>
                <span className="pnl-losses-text">LOSSES: <span className="pnl-losses-count">{losses}</span></span>
              </div>
            </div>

            <div className="pnl-card-main-horizontal">
              <div className="pnl-metrics-row">
                <div className="pnl-metric-item">
                  <span className="pnl-metric-label">Total staked:</span>
                  <span className="pnl-metric-value">{formatAmount(totalStaked)} {symbol}</span>
                </div>
                <div className="pnl-metric-item">
                  <span className="pnl-metric-label">Total payout:</span>
                  <span className="pnl-metric-value">{formatAmount(totalPayout)} {symbol}</span>
                </div>
                <div className="pnl-metric-item">
                  <span className="pnl-metric-label">Total P&L:</span>
                  <span className={`pnl-metric-value ${isProfit ? 'pnl-profit-text' : 'pnl-loss-text'}`}>
                    {formatSignedAmount(totalProfit, selectedToken)} {symbol}
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
                  {formatRoi(roi)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pnl-card-footer">
          <div className="pnl-sharing-time">
            Shared at {formatDate()}
          </div>
        </div>
      </div>
    </div>
  );
}
