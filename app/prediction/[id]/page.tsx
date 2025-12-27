"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Users, TrendingUp, Share2 } from "lucide-react";
import sdk from "@farcaster/miniapp-sdk";
import { useComposeCast } from "@coinbase/onchainkit/minikit";
import type { RedisPrediction } from "@/lib/types/redis";

export default function PredictionPage() {
  const params = useParams();
  const router = useRouter();
  const predictionId = params.id as string;
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { address } = useAccount();
  const { composeCast: minikitComposeCast } = useComposeCast();
  
  const [prediction, setPrediction] = useState<RedisPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  useEffect(() => {
    const fetchPrediction = async () => {
      if (!predictionId) return;
      
      try {
        setLoading(true);
        const response = await fetch(`/api/predictions/${predictionId}`);
        
        if (!response.ok) {
          throw new Error('Prediction not found');
        }
        
        const data = await response.json();
        if (data.success && data.prediction) {
          setPrediction(data.prediction);
        } else {
          throw new Error(data.error || 'Failed to load prediction');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchPrediction();
  }, [predictionId]);

  const handleShare = async () => {
    if (isSharing || !prediction) return;
    
    setIsSharing(true);
    
    try {
      const appUrl = `${window.location.origin}/prediction/${prediction.id}`;
      const totalPoolETH = ((prediction.yesTotalAmount || 0) + (prediction.noTotalAmount || 0)) / 1e18;
      const shareText = `🔮 Check out this prediction: ${prediction.question}\n\n📊 Total Pool: ${totalPoolETH.toFixed(4)} ETH\n\nJoin and make your prediction! 🎯`;
      
      // Try MiniKit first (Base app)
      try {
        if (minikitComposeCast) {
          await minikitComposeCast({
            text: shareText,
            embeds: [appUrl] as [string]
          });
          return;
        }
      } catch (e) {
        console.log('MiniKit composeCast failed, trying SDK...', e);
      }
      
      // Fallback to Farcaster SDK
      await sdk.actions.composeCast({
        text: shareText,
        embeds: [appUrl]
      });
    } catch (error) {
      console.error('Error sharing prediction:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleGoBack = () => {
    router.push('/');
  };

  const handleOpenInApp = () => {
    // Redirect to main app with prediction context - this will scroll to specific prediction
    router.push(`/?prediction=${predictionId}`);
  };

  const formatTimeLeft = (deadline: number) => {
    const now = Date.now();
    const diff = deadline * 1000 - now;
    
    if (diff <= 0) return 'Ended';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Format large SWIPE numbers
  const formatSwipeAmount = (amount: number): string => {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (amount >= 1000) {
      return (amount / 1000).toFixed(0) + 'K';
    }
    return amount.toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#d4ff00]">
        <div className="w-full max-w-[424px] mx-auto px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-black border-t-transparent"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="flex flex-col min-h-screen bg-[#d4ff00]">
        <div className="w-full max-w-[424px] mx-auto px-4 py-6">
          <div className="p-6 bg-black/90 border border-red-500/30 rounded-xl">
            <h2 className="text-xl font-bold text-red-500 mb-2">Prediction Not Found</h2>
            <p className="text-gray-400 mb-4">{error || 'This prediction does not exist.'}</p>
            <Button onClick={handleGoBack} className="bg-[#d4ff00] text-black hover:bg-[#c4ef00]">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Convert from wei to readable values
  const yesETH = (prediction.yesTotalAmount || 0) / 1e18;
  const noETH = (prediction.noTotalAmount || 0) / 1e18;
  const totalPoolETH = yesETH + noETH;
  
  const yesSWIPE = (prediction.swipeYesTotalAmount || 0) / 1e18;
  const noSWIPE = (prediction.swipeNoTotalAmount || 0) / 1e18;
  const totalPoolSWIPE = yesSWIPE + noSWIPE;
  
  const yesPercentage = totalPoolETH > 0 ? (yesETH / totalPoolETH) * 100 : 50;
  const noPercentage = totalPoolETH > 0 ? (noETH / totalPoolETH) * 100 : 50;
  
  const swipeYesPercentage = totalPoolSWIPE > 0 ? (yesSWIPE / totalPoolSWIPE) * 100 : 50;
  const swipeNoPercentage = totalPoolSWIPE > 0 ? (noSWIPE / totalPoolSWIPE) * 100 : 50;

  return (
    <div 
      className="flex flex-col min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ 
        backgroundImage: prediction.imageUrl 
          ? `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.8)), url(${prediction.imageUrl})`
          : 'linear-gradient(to bottom, #1a1a1a, #0a0a0a)',
        backgroundColor: '#0a0a0a'
      }}
    >
      <div className="w-full max-w-[424px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleGoBack}
            className="text-[#d4ff00] hover:bg-[#d4ff00]/10 bg-black/40 backdrop-blur-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            disabled={isSharing}
            className="border-[#d4ff00]/30 text-[#d4ff00] hover:bg-[#d4ff00]/10 bg-black/40 backdrop-blur-sm"
          >
            <Share2 className="w-4 h-4 mr-2" />
            {isSharing ? 'Sharing...' : 'Share'}
          </Button>
        </div>

        {/* Category & Status Badges */}
        <div className="flex items-center gap-2 mb-4">
          <Badge className="bg-[#d4ff00] text-black font-bold">
            {prediction.category}
          </Badge>
          
          {prediction.resolved && (
            <Badge className={`${prediction.outcome ? 'bg-green-500' : 'bg-red-500'} text-white font-bold`}>
              {prediction.outcome ? 'YES Won' : 'NO Won'}
            </Badge>
          )}
        </div>

        {/* Main Card */}
        <div className="bg-black/80 backdrop-blur-md border border-[#d4ff00]/20 rounded-2xl overflow-hidden">
          {/* Question */}
          <div className="p-5">
            <h1 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: '"Spicy Rice", cursive' }}>
              {prediction.question}
            </h1>
            
            {prediction.description && (
              <p className="text-gray-300 text-sm mb-4 leading-relaxed">
                {prediction.description}
              </p>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-black/50 rounded-xl p-3 text-center border border-zinc-700/50">
                <Clock className="w-5 h-5 text-[#d4ff00] mx-auto mb-1" />
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Time Left</p>
                <p className="text-sm font-bold text-white">{formatTimeLeft(prediction.deadline)}</p>
              </div>
              
              <div className="bg-black/50 rounded-xl p-3 text-center border border-zinc-700/50">
                <Users className="w-5 h-5 text-[#d4ff00] mx-auto mb-1" />
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Participants</p>
                <p className="text-sm font-bold text-white">{prediction.participants?.length || 0}</p>
              </div>
              
              <div className="bg-black/50 rounded-xl p-3 text-center border border-zinc-700/50">
                <TrendingUp className="w-5 h-5 text-[#d4ff00] mx-auto mb-1" />
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total Pool</p>
                <p className="text-sm font-bold text-[#d4ff00]">{totalPoolETH.toFixed(4)} ETH</p>
              </div>
            </div>

            {/* ETH Pool Section */}
            <div className="bg-black/60 rounded-xl p-4 mb-4 border border-zinc-700/50">
              <div className="flex items-center gap-2 mb-3">
                <img src="/Ethereum-icon-purple.svg" alt="ETH" className="w-5 h-5" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">ETH Pool</span>
                <span className="text-xs text-[#d4ff00] ml-auto font-bold">{totalPoolETH.toFixed(5)} ETH</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="text-center">
                  <p className="text-xs text-gray-400">YES</p>
                  <p className="text-lg font-bold text-emerald-400">{yesETH.toFixed(5)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">NO</p>
                  <p className="text-lg font-bold text-rose-400">{noETH.toFixed(5)}</p>
                </div>
              </div>
              
              {/* ETH Odds Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-emerald-400 font-bold">YES {yesPercentage.toFixed(1)}%</span>
                  <span className="text-rose-400 font-bold">NO {noPercentage.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 bg-rose-500 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${yesPercentage}%` }}
                  />
                </div>
              </div>
            </div>

            {/* SWIPE Pool Section */}
            <div className="bg-black/60 rounded-xl p-4 mb-4 border border-[#d4ff00]/30">
              <div className="flex items-center gap-2 mb-3">
                <img src="/icon.png" alt="SWIPE" className="w-5 h-5" />
                <span className="text-xs font-bold text-[#d4ff00] uppercase tracking-wider">SWIPE Pool</span>
                <span className="text-xs text-[#d4ff00] ml-auto font-bold">{formatSwipeAmount(totalPoolSWIPE)}</span>
              </div>
              
              {totalPoolSWIPE > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="text-center">
                      <p className="text-xs text-gray-400">YES</p>
                      <p className="text-lg font-bold text-emerald-400">{formatSwipeAmount(yesSWIPE)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400">NO</p>
                      <p className="text-lg font-bold text-rose-400">{formatSwipeAmount(noSWIPE)}</p>
                    </div>
                  </div>
                  
                  {/* SWIPE Odds Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-emerald-400 font-bold">YES {swipeYesPercentage.toFixed(1)}%</span>
                      <span className="text-rose-400 font-bold">NO {swipeNoPercentage.toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 bg-rose-500 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${swipeYesPercentage}%` }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-center text-zinc-500 text-sm py-2">No SWIPE stakes yet</p>
              )}
            </div>

            {/* CTA Button */}
            <Button 
              onClick={handleOpenInApp}
              className="w-full bg-[#d4ff00] text-black font-bold hover:bg-[#c4ef00] py-6 text-lg rounded-xl"
              style={{ fontFamily: '"Spicy Rice", cursive' }}
            >
              {prediction.resolved ? 'View Results' : 'Place Your Bet'}
            </Button>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-4 text-center">
          <p className="text-xs text-white/60">
            Prediction ID: {prediction.id}
          </p>
        </div>
      </div>
    </div>
  );
}
