import { useComposeCast } from '@coinbase/onchainkit/minikit';
import { useState, useCallback } from 'react';
import sdk from '@farcaster/miniapp-sdk';

interface PredictionData {
  id: string;
  question: string;
  category: string;
  stake?: number;
  outcome?: string;
  deadline?: string;
  yesTotalAmount?: number;
  noTotalAmount?: number;
  participants?: string[];
}

interface SharePredictionButtonProps {
  prediction: PredictionData;
  onShare?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export default function SharePredictionButton({ 
  prediction, 
  onShare,
  className = "",
  children 
}: SharePredictionButtonProps) {
  const { composeCast: minikitComposeCast } = useComposeCast();
  const [isSharing, setIsSharing] = useState(false);

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

  // Get unique prediction URL for sharing
  const getPredictionUrl = () => {
    return `${window.location.origin}/prediction/${prediction.id}`;
  };

  // Calculate pool stats
  const getTotalPool = () => {
    const yes = prediction.yesTotalAmount || 0;
    const no = prediction.noTotalAmount || 0;
    return (yes + no).toFixed(4);
  };

  const handleSharePrediction = async () => {
    if (isSharing) return;
    
    setIsSharing(true);
    
    try {
      // Create engaging share text with unique prediction URL
      let shareText = `🔮 Check this prediction: ${prediction.question}`;
      
      const totalPool = getTotalPool();
      if (parseFloat(totalPool) > 0) {
        shareText += `\n💰 Pool: ${totalPool} ETH`;
      }
      
      if (prediction.participants && prediction.participants.length > 0) {
        shareText += `\n👥 ${prediction.participants.length} participants`;
      }
      
      shareText += `\n\nJoin and make your prediction! 🎯`;
      
      // Use unique prediction URL - will show custom OG image
      const predictionUrl = getPredictionUrl();
      
      await composeCast({
        text: shareText,
        embeds: [predictionUrl]
      });
      
      onShare?.();
    } catch (error) {
      console.error('Error sharing prediction:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareAchievement = async () => {
    if (isSharing) return;
    
    setIsSharing(true);
    
    try {
      let shareText = `🎉 I just staked on: ${prediction.question}`;
      
      if (prediction.stake) {
        shareText += `\n\n💰 My stake: ${prediction.stake} ETH`;
      }
      
      shareText += `\n\nDo you dare predict the future? 🔮`;
      
      // Use unique prediction URL
      const predictionUrl = getPredictionUrl();
      
      await composeCast({
        text: shareText,
        embeds: [predictionUrl]
      });
      
      onShare?.();
    } catch (error) {
      console.error('Error sharing achievement:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareChallenge = async () => {
    if (isSharing) return;
    
    setIsSharing(true);
    
    try {
      let shareText = `🏆 Challenge: Can you predict this?`;
      shareText += `\n\n${prediction.question}`;
      
      const totalPool = getTotalPool();
      if (parseFloat(totalPool) > 0) {
        shareText += `\n\n💰 Current pool: ${totalPool} ETH`;
      }
      
      shareText += `\n\nTry to beat my prediction! 🎯`;
      
      // Use unique prediction URL
      const predictionUrl = getPredictionUrl();
      
      await composeCast({
        text: shareText,
        embeds: [predictionUrl]
      });
      
      onShare?.();
    } catch (error) {
      console.error('Error sharing challenge:', error);
    } finally {
      setIsSharing(false);
    }
  };

  if (children) {
    return (
      <div 
        className={`share-prediction-wrapper ${className}`}
        onClick={handleSharePrediction}
        style={{ cursor: isSharing ? 'wait' : 'pointer' }}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={`share-prediction-buttons ${className}`}>
      <button 
        onClick={handleSharePrediction}
        disabled={isSharing}
        className="share-btn share-prediction"
      >
        {isSharing ? 'Sharing...' : '🔮 Share Prediction'}
      </button>
      
      <button 
        onClick={handleShareAchievement}
        disabled={isSharing}
        className="share-btn share-achievement"
      >
        {isSharing ? 'Sharing...' : '🎉 Share Achievement'}
      </button>
      
      <button 
        onClick={handleShareChallenge}
        disabled={isSharing}
        className="share-btn share-challenge"
      >
        {isSharing ? 'Sharing...' : '🏆 Challenge Friends'}
      </button>
    </div>
  );
}

// Hook for easy integration with unique prediction URLs
export function useSharePrediction() {
  const { composeCast: minikitComposeCast } = useComposeCast();
  
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
  
  const sharePrediction = async (prediction: PredictionData, type: 'prediction' | 'achievement' | 'challenge' = 'prediction') => {
    // Unique prediction URL - will show custom OG image when shared
    const predictionUrl = `${window.location.origin}/prediction/${prediction.id}`;
    
    let shareText = '';
    
    switch (type) {
      case 'achievement':
        shareText = `🎉 I just staked on: ${prediction.question}`;
        if (prediction.stake) {
          shareText += `\n\n💰 My stake: ${prediction.stake} ETH`;
        }
        shareText += `\n\nDo you dare predict the future? 🔮`;
        break;
      case 'challenge':
        shareText = `🏆 Challenge: Can you predict this?\n\n${prediction.question}`;
        if (prediction.stake) {
          shareText += `\n\n💰 Current stake: ${prediction.stake} ETH`;
        }
        shareText += `\n\nTry to beat my prediction! 🎯`;
        break;
      default:
        shareText = `🔮 Check this prediction: ${prediction.question}`;
        if (prediction.stake) {
          shareText += `\n💰 Pool: ${prediction.stake} ETH`;
        }
        shareText += `\n\nJoin and make your prediction! 🎯`;
    }
    
    await composeCast({
      text: shareText,
      embeds: [predictionUrl]
    });
  };
  
  return { sharePrediction };
}
