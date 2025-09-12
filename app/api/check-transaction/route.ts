import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const txHash = searchParams.get('txHash');
    
    if (!txHash) {
      return NextResponse.json(
        { success: false, error: 'Transaction hash is required' },
        { status: 400 }
      );
    }
    
    // Check transaction status on Basescan using server-side API key
    const response = await fetch(`https://api.basescan.org/api?module=transaction&action=gettxreceiptstatus&txhash=${txHash}&apikey=${process.env.BASESCAN_API_KEY}`);
    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      data: {
        txHash,
        status: data.status === '1' ? 'success' : data.status === '0' ? 'failed' : 'pending',
        basescanResponse: data
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to check transaction:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check transaction status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
