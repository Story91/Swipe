"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import "./SharePreviewModal.css";

interface SharePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  prediction: {
    id: string;
    question: string;
    category: string;
    totalPoolETH?: number;
    participantsCount?: number;
    imageUrl?: string;
    yesPercentage?: number;
    noPercentage?: number;
  };
  shareText: string;
  shareUrl: string;
  onShare: () => Promise<void>;
  stakeInfo?: {
    amount: number;
    token: 'ETH' | 'SWIPE';
    isYes: boolean;
  };
}

export function SharePreviewModal({
  isOpen,
  onClose,
  prediction,
  shareText,
  shareUrl,
  onShare,
  stakeInfo
}: SharePreviewModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleOpenFarcaster = async () => {
    try {
      await onShare();
      onClose();
    } catch {
      // Fallback to Warpcast web compose
      const encodedText = encodeURIComponent(`${shareText}\n\n${shareUrl}`);
      window.open(`https://warpcast.com/~/compose?text=${encodedText}`, '_blank');
      onClose();
    }
  };

  const handleOpenTwitter = () => {
    const encodedText = encodeURIComponent(`${shareText}`);
    const encodedUrl = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, '_blank');
    onClose();
  };

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className="share-modal-close" onClick={onClose}>✕</button>

        {/* Title */}
        <h2 className="share-modal-title">Share Prediction</h2>
        
        {/* Prediction Question */}
        <p className="share-modal-question">"{prediction.question.length > 60 ? prediction.question.slice(0, 60) + '...' : prediction.question}"</p>

        {/* Stake Info if available */}
        {stakeInfo && (
          <div className={`share-modal-stake ${stakeInfo.isYes ? 'share-modal-stake-yes' : 'share-modal-stake-no'}`}>
            <span className="share-modal-stake-label">Your Bet:</span>
            <span className="share-modal-stake-value">
              {stakeInfo.token === 'SWIPE' 
                ? (stakeInfo.amount >= 1000000 
                    ? `${(stakeInfo.amount / 1000000).toFixed(1)}M` 
                    : stakeInfo.amount >= 1000 
                      ? `${(stakeInfo.amount / 1000).toFixed(0)}K`
                      : stakeInfo.amount.toFixed(0))
                : stakeInfo.amount
              } {stakeInfo.token}
            </span>
            <span className={`share-modal-stake-side ${stakeInfo.isYes ? 'yes' : 'no'}`}>
              {stakeInfo.isYes ? 'YES' : 'NO'}
            </span>
          </div>
        )}

        {/* Share buttons */}
        <div className="share-modal-buttons">
          {/* Farcaster + Base button - split color design */}
          <button onClick={handleOpenFarcaster} className="share-modal-btn share-modal-btn-farcaster-base">
            <div className="share-btn-split-bg">
              <div className="share-btn-half-purple"></div>
              <div className="share-btn-half-white"></div>
            </div>
            <div className="share-btn-icons">
              <div className="share-btn-icon-left">
                <img src="/farc.png" alt="Farcaster" className="share-modal-btn-icon" />
              </div>
              <div className="share-btn-icon-right">
                <img src="/Base_square_blue.png" alt="Base" className="share-modal-btn-icon" />
              </div>
            </div>
          </button>
          
          {/* X/Twitter button - just logo */}
          <button onClick={handleOpenTwitter} className="share-modal-btn share-modal-btn-twitter">
            <svg className="share-modal-btn-icon-x" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </button>
        </div>

        {/* Copy link */}
        <button onClick={handleCopy} className="share-modal-copy">
          {copied ? <Check className="share-modal-copy-icon" /> : <Copy className="share-modal-copy-icon" />}
          <span>{copied ? 'Copied!' : 'Copy link'}</span>
        </button>

        {/* Close link */}
        <button onClick={onClose} className="share-modal-close-link">
          Close
        </button>
      </div>
    </div>
  );
}
