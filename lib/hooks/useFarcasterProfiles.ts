import { useState, useEffect, useCallback } from 'react';

export interface FarcasterProfile {
  fid: string | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  verified_addresses: {
    eth_addresses: string[];
    sol_addresses: string[];
  };
  address?: string; // For mapping purposes
  isBaseVerified?: boolean; // Base blockchain verification status
  isWalletOnly?: boolean; // True if this is a wallet-only user without Farcaster profile
}

export function useFarcasterProfiles(addresses: string[]) {
  const [profiles, setProfiles] = useState<FarcasterProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfiles = useCallback(async (addressList: string[]) => {
    if (!addressList.length) {
      setProfiles([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/farcaster/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ addresses: addressList }),
      });

      const data = await response.json();

      if (data.success) {
        setProfiles(data.profiles);
      } else {
        throw new Error(data.error || 'Failed to fetch profiles');
      }
    } catch (err) {
      console.error('Error fetching Farcaster profiles:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch profiles');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // console.log('🔍 useFarcasterProfiles: addresses changed', addresses);
    fetchProfiles(addresses);
  }, [addresses, fetchProfiles]);

  return {
    profiles,
    loading,
    error,
    refetch: () => fetchProfiles(addresses)
  };
}
