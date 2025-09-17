import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET() {
  try {
    if (!redis) {
      return NextResponse.json(
        { error: "Redis not available" },
        { status: 500 }
      );
    }

    // Get all predictions from Redis
    const keys = await redis.keys('prediction:*');
    const predictions = [];

    for (const key of keys) {
      try {
        const prediction = await redis.get(key);
        if (prediction) {
          predictions.push(prediction);
        }
      } catch (error) {
        console.error(`Error fetching prediction from key ${key}:`, error);
      }
    }

    return NextResponse.json({
      predictions,
      count: predictions.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching Redis predictions:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
