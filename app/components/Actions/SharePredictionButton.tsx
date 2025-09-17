import { useComposeCast } from '@coinbase/onchainkit/minikit';
import { useState } from 'react';

interface PredictionData {
  id: string;
  question: string;
  category: string;
  stake?: number;
  outcome?: string;
  deadline?: string;
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
  const { composeCast } = useComposeCast();
  const [isSharing, setIsSharing] = useState(false);

  const handleSharePrediction = async () => {
    if (isSharing) return;
    
    setIsSharing(true);
    
    try {
      // Create engaging share text based on prediction data
      let shareText = `🔮 I predict: ${prediction.question}`;
      
      if (prediction.stake) {
        shareText += `\n💰 Stake: ${prediction.stake} ETH`;
      }
      
      if (prediction.outcome) {
        shareText += `\n📊 Prediction: ${prediction.outcome}`;
      }
      
      shareText += `\n\nJoin the game and create your own prediction! 🎯`;
      
      // Create app URL (just main app, no specific prediction page)
      const appUrl = window.location.origin;
      
      await composeCast({
        text: shareText,
        embeds: [appUrl]
      });
      
      onShare?.();
    } catch (error) {
      console.error('Błąd podczas udostępniania predykcji:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareAchievement = async () => {
    if (isSharing) return;
    
    setIsSharing(true);
    
    try {
      const shareText = `🎉 I just staked on: ${prediction.question}\n\nStake: ${prediction.stake} ETH\n\nDo you dare predict the future? 🔮`;
      
      const appUrl = window.location.origin;
      
      await composeCast({
        text: shareText,
        embeds: [appUrl]
      });
      
      onShare?.();
    } catch (error) {
      console.error('Błąd podczas udostępniania osiągnięcia:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareChallenge = async () => {
    if (isSharing) return;
    
    setIsSharing(true);
    
    try {
      const shareText = `🏆 Challenge: Can you predict: ${prediction.question}?\n\nStake: ${prediction.stake} ETH\n\nTry to beat my prediction! 🎯`;
      
      const appUrl = window.location.origin;
      
      await composeCast({
        text: shareText,
        embeds: [appUrl]
      });
      
      onShare?.();
    } catch (error) {
      console.error('Błąd podczas udostępniania wyzwania:', error);
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

// Hook for easy integration
export function useSharePrediction() {
  const { composeCast } = useComposeCast();
  
  const sharePrediction = async (prediction: PredictionData, type: 'prediction' | 'achievement' | 'challenge' = 'prediction') => {
    let shareText = '';
    
    switch (type) {
      case 'achievement':
        shareText = `🎉 Właśnie postawiłem na: ${prediction.question}\n\nStawka: ${prediction.stake} ETH\n\nCzy masz odwagę przewidzieć przyszłość? 🔮`;
        break;
      case 'challenge':
        shareText = `🏆 Wyzwanie: Czy potrafisz przewidzieć: ${prediction.question}?\n\nStawka: ${prediction.stake} ETH\n\nSpróbuj pobić moją prognozę! 🎯`;
        break;
      default:
        shareText = `🔮 Prognozuję: ${prediction.question}\n💰 Stawka: ${prediction.stake} ETH\n\nDołącz do gry i stwórz własną prognozę! 🎯`;
    }
    
    const appUrl = `${window.location.origin}/prediction/${prediction.id}`;
    
    await composeCast({
      text: shareText,
      embeds: [appUrl]
    });
  };
  
  return { sharePrediction };
}
