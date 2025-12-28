"use client";

import { useState, useCallback } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import sdk from '@farcaster/miniapp-sdk';
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
    includeChart?: boolean;
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
  const [isGeneratingOG, setIsGeneratingOG] = useState(false);
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null);

  // Check if this is a crypto prediction that needs OG image generation
  const isCryptoPrediction = prediction.includeChart || 
    prediction.imageUrl?.includes('geckoterminal.com');

  // Generate OG image and upload to ImgBB for crypto predictions
  const generateOgImage = useCallback(async (): Promise<string | null> => {
    if (!isCryptoPrediction) return null;
    if (ogImageUrl) return ogImageUrl; // Already generated
    
    setIsGeneratingOG(true);
    try {
      console.log('📸 Generating OG image for crypto prediction:', prediction.id);
      
      const response = await fetch(`/api/og/upload/${prediction.id}`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        console.error('Failed to generate OG image:', response.status);
        return null;
      }
      
      const data = await response.json();
      console.log('✅ OG image generated:', data.url);
      setOgImageUrl(data.url);
      return data.url;
    } catch (error) {
      console.error('Error generating OG image:', error);
      return null;
    } finally {
      setIsGeneratingOG(false);
    }
  }, [isCryptoPrediction, ogImageUrl, prediction.id]);

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
    // For crypto predictions, generate OG image first
    if (isCryptoPrediction) {
      await generateOgImage();
    }
    
    try {
      await onShare();
      onClose();
    } catch (error) {
      console.log('onShare failed, trying fallback...', error);
      // Try Farcaster SDK openUrl with Warpcast compose URL
      const encodedText = encodeURIComponent(`${shareText}\n\n${shareUrl}`);
      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodedText}`;
      
      try {
        // Use SDK openUrl for better compatibility in Base app
        await sdk.actions.openUrl(warpcastUrl);
      } catch (sdkError) {
        console.log('SDK openUrl failed, using window.open...', sdkError);
        window.open(warpcastUrl, '_blank');
      }
      onClose();
    }
  };

  const handleOpenTwitter = async () => {
    // For crypto predictions, generate OG image first so Twitter can fetch it
    if (isCryptoPrediction) {
      const generatedUrl = await generateOgImage();
      if (generatedUrl) {
        console.log('📸 Using generated OG image for Twitter:', generatedUrl);
      }
    }
    
    const encodedText = encodeURIComponent(`${shareText}`);
    const encodedUrl = encodeURIComponent(shareUrl);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    
    try {
      // Use SDK openUrl for better compatibility in Base app
      await sdk.actions.openUrl(twitterUrl);
    } catch (sdkError) {
      console.log('SDK openUrl failed, using window.open...', sdkError);
      window.open(twitterUrl, '_blank');
    }
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

        {/* Loading indicator for OG image generation */}
        {isGeneratingOG && (
          <div className="share-modal-loading">
            <Loader2 className="share-modal-loading-icon" />
            <span>Generating preview...</span>
          </div>
        )}

        {/* Share buttons */}
        <div className="share-modal-buttons">
          {/* Farcaster + Base button - split color design */}
          <button 
            onClick={handleOpenFarcaster} 
            className="share-modal-btn share-modal-btn-farcaster-base"
            disabled={isGeneratingOG}
          >
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
          <button 
            onClick={handleOpenTwitter} 
            className="share-modal-btn share-modal-btn-twitter"
            disabled={isGeneratingOG}
          >
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
