import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const predictionId = parseInt(id);

    if (isNaN(predictionId)) {
      return NextResponse.json(
        { error: "Invalid prediction ID" },
        { status: 400 }
      );
    }

    // Try to get prediction from Redis first
    try {
      const redisResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/redis-predictions`, {
        cache: 'no-store'
      });
      
      if (redisResponse.ok) {
        const redisData = await redisResponse.json();
        
        // Try to find prediction by ID (both string and number)
        const prediction = redisData.predictions.find((p: any) => 
          p.id === predictionId || 
          p.id === predictionId.toString() || 
          p.id === `pred_${predictionId}` ||
          p.id === `prediction_${predictionId}`
        );
        
        if (prediction) {
          console.log('Found prediction in Redis:', prediction.id);
          return NextResponse.json(prediction);
        }
        
        console.log('Prediction not found in Redis. Available IDs:', redisData.predictions.map((p: any) => p.id));
      }
    } catch (redisError) {
      console.log('Redis fetch failed, trying blockchain:', redisError);
    }

    // If not found in Redis, try to get from blockchain
    try {
      const blockchainResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/blockchain/prediction/${predictionId}`, {
        cache: 'no-store'
      });
      
      if (blockchainResponse.ok) {
        const blockchainData = await blockchainResponse.json();
        return NextResponse.json(blockchainData);
      }
    } catch (blockchainError) {
      console.log('Blockchain fetch failed:', blockchainError);
    }

    // If not found anywhere, return 404
    return NextResponse.json(
      { error: "Prediction not found" },
      { status: 404 }
    );

  } catch (error) {
    console.error('Error fetching prediction:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
