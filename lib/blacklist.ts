import fs from 'fs';
import path from 'path';

let blacklistCache: Set<string> | null = null;
let blacklistCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache (blokada działa permanentnie, cache tylko dla wydajności)

/**
 * Load blacklist from file and cache it
 */
function loadBlacklist(): Set<string> {
  const now = Date.now();
  
  // Return cached blacklist if still valid
  if (blacklistCache && (now - blacklistCacheTime) < CACHE_TTL) {
    return blacklistCache;
  }
  
  try {
    const blacklistPath = path.join(process.cwd(), 'docs', 'blacklist.txt');
    const content = fs.readFileSync(blacklistPath, 'utf-8');
    
    const addresses = new Set<string>();
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      // Normalize to lowercase
      const address = trimmed.toLowerCase();
      // Validate address format
      if (/^0x[a-f0-9]{40}$/.test(address)) {
        addresses.add(address);
      }
    }
    
    blacklistCache = addresses;
    blacklistCacheTime = now;
    
    return addresses;
  } catch (error) {
    console.error('Error loading blacklist:', error);
    // Return empty set on error
    return new Set<string>();
  }
}

/**
 * Check if an address is blacklisted
 * @param address Address to check (will be normalized to lowercase)
 */
export function isBlacklisted(address: string): boolean {
  if (!address) return false;
  
  const normalizedAddress = address.toLowerCase();
  const blacklist = loadBlacklist();
  
  return blacklist.has(normalizedAddress);
}

/**
 * Get all blacklisted addresses (for admin/debug purposes)
 */
export function getBlacklist(): string[] {
  const blacklist = loadBlacklist();
  return Array.from(blacklist).sort();
}

/**
 * Invalidate cache (useful for testing or after manual blacklist updates)
 */
export function invalidateBlacklistCache(): void {
  blacklistCache = null;
  blacklistCacheTime = 0;
}

