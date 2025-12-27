"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Copy, Check, X } from "lucide-react";

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
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const handleOpenFarcaster = async () => {
    // Try SDK first, fallback to Warpcast web
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

  const yesPercentage = prediction.yesPercentage ?? 50;
  const noPercentage = prediction.noPercentage ?? 50;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 border-zinc-700/50 text-white p-0 gap-0 overflow-hidden max-h-[90vh]">
        {/* Minimal Header - just close button */}
        <div className="flex justify-end p-2 border-b border-zinc-800/50">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-700/50 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[65vh]">
          {/* Cast Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Cast Preview</span>
              <button
                onClick={handleCopyText}
                className="flex items-center gap-1.5 text-xs text-[#0ea5e9] hover:text-[#38bdf8] transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            
            <Card className="bg-zinc-800/50 border-zinc-700/50 p-3">
              <pre className="text-sm text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">
                {shareText}
              </pre>
            </Card>
          </div>

          {/* Link Preview (OG Card simulation) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Link Preview</span>
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1.5 text-xs text-[#0ea5e9] hover:text-[#38bdf8] transition-colors"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedUrl ? 'Copied!' : 'Copy'}
              </button>
            </div>
            
            {/* Simulated OG Card */}
            <Card className="bg-zinc-800/80 border-zinc-600/50 overflow-hidden">
              <div className="relative bg-gradient-to-br from-zinc-900 to-black p-3">
                {/* Mini header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#d4ff00] font-bold text-xs">🔮 SWIPE</span>
                  <Badge className={`text-[9px] px-1.5 py-0 ${
                    stakeInfo?.isYes !== undefined
                      ? (stakeInfo.isYes ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')
                      : 'bg-[#d4ff00]/20 text-[#d4ff00]'
                  }`}>
                    {stakeInfo ? (stakeInfo.isYes ? 'YES' : 'NO') : prediction.category}
                  </Badge>
                </div>
                
                {/* Question */}
                <h3 className="text-white font-bold text-xs mb-2 line-clamp-2">
                  {prediction.question}
                </h3>
                
                {/* Stats row */}
                <div className="flex items-center gap-3 text-[9px] text-zinc-400 mb-2">
                  {prediction.totalPoolETH !== undefined && prediction.totalPoolETH > 0 && (
                    <span>💰 {prediction.totalPoolETH.toFixed(4)} ETH</span>
                  )}
                  {prediction.participantsCount !== undefined && prediction.participantsCount > 0 && (
                    <span>👥 {prediction.participantsCount}</span>
                  )}
                </div>
                
                {/* Odds bar */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[9px]">
                    <span className="text-emerald-400">YES {yesPercentage.toFixed(0)}%</span>
                    <span className="text-rose-400">NO {noPercentage.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-rose-500/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${yesPercentage}%` }} 
                    />
                  </div>
                </div>
                
                {/* Stake info if available */}
                {stakeInfo && (
                  <div className={`mt-2 p-1.5 rounded ${stakeInfo.isYes ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                    <div className="flex items-center justify-between text-[9px]">
                      <span className={stakeInfo.isYes ? 'text-emerald-400' : 'text-rose-400'}>
                        My Bet
                      </span>
                      <span className="text-white font-bold">
                        {stakeInfo.token === 'SWIPE' 
                          ? (stakeInfo.amount >= 1000000 
                              ? `${(stakeInfo.amount / 1000000).toFixed(1)}M` 
                              : stakeInfo.amount >= 1000 
                                ? `${(stakeInfo.amount / 1000).toFixed(0)}K`
                                : stakeInfo.amount.toFixed(0))
                          : stakeInfo.amount
                        } {stakeInfo.token}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* URL bar */}
              <div className="px-2 py-1.5 bg-zinc-900/50 border-t border-zinc-700/30">
                <span className="text-[9px] text-zinc-500 truncate block">
                  {shareUrl}
                </span>
              </div>
            </Card>
          </div>

          {/* Share Buttons - Farcaster/Base and X */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Farcaster / Base */}
            <button
              onClick={handleOpenFarcaster}
              className="flex items-center justify-center gap-2 p-3 rounded-xl bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 hover:border-purple-500/50 transition-all"
            >
              <img src="/farc.png" alt="Farcaster" className="w-5 h-5" />
              <img src="/Base_square_blue.png" alt="Base" className="w-5 h-5" />
            </button>
            
            {/* Twitter/X */}
            <button
              onClick={handleOpenTwitter}
              className="flex items-center justify-center gap-2 p-3 rounded-xl bg-zinc-700/30 border border-zinc-600/30 hover:bg-zinc-700/50 hover:border-zinc-500/50 transition-all"
            >
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

