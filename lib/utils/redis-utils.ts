// Redis utility functions - safe to import on client side

// Helper function to generate Basescan URL
export const generateBasescanUrl = (txHash: string): string => {
  return `https://basescan.org/tx/${txHash}`;
};

// Helper function to create transaction ID
export const generateTransactionId = (): string => {
  return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};
