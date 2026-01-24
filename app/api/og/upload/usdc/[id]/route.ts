import { NextRequest, NextResponse } from 'next/server';
import { uploadBufferToImgBB } from '@/lib/imgbb';
import { redisHelpers } from '@/lib/redis';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://theswipe.app';

/**
 * Generate USDC prediction OG image with current chart data and upload to ImgBB
 * Saves the URL to Redis so Twitter/Base App can use it via layout.tsx metadata
 * Each share generates a fresh image with latest chart data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    console.log(`📸 Generating fresh OG image for USDC prediction: ${id}`);
    
    // Check if prediction exists
    const prediction = await redisHelpers.getPrediction(id);
    if (!prediction) {
      return NextResponse.json({ error: 'Prediction not found' }, { status: 404 });
    }
    
    // Generate OG image by calling our USDC endpoint (gets fresh chart data)
    console.log(`🔗 Using base URL: ${BASE_URL}`);
    
    const ogResponse = await fetch(`${BASE_URL}/api/og/usdc-prediction/${id}`, {
      headers: {
        'Accept': 'image/png',
      },
      // Don't cache - we want fresh data
      cache: 'no-store',
    });
    
    if (!ogResponse.ok) {
      throw new Error(`Failed to generate OG image: ${ogResponse.status}`);
    }
    
    // Get image as ArrayBuffer
    const imageBuffer = await ogResponse.arrayBuffer();
    
    console.log(`📦 OG image generated, size: ${imageBuffer.byteLength} bytes`);
    
    // Upload to ImgBB with timestamp to ensure unique filename
    const timestamp = Date.now();
    const imgbbResponse = await uploadBufferToImgBB(imageBuffer, `og-usdc-${id}-${timestamp}.png`);
    const permanentUrl = imgbbResponse.data.url;
    
    console.log(`✅ Uploaded to ImgBB: ${permanentUrl}`);
    
    // Save URL to Redis so layout.tsx can use it for og:image meta tag
    prediction.ogImageUrl = permanentUrl;
    await redisHelpers.savePrediction(prediction);
    
    console.log(`💾 Saved ogImageUrl to Redis for USDC prediction: ${id}`);
    
    return NextResponse.json({ 
      success: true, 
      url: permanentUrl,
    });
    
  } catch (error) {
    console.error('Error generating/uploading USDC OG image:', error);
    return NextResponse.json(
      { error: 'Failed to generate OG image', details: String(error) },
      { status: 500 }
    );
  }
}
