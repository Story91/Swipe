const appUrl = process.env.NEXT_PUBLIC_URL || "";
const neynarApiKey = process.env.NEYNAR_API_KEY;

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

/**
 * Send notification using Neynar API
 * According to Neynar docs: https://docs.neynar.com/docs/send-notifications-to-mini-app-users
 * Neynar manages tokens automatically, we just need to send FIDs
 * 
 * @param fid - Single FID or array of FIDs to send notification to
 * @param appFid - Not used by Neynar API, kept for compatibility
 * @param title - Notification title (max 32 chars)
 * @param body - Notification body (max 128 chars)
 */
export async function sendFrameNotification({
  fid,
  appFid,
  title,
  body,
}: {
  fid: number | number[];
  appFid?: number;
  title: string;
  body: string;
}): Promise<SendFrameNotificationResult> {
  const targetFids = Array.isArray(fid) ? fid : [fid];
  console.log('sendFrameNotification called for FIDs:', targetFids, 'title:', title);

  // Validate required environment variables
  if (!neynarApiKey) {
    console.error('NEYNAR_API_KEY is not set! Cannot send notification.');
    return { 
      state: "error", 
      error: { message: "NEYNAR_API_KEY environment variable is not configured" } 
    };
  }

  if (!appUrl) {
    console.error('NEXT_PUBLIC_URL is not set! Cannot send notification.');
    return { 
      state: "error", 
      error: { message: "NEXT_PUBLIC_URL environment variable is not configured" } 
    };
  }

  // Validate title and body length (Base requirements)
  if (title.length > 32) {
    console.warn('Title exceeds 32 characters, truncating:', title);
    title = title.substring(0, 32);
  }
  if (body.length > 128) {
    console.warn('Body exceeds 128 characters, truncating:', body);
    body = body.substring(0, 128);
  }

  // Validate target URL length (Base requirement: max 1024 chars)
  if (appUrl.length > 1024) {
    console.error('targetUrl exceeds 1024 characters!');
    return { 
      state: "error", 
      error: { message: "targetUrl exceeds maximum length of 1024 characters" } 
    };
  }

  const requestBody = {
    target_fids: targetFids,
    notification: {
      title,
      body,
      target_url: appUrl,
    },
  };

  console.log('Sending notification via Neynar API');
  console.log('Request body:', JSON.stringify(requestBody, null, 2));

  let response: Response;
  let responseJson: unknown;

  try {
    response = await fetch('https://api.neynar.com/v2/farcaster/frame/notifications', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": neynarApiKey,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    // Try to parse JSON response
    const responseText = await response.text();
    console.log('Response body:', responseText);

    try {
      responseJson = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      return { 
        state: "error", 
        error: { 
          message: "Invalid JSON response from Neynar API",
          status: response.status,
          body: responseText
        } 
      };
    }
  } catch (fetchError) {
    console.error('Fetch error:', fetchError);
    return { 
      state: "error", 
      error: { 
        message: fetchError instanceof Error ? fetchError.message : "Network error",
        type: "fetch_error"
      } 
    };
  }

  if (response.status === 200) {
    // Neynar API returns success response
    const responseData = responseJson as { success?: boolean; message?: string };
    if (responseData.success !== false) {
      console.log('Notification sent successfully via Neynar');
      return { state: "success" };
    } else {
      console.error('Neynar API returned error:', responseData);
      return { 
        state: "error", 
        error: responseData 
      };
    }
  }

  // Handle non-200 status codes
  console.error('Neynar API error:', {
    status: response.status,
    statusText: response.statusText,
    body: responseJson
  });

  // Check for rate limit (429)
  if (response.status === 429) {
    return { state: "rate_limit" };
  }

  return { 
    state: "error", 
    error: {
      status: response.status,
      statusText: response.statusText,
      body: responseJson
    }
  };
}
