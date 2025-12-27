"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
      const shareText = `🔮 Check out this prediction: ${prediction.question}\n\n📊 Total Pool: ${(prediction.yesTotalAmount + prediction.noTotalAmount).toFixed(4)} ETH\n\nJoin and make your prediction! 🎯`;
      
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
        embeds: [{ url: appUrl }]
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
    // Redirect to main app with prediction context
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

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
        <div className="w-full max-w-[424px] mx-auto px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#d4ff00] border-t-transparent"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
        <div className="w-full max-w-[424px] mx-auto px-4 py-6">
          <Card className="p-6 bg-black/80 border-red-500/30">
            <h2 className="text-xl font-bold text-red-500 mb-2">Prediction Not Found</h2>
            <p className="text-gray-400 mb-4">{error || 'This prediction does not exist.'}</p>
            <Button onClick={handleGoBack} className="bg-[#d4ff00] text-black hover:bg-[#c4ef00]">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const totalPool = prediction.yesTotalAmount + prediction.noTotalAmount;
  const yesPercentage = totalPool > 0 ? (prediction.yesTotalAmount / totalPool) * 100 : 50;
  const noPercentage = totalPool > 0 ? (prediction.noTotalAmount / totalPool) * 100 : 50;

  return (
    <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
      <div className="w-full max-w-[424px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleGoBack}
            className="text-[#d4ff00] hover:bg-[#d4ff00]/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            disabled={isSharing}
            className="border-[#d4ff00]/30 text-[#d4ff00] hover:bg-[#d4ff00]/10"
          >
            <Share2 className="w-4 h-4 mr-2" />
            {isSharing ? 'Sharing...' : 'Share'}
          </Button>
        </div>

        {/* Prediction Card */}
        <Card className="overflow-hidden bg-black/80 border-[#d4ff00]/20">
          {/* Image */}
          {prediction.imageUrl && (
            <div className="relative h-48 overflow-hidden">
              <img 
                src={prediction.imageUrl} 
                alt={prediction.question}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              
              {/* Category Badge */}
              <Badge className="absolute top-3 left-3 bg-[#d4ff00] text-black font-bold">
                {prediction.category}
              </Badge>
              
              {/* Status Badge */}
              {prediction.resolved && (
                <Badge className={`absolute top-3 right-3 ${prediction.outcome ? 'bg-green-500' : 'bg-red-500'} text-white font-bold`}>
                  {prediction.outcome ? 'YES Won' : 'NO Won'}
                </Badge>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-4">
            <h1 className="text-xl font-bold text-white mb-3" style={{ fontFamily: '"Spicy Rice", cursive' }}>
              {prediction.question}
            </h1>
            
            {prediction.description && (
              <p className="text-gray-400 text-sm mb-4">
                {prediction.description}
              </p>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-black/50 rounded-lg p-3 text-center">
                <Clock className="w-4 h-4 text-[#d4ff00] mx-auto mb-1" />
                <p className="text-xs text-gray-400">Time Left</p>
                <p className="text-sm font-bold text-white">{formatTimeLeft(prediction.deadline)}</p>
              </div>
              
              <div className="bg-black/50 rounded-lg p-3 text-center">
                <Users className="w-4 h-4 text-[#d4ff00] mx-auto mb-1" />
                <p className="text-xs text-gray-400">Participants</p>
                <p className="text-sm font-bold text-white">{prediction.participants?.length || 0}</p>
              </div>
              
              <div className="bg-black/50 rounded-lg p-3 text-center">
                <TrendingUp className="w-4 h-4 text-[#d4ff00] mx-auto mb-1" />
                <p className="text-xs text-gray-400">Total Pool</p>
                <p className="text-sm font-bold text-white">{totalPool.toFixed(4)} ETH</p>
              </div>
            </div>

            {/* Odds Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-green-400 font-bold">YES {yesPercentage.toFixed(1)}%</span>
                <span className="text-red-400 font-bold">NO {noPercentage.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-green-400"
                  style={{ width: `${yesPercentage}%` }}
                />
              </div>
            </div>

            {/* CTA Button */}
            <Button 
              onClick={handleOpenInApp}
              className="w-full bg-[#d4ff00] text-black font-bold hover:bg-[#c4ef00] py-6 text-lg"
              style={{ fontFamily: '"Spicy Rice", cursive' }}
            >
              {prediction.resolved ? 'View Results' : 'Place Your Bet'}
            </Button>
          </div>
        </Card>

        {/* Footer info */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Prediction ID: {prediction.id.slice(0, 8)}...{prediction.id.slice(-6)}
          </p>
        </div>
      </div>
    </div>
  );
}

