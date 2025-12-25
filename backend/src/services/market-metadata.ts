import { fetchKalshiMarket, type KalshiMarket } from './kalshi-api';
import { fetchPolymarketByTokenId, fetchPolymarketsByTokenIds, getPolymarketTitle, type PolymarketMarketWithOutcome } from './polymarket-api';

/**
 * Market Metadata Service
 * Caches market titles to avoid repeated API calls
 */

interface MarketMetadata {
  ticker: string;
  title: string;
  subtitle?: string;
  actualMarketId?: string; // For Polymarket, the real market ID (not token ID)
  fetchedAt: Date;
}

// In-memory cache for market metadata
// Key format: exchange:marketId
const metadataCache = new Map<string, MarketMetadata>();

// Cache TTL: 1 hour (market titles don't change often)
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Get market title for a Kalshi market
 * Returns cached value if available and not expired
 */
export async function getKalshiMarketTitle(ticker: string): Promise<string | null> {
  const cacheKey = `kalshi:${ticker}`;
  
  // Check cache first
  const cached = metadataCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.title;
  }

  // Fetch from API
  const market = await fetchKalshiMarket(ticker);
  
  if (market) {
    // Cache the result
    metadataCache.set(cacheKey, {
      ticker: market.ticker,
      title: market.title,
      subtitle: market.subtitle,
      fetchedAt: new Date(),
    });
    return market.title;
  }

  return null;
}

/**
 * Get market title for a Polymarket token
 * Returns cached value if available and not expired
 * Title includes the outcome (Up/Down, Yes/No) for the specific token
 */
export async function getPolymarketMarketTitle(clobTokenId: string): Promise<string | null> {
  const cacheKey = `polymarket:${clobTokenId}`;
  
  // Check cache first
  const cached = metadataCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.title;
  }

  // Fetch enhanced title from Gamma API (includes outcome like "Up", "Down", etc.)
  const title = await getPolymarketTitle(clobTokenId);
  const market = await fetchPolymarketByTokenId(clobTokenId);
  
  if (title && market) {
    // Cache the result with the enhanced title
    metadataCache.set(cacheKey, {
      ticker: clobTokenId,
      title: title, // Enhanced title with outcome
      actualMarketId: market.id,
      fetchedAt: new Date(),
    });
    return title;
  }

  return null;
}

/**
 * Batch fetch market titles for multiple Kalshi markets
 * Returns a map of ticker -> title
 */
export async function getKalshiMarketTitles(
  tickers: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const tickersToFetch: string[] = [];

  // Check cache first for each ticker
  for (const ticker of tickers) {
    const cacheKey = `kalshi:${ticker}`;
    const cached = metadataCache.get(cacheKey);
    
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      results.set(ticker, cached.title);
    } else {
      tickersToFetch.push(ticker);
    }
  }

  // Fetch uncached tickers from API (with rate limiting)
  if (tickersToFetch.length > 0) {
    console.log(`[MarketMetadata] Fetching titles for ${tickersToFetch.length} Kalshi markets...`);
    
    // Fetch in parallel with rate limiting
    const batchSize = 5;
    const delayMs = 200;
    
    for (let i = 0; i < tickersToFetch.length; i += batchSize) {
      const batch = tickersToFetch.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (ticker) => {
          const market = await fetchKalshiMarket(ticker);
          if (market) {
            const cacheKey = `kalshi:${ticker}`;
            metadataCache.set(cacheKey, {
              ticker: market.ticker,
              title: market.title,
              subtitle: market.subtitle,
              fetchedAt: new Date(),
            });
            results.set(ticker, market.title);
          }
        })
      );
      
      // Delay between batches
      if (i + batchSize < tickersToFetch.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    
    console.log(`[MarketMetadata] Fetched ${results.size - (tickers.length - tickersToFetch.length)} new Kalshi titles`);
  }

  return results;
}

/**
 * Batch fetch market titles for multiple Polymarket tokens
 * Returns a map of clobTokenId -> title (enhanced with outcome)
 */
export async function getPolymarketMarketTitles(
  clobTokenIds: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const tokensToFetch: string[] = [];

  // Check cache first for each token
  for (const tokenId of clobTokenIds) {
    const cacheKey = `polymarket:${tokenId}`;
    const cached = metadataCache.get(cacheKey);
    
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      results.set(tokenId, cached.title);
    } else {
      tokensToFetch.push(tokenId);
    }
  }

  // Fetch uncached tokens from API
  if (tokensToFetch.length > 0) {
    console.log(`[MarketMetadata] Fetching titles for ${tokensToFetch.length} Polymarket markets...`);
    
    const markets = await fetchPolymarketsByTokenIds(tokensToFetch);
    
    for (const [tokenId, market] of markets) {
      // Build enhanced title with outcome (Up/Down, Yes/No) or groupItemTitle
      let title = market.question;
      if (market.groupItemTitle && market.groupItemTitle !== '0') {
        title = `${title} (${market.groupItemTitle})`;
      } else if (market.outcomeForToken) {
        title = `${title} (${market.outcomeForToken})`;
      }
      
      const cacheKey = `polymarket:${tokenId}`;
      metadataCache.set(cacheKey, {
        ticker: tokenId,
        title: title,
        actualMarketId: market.id,
        fetchedAt: new Date(),
      });
      results.set(tokenId, title); // Use enhanced title with outcome
    }
    
    console.log(`[MarketMetadata] Fetched ${markets.size} new Polymarket titles`);
  }

  return results;
}

/**
 * Get market title - returns marketId as fallback if title not found
 */
export async function getMarketDisplayName(
  exchange: 'kalshi' | 'polymarket',
  marketId: string
): Promise<string> {
  if (exchange === 'kalshi') {
    const title = await getKalshiMarketTitle(marketId);
    return title || marketId;
  }
  
  if (exchange === 'polymarket') {
    const title = await getPolymarketMarketTitle(marketId);
    return title || formatTokenId(marketId);
  }
  
  return marketId;
}

/**
 * Format a long token ID for display
 */
function formatTokenId(tokenId: string): string {
  if (tokenId.length > 20) {
    return `${tokenId.slice(0, 8)}...${tokenId.slice(-6)}`;
  }
  return tokenId;
}

/**
 * Clear the metadata cache (useful for testing)
 */
export function clearMetadataCache(): void {
  metadataCache.clear();
}

/**
 * Get cache stats
 */
export function getMetadataCacheStats(): { size: number; entries: string[] } {
  return {
    size: metadataCache.size,
    entries: Array.from(metadataCache.keys()),
  };
}
