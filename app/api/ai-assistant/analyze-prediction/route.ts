// Proprietary — not covered by the repository's MIT LICENSE. All rights reserved.
// See /NOTICE for the licensing split.
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

interface PredictionAnalysisRequest {
  predictionId: string;
  question: string;
  description: string;
  category: string;
  yesPercentage: number;
  noPercentage: number;
  /**
   * Whether anybody has staked at all.
   *
   * The two percentages used to fall back to 50 on an empty market, and the
   * pool was read off the archived ETH fields, which no live market has
   * written since the role split. So every current market reached the model as
   * "YES 50% / NO 50%, Pool: 0.0000 ETH" and the model was asked which side
   * was mispriced. It cannot answer that about a market with no prices in it,
   * and it answered anyway, above two buttons that place a bet.
   */
  hasPool: boolean;
  /** The collateral pool, in readable units, both sides together. */
  totalPool: number;
  /** USDC on Base, USDG on Robinhood. Never assumed. */
  poolSymbol: string;
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
      hasPool,
      totalPool,
      poolSymbol,
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
Category: ${category} | ${hasPool
  ? `Current market: YES ${yesPercentage.toFixed(0)}% / NO ${noPercentage.toFixed(0)}%`
  : 'Nobody has staked on this market yet, so it has no market price. Do not describe either side as undervalued or overvalued; give your own probability and say the market is empty.'}
Pool: ${hasPool ? `${totalPool.toFixed(2)} ${poolSymbol}` : `0 ${poolSymbol}`} | Time left: ${timeLeftDays > 0 ? `${timeLeftDays}d` : `${timeLeftHours}h`}
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
        // Odds only mean something once there is money on both sides. On an
        // empty market the old code divided 100 by a fabricated 50 and
        // reported evens, which is a price nobody offered.
        yesOdds: hasPool ? parseFloat(yesOdds) || null : null,
        noOdds: hasPool ? parseFloat(noOdds) || null : null,
        hasPool,
        totalPool,
        poolSymbol
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
