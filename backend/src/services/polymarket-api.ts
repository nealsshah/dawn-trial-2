/**
 * Polymarket Gamma API Client
 * Fetches market metadata using CLOB token IDs
 */

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

export interface PolymarketMarket {
  id: string; // The actual Polymarket market ID (e.g., "1009447")
  question: string; // Market title/question
  slug: string;
  conditionId: string;
  outcomes: string; // JSON string array like '["Yes", "No"]'
  outcomePrices: string; // JSON string array like '["0.45", "0.55"]'
  clobTokenIds: string; // JSON string array of the two token IDs
  volume: string;
  active: boolean;
  closed: boolean;
  image?: string;
  icon?: string;
  endDate?: string;
}

interface GammaApiResponse extends Array<PolymarketMarket> {}

// Cache: clobTokenId -> market data
const marketCache = new Map<string, PolymarketMarket>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cacheTimestamps = new Map<string, number>();

/**
 * Fetch market by CLOB token ID from Gamma API
 */
export async function fetchPolymarketByTokenId(
  clobTokenId: string
): Promise<PolymarketMarket | null> {
  // Check cache first
  const cached = marketCache.get(clobTokenId);
  const cachedAt = cacheTimestamps.get(clobTokenId);
  
  if (cached && cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const response = await fetch(
      `${GAMMA_API_BASE}/markets?clob_token_ids=${clobTokenId}`
    );

    if (!response.ok) {
      console.error(`[PolymarketAPI] Error fetching market for token ${clobTokenId}: ${response.status}`);
      return null;
    }

    const data: GammaApiResponse = await response.json();
    
    if (data.length === 0) {
      return null;
    }

    const market = data[0];
    
    // Cache the result
    marketCache.set(clobTokenId, market);
    cacheTimestamps.set(clobTokenId, Date.now());
    
    // Also cache by the other token ID if present
    try {
      const tokenIds = JSON.parse(market.clobTokenIds) as string[];
      for (const tokenId of tokenIds) {
        if (tokenId !== clobTokenId) {
          marketCache.set(tokenId, market);
          cacheTimestamps.set(tokenId, Date.now());
        }
      }
    } catch {
      // Ignore parsing errors
    }

    return market;
  } catch (error) {
    console.error(`[PolymarketAPI] Error fetching market for token ${clobTokenId}:`, error);
    return null;
  }
}

/**
 * Batch fetch markets by multiple CLOB token IDs
 */
export async function fetchPolymarketsByTokenIds(
  clobTokenIds: string[]
): Promise<Map<string, PolymarketMarket>> {
  const results = new Map<string, PolymarketMarket>();
  const tokensToFetch: string[] = [];

  // Check cache first
  for (const tokenId of clobTokenIds) {
    const cached = marketCache.get(tokenId);
    const cachedAt = cacheTimestamps.get(tokenId);
    
    if (cached && cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) {
      results.set(tokenId, cached);
    } else {
      tokensToFetch.push(tokenId);
    }
  }

  if (tokensToFetch.length === 0) {
    return results;
  }

  console.log(`[PolymarketAPI] Fetching ${tokensToFetch.length} markets from Gamma API...`);

  // Fetch in batches to avoid URL length issues
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < tokensToFetch.length; i += BATCH_SIZE) {
    const batch = tokensToFetch.slice(i, i + BATCH_SIZE);
    
    // Fetch each token ID individually (Gamma API doesn't support multiple in one call well)
    await Promise.all(
      batch.map(async (tokenId) => {
        const market = await fetchPolymarketByTokenId(tokenId);
        if (market) {
          results.set(tokenId, market);
        }
      })
    );
    
    // Small delay between batches
    if (i + BATCH_SIZE < tokensToFetch.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`[PolymarketAPI] Fetched ${results.size} markets`);
  return results;
}

/**
 * Get market title for a Polymarket token
 * Returns the question/title if found, null otherwise
 */
export async function getPolymarketTitle(clobTokenId: string): Promise<string | null> {
  const market = await fetchPolymarketByTokenId(clobTokenId);
  return market?.question || null;
}

/**
 * Get the actual Polymarket market ID for a CLOB token ID
 */
export async function getPolymarketMarketId(clobTokenId: string): Promise<string | null> {
  const market = await fetchPolymarketByTokenId(clobTokenId);
  return market?.id || null;
}

/**
 * Clear cache (for testing)
 */
export function clearPolymarketCache(): void {
  marketCache.clear();
  cacheTimestamps.clear();
}

/**
 * Get cache stats
 */
export function getPolymarketCacheStats(): { size: number } {
  return { size: marketCache.size };
}

