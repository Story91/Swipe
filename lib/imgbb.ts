export interface ImgBBResponse {
  data: {
    url: string;
    display_url: string;
    delete_url: string;
    title: string;
    time: string;
    image: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
  };
  success: boolean;
  status: number;
}

function getApiKey(): string {
  // Use NEXT_PUBLIC_ for client-side access, fallback to server-side key
  const key = process.env.NEXT_PUBLIC_IMGBB_API_KEY || process.env.IMGBB_API_KEY;
  if (!key) {
    throw new Error('IMGBB_API_KEY environment variable is not set');
  }
  return key;
}

export async function uploadToImgBB(file: File): Promise<ImgBBResponse> {
  try {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${getApiKey()}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ImgBBResponse = await response.json();

    if (!data.success) {
      throw new Error('Failed to upload image to ImgBB');
    }

    return data;
  } catch (error) {
    console.error('Error uploading to ImgBB:', error);
    throw new Error('Failed to upload image to ImgBB');
  }
}

/**
 * Upload a Buffer (PNG image) to ImgBB
 * Used for uploading dynamically generated OG images
 */
export async function uploadBufferToImgBB(buffer: ArrayBuffer, filename: string = 'og-image.png'): Promise<ImgBBResponse> {
  try {
    // Convert ArrayBuffer to base64
    const base64 = Buffer.from(buffer).toString('base64');
    
    const formData = new FormData();
    formData.append('image', base64);
    formData.append('name', filename);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${getApiKey()}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ImgBB error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ImgBBResponse = await response.json();

    if (!data.success) {
      throw new Error('Failed to upload image to ImgBB');
    }

    console.log('✅ Image uploaded to ImgBB:', data.data.url);
    return data;
  } catch (error) {
    console.error('Error uploading buffer to ImgBB:', error);
    throw new Error('Failed to upload image to ImgBB');
  }
}

