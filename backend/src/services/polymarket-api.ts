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
  outcomes: string; // JSON string array like '["Yes", "No"]' or '["Up", "Down"]'
  outcomePrices: string; // JSON string array like '["0.45", "0.55"]'
  clobTokenIds: string; // JSON string array of the two token IDs
  volume: string;
  active: boolean;
  closed: boolean;
  image?: string;
  icon?: string;
  endDate?: string;
  groupItemTitle?: string; // For markets with thresholds, e.g., "↑ 250,000"
  groupItemThreshold?: string; // Numeric threshold value
}

export interface PolymarketMarketWithOutcome extends PolymarketMarket {
  outcomeForToken: string; // The outcome this specific token represents (e.g., "Up", "Down", "Yes", "No")
}

interface GammaApiResponse extends Array<PolymarketMarket> {}

// Cache: clobTokenId -> market data with outcome
const marketCache = new Map<string, PolymarketMarketWithOutcome>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cacheTimestamps = new Map<string, number>();

/**
 * Get the outcome name for a specific CLOB token ID
 */
function getOutcomeForToken(market: PolymarketMarket, clobTokenId: string): string {
  try {
    const outcomes = JSON.parse(market.outcomes) as string[];
    const tokenIds = JSON.parse(market.clobTokenIds) as string[];
    
    const index = tokenIds.indexOf(clobTokenId);
    if (index !== -1 && outcomes[index]) {
      return outcomes[index];
    }
  } catch {
    // Ignore parsing errors
  }
  return '';
}

/**
 * Fetch market by CLOB token ID from Gamma API
 */
export async function fetchPolymarketByTokenId(
  clobTokenId: string
): Promise<PolymarketMarketWithOutcome | null> {
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
    
    // Create market with outcome for this specific token
    const marketWithOutcome: PolymarketMarketWithOutcome = {
      ...market,
      outcomeForToken: getOutcomeForToken(market, clobTokenId),
    };
    
    // Cache the result for this token
    marketCache.set(clobTokenId, marketWithOutcome);
    cacheTimestamps.set(clobTokenId, Date.now());
    
    // Also cache for the other token IDs (with their respective outcomes)
    try {
      const tokenIds = JSON.parse(market.clobTokenIds) as string[];
      for (const tokenId of tokenIds) {
        if (tokenId !== clobTokenId && !marketCache.has(tokenId)) {
          const otherOutcome = getOutcomeForToken(market, tokenId);
          marketCache.set(tokenId, {
            ...market,
            outcomeForToken: otherOutcome,
          });
          cacheTimestamps.set(tokenId, Date.now());
        }
      }
    } catch {
      // Ignore parsing errors
    }

    return marketWithOutcome;
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
): Promise<Map<string, PolymarketMarketWithOutcome>> {
  const results = new Map<string, PolymarketMarketWithOutcome>();
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
 * Get a formatted title for a Polymarket token
 * Includes the outcome (Up/Down, Yes/No) and any group threshold info
 * 
 * Examples:
 * - "Bitcoin Up or Down - Dec 25 (Up)"
 * - "Will BTC reach $250,000? (↑ 250,000)"
 */
export async function getPolymarketTitle(clobTokenId: string): Promise<string | null> {
  const market = await fetchPolymarketByTokenId(clobTokenId);
  if (!market) return null;
  
  let title = market.question;
  
  // If there's a groupItemTitle (like "↑ 250,000"), use that as the suffix
  if (market.groupItemTitle && market.groupItemTitle !== '0') {
    title = `${title} (${market.groupItemTitle})`;
  } 
  // Otherwise, if we have an outcome for this token, append it
  else if (market.outcomeForToken) {
    title = `${title} (${market.outcomeForToken})`;
  }
  
  return title;
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
