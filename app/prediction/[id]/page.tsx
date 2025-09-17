import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PredictionEmbed from './PredictionEmbed';

interface PredictionPageProps {
  params: Promise<{
    id: string;
  }>;
}

// Generate metadata for social sharing
export async function generateMetadata({ params }: PredictionPageProps): Promise<Metadata> {
  const { id: predictionId } = await params;
  
  try {
    // Fetch prediction data
    const response = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/predictions/${predictionId}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      return {
        title: 'Prediction Market - Dexter',
        description: 'Join the prediction market and stake on future events!'
      };
    }
    
    const prediction = await response.json();
    
    return {
      title: `🔮 ${prediction.question} - Dexter Prediction Market`,
      description: `Stake your prediction: ${prediction.question}. Current stakes: ${prediction.yesTotalAmount || 0} ETH (YES) vs ${prediction.noTotalAmount || 0} ETH (NO). Join the game!`,
      openGraph: {
        title: `🔮 ${prediction.question}`,
        description: `Stake your prediction on this future event. Current stakes: ${prediction.yesTotalAmount || 0} ETH (YES) vs ${prediction.noTotalAmount || 0} ETH (NO).`,
        images: [
          {
            url: prediction.imageUrl || '/hero.png',
            width: 1200,
            height: 630,
            alt: prediction.question
          }
        ],
        url: `${process.env.NEXT_PUBLIC_URL}/prediction/${predictionId}`,
        siteName: 'Dexter Prediction Market',
        type: 'website'
      },
      twitter: {
        card: 'summary_large_image',
        title: `🔮 ${prediction.question}`,
        description: `Stake your prediction on this future event. Current stakes: ${prediction.yesTotalAmount || 0} ETH (YES) vs ${prediction.noTotalAmount || 0} ETH (NO).`,
        images: [prediction.imageUrl || '/hero.png']
      }
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
      return {
        title: 'Prediction Market - Dexter',
        description: 'Join the prediction market and stake on future events!'
      };
  }
}

export default async function PredictionPage({ params }: PredictionPageProps) {
  const { id: predictionId } = await params;
  
  try {
    // Fetch prediction data
    const response = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/predictions/${predictionId}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      notFound();
    }
    
    const prediction = await response.json();
    
    return <PredictionEmbed prediction={prediction} />;
  } catch (error) {
    console.error('Error fetching prediction:', error);
    notFound();
  }
}
