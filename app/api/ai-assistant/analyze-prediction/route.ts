import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

interface PredictionAnalysisRequest {
  predictionId: string;
  question: string;
  description: string;
  category: string;
  yesPercentage: number;
  noPercentage: number;
  totalPoolETH: number;
  totalPoolSWIPE: number;
  participantsCount: number;
  deadline: number; // Unix timestamp
  selectedCrypto?: string; // For crypto predictions with charts
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body: PredictionAnalysisRequest = await request.json();
    const {
      predictionId,
      question,
      description,
      category,
      yesPercentage,
      noPercentage,
      totalPoolETH,
      totalPoolSWIPE,
      participantsCount,
      deadline,
      selectedCrypto
    } = body;

    // Validate required fields
    if (!question) {
      return NextResponse.json(
        { success: false, error: 'Prediction question is required' },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey });

    // Calculate time left
    const now = Math.floor(Date.now() / 1000);
    const timeLeftSeconds = deadline - now;
    const timeLeftHours = Math.max(0, Math.floor(timeLeftSeconds / 3600));
    const timeLeftDays = Math.floor(timeLeftHours / 24);

    // Calculate potential payouts
    const yesOdds = yesPercentage > 0 ? (100 / yesPercentage).toFixed(2) : '∞';
    const noOdds = noPercentage > 0 ? (100 / noPercentage).toFixed(2) : '∞';

    // Build context for AI
    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create analysis prompt - CONCISE version
    // NOTE: We generate RECOMMENDATION ourselves based on probability, so AI doesn't need to include it
    const analysisPrompt = `You are Swiper, an AI analyst for prediction markets. Be CONCISE - max 2-3 sentences per section.

PREDICTION: "${question}"
Category: ${category} | Current Market: YES ${yesPercentage.toFixed(0)}% / NO ${noPercentage.toFixed(0)}%
Pool: ${totalPoolETH.toFixed(4)} ETH | Time left: ${timeLeftDays > 0 ? `${timeLeftDays}d` : `${timeLeftHours}h`}
${selectedCrypto ? `Crypto: ${selectedCrypto}` : ''}

TODAY: ${currentDate}

IMPORTANT: Your probability estimate should be YOUR OWN analysis, not just copying the market votes.
If market says 90% YES but you think it should be 60% YES, say 60%.

RESPOND IN THIS EXACT FORMAT (keep it SHORT):

📊 **ANALYSIS**
[2 sentences max - what's happening, key factors]

🎯 **AI PROBABILITY**
YES: [X]% | NO: [Y]%

💰 **VALUE**
[1 sentence - which side is undervalued based on YOUR probability vs market?]

⚠️ **RISKS**
[1-2 bullet points max]`;

    // Use standard Chat Completions API
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are Swiper, a prediction market AI. Be VERY CONCISE. Max 2-3 sentences per section. No long explanations."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ],
      max_tokens: 350,
      temperature: 0.7
    });

    const analysisText = response.choices[0]?.message?.content || 'Unable to generate analysis. Please try again.';

    // Extract AI probability FIRST
    let aiYesProbability: number | null = null;
    let aiNoProbability: number | null = null;
    const probMatch = analysisText.match(/YES:\s*\[?(\d+(?:\.\d+)?)\]?\s*%\s*\|\s*NO:\s*\[?(\d+(?:\.\d+)?)\]?\s*%/i);
    if (probMatch) {
      aiYesProbability = parseFloat(probMatch[1]);
      aiNoProbability = parseFloat(probMatch[2]);
    }

    // Determine recommendation based on AI probability (not text parsing)
    let recommendation: 'YES' | 'NO' | 'SKIP' = 'SKIP';
    let confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    
    if (aiYesProbability !== null && aiNoProbability !== null) {
      // Base recommendation on probability
      if (aiYesProbability >= 60) {
        recommendation = 'YES';
      } else if (aiNoProbability >= 60) {
        recommendation = 'NO';
      } else {
        recommendation = 'SKIP'; // Too close to call
      }
      
      // Determine confidence based on probability difference
      const diff = Math.abs(aiYesProbability - aiNoProbability);
      if (diff >= 40) {
        confidence = 'HIGH';
      } else if (diff >= 20) {
        confidence = 'MEDIUM';
      } else {
        confidence = 'LOW';
      }
    } else {
      // Fallback to text parsing if no probability found
      const recMatch = analysisText.match(/⚡\s*\*?\*?RECOMMENDATION\*?\*?\s*\n?\s*\[?(BET YES|BET NO|SKIP)\]?/i);
      if (recMatch) {
        if (recMatch[1].includes('YES')) recommendation = 'YES';
        else if (recMatch[1].includes('NO')) recommendation = 'NO';
      }
      
      const confMatch = analysisText.match(/Confidence:\s*\[?(LOW|MEDIUM|HIGH)\]?/i);
      if (confMatch) {
        confidence = confMatch[1].toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH';
      }
    }

    return NextResponse.json({
      success: true,
      predictionId,
      analysis: analysisText,
      recommendation,
      confidence,
      aiProbability: {
        yes: aiYesProbability,
        no: aiNoProbability
      },
      marketData: {
        yesPercentage,
        noPercentage,
        yesOdds: parseFloat(yesOdds) || null,
        noOdds: parseFloat(noOdds) || null,
        totalPoolETH,
        totalPoolSWIPE
      },
      generatedAt: new Date().toISOString(),
      source: 'OpenAI GPT-4o-mini'
    });

  } catch (error) {
    console.error('AI Analysis Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to analyze prediction',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
