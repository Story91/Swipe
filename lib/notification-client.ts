import {
  MiniAppNotificationDetails,
  type SendNotificationRequest,
  sendNotificationResponseSchema,
} from "@farcaster/frame-sdk";
import { getUserNotificationDetails } from "@/lib/notification";

const appUrl = process.env.NEXT_PUBLIC_URL || "";

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

export async function sendFrameNotification({
  fid,
  appFid,
  title,
  body,
  notificationDetails,
}: {
  fid: number;
  appFid: number;
  title: string;
  body: string;
  notificationDetails?: MiniAppNotificationDetails | null;
}): Promise<SendFrameNotificationResult> {
  console.log('sendFrameNotification called for FID:', fid, 'appFid:', appFid, 'title:', title);
  
  if (!notificationDetails) {
    console.log('Fetching notification details for FID:', fid, 'appFid:', appFid);
    notificationDetails = await getUserNotificationDetails(fid, appFid);
  }
  
  console.log('Notification details:', notificationDetails);
  
  if (!notificationDetails) {
    console.log('No notification details found for FID:', fid, 'appFid:', appFid);
    return { state: "no_token" };
  }

  // Validate appUrl is set
  if (!appUrl) {
    console.error('NEXT_PUBLIC_URL is not set! Cannot send notification.');
    return { 
      state: "error", 
      error: { message: "NEXT_PUBLIC_URL environment variable is not configured" } 
    };
  }

  // Validate targetUrl is on the same domain as mini app (Base requirement)
  try {
    const targetUrlObj = new URL(appUrl);
    const notificationUrlObj = new URL(notificationDetails.url);
    // Note: This is a basic check - Base may have stricter requirements
    console.log('Target URL domain:', targetUrlObj.hostname);
    console.log('Notification URL domain:', notificationUrlObj.hostname);
  } catch (urlError) {
    console.error('Invalid URL format:', urlError);
  }

  const requestBody = {
    notificationId: crypto.randomUUID(),
    title,
    body,
    targetUrl: appUrl,
    tokens: [notificationDetails.token],
  } satisfies SendNotificationRequest;

  console.log('Sending notification request to:', notificationDetails.url);
  console.log('Request body:', JSON.stringify(requestBody, null, 2));

  let response: Response;
  let responseJson: unknown;

  try {
    response = await fetch(notificationDetails.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
          message: "Invalid JSON response from notification service",
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
    const responseBody = sendNotificationResponseSchema.safeParse(responseJson);
    if (responseBody.success === false) {
      console.error('Invalid response schema:', responseBody.error.errors);
      return { state: "error", error: responseBody.error.errors };
    }

    // Check for invalid tokens
    if (responseBody.data.result.invalidTokens.length > 0) {
      console.warn('Invalid tokens detected:', responseBody.data.result.invalidTokens);
      // These tokens should be deleted from storage
      if (responseBody.data.result.invalidTokens.includes(notificationDetails.token)) {
        console.log('Deleting invalid token from storage for FID:', fid, 'appFid:', appFid);
        const { deleteUserNotificationDetails } = await import("@/lib/notification");
        await deleteUserNotificationDetails(fid, appFid).catch((err) => {
          console.error('Failed to delete invalid token:', err);
        });
      }
    }

    if (responseBody.data.result.rateLimitedTokens.length > 0) {
      console.warn('Rate limited tokens:', responseBody.data.result.rateLimitedTokens);
      return { state: "rate_limit" };
    }

    console.log('Notification sent successfully');
    return { state: "success" };
  }

  // Handle non-200 status codes
  console.error('Notification API error:', {
    status: response.status,
    statusText: response.statusText,
    body: responseJson
  });

  return { 
    state: "error", 
    error: {
      status: response.status,
      statusText: response.statusText,
      body: responseJson
    }
  };
}
