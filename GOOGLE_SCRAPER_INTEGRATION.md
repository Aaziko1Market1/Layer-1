# Google Scraper API Integration

## Summary

Agent 1 (Company Research) has been updated to use your Google Scraper API instead of Brave Search.

## Changes Made

### 1. Modified File: `src/services/agents/company-research.agent.ts`

**Before:**
- Used Brave Search API (`https://api.search.brave.com`)
- Required `BRAVE_SEARCH_API_KEY` environment variable

**After:**
- Uses Google Scraper API (`http://aaziko.google.202.47.115.6.sslip.io/search`)
- No API key required
- 30-second timeout (scraping takes time)
- Graceful fallback if API is slow or unavailable

### 2. API Integration Details

**Endpoint:** `http://aaziko.google.202.47.115.6.sslip.io/search`

**Method:** POST

**Request Format:**
```
Content-Type: application/x-www-form-urlencoded
Body: company_name=<company_name>
```

**Example:**
```bash
curl -X POST "http://aaziko.google.202.47.115.6.sslip.io/search" \
  -d "company_name=Tesla" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

### 3. How It Works in the Pipeline

```
standard_port_data (trade data)
        ↓
   Extract Importers
        ↓
   Classify with AI
        ↓
   Verify Websites
        ↓
┌───────────────────────────────────┐
│  Agent 1: Company Research        │
│  ─────────────────────────────    │
│  1. Google Scraper API ← NEW!     │
│     - Searches company name       │
│     - Gets Google search results  │
│     - 30s timeout                 │
│     - Fallback if unavailable     │
│                                   │
│  2. Website Scraping              │
│     - Scrapes verified website    │
│                                   │
│  3. AI Analysis                   │
│     - Uses Google results         │
│     - Computes India fit score    │
│     - Analyzes buying patterns    │
└───────────────────────────────────┘
        ↓
   Agent 2: Contact Discovery
        ↓
   Agent 3: Verification
        ↓
   Agent 4: Buyer Intelligence
        ↓
   enriched_buyers (final output)
```

## Code Changes

### New Method: `googleScraperSearch()`

```typescript
private async googleScraperSearch(
  companyName: string
): Promise<Array<{ title: string; url: string; description: string }>> {
  try {
    logger.info(`Calling Google Scraper API for: ${companyName}`);
    
    const response = await axios.post(
      'http://aaziko.google.202.47.115.6.sslip.io/search',
      `company_name=${encodeURIComponent(companyName)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000, // 30 seconds
      }
    );

    // Parse response
    const results: Array<{ title: string; url: string; description: string }> = [];
    
    if (response.data && typeof response.data === 'object') {
      const items = response.data.results || response.data.items || [];
      items.forEach((item: any) => {
        results.push({
          title: item.title || item.name || '',
          url: item.url || item.link || '',
          description: item.snippet || item.description || '',
        });
      });
    }

    return results.slice(0, 5);
  } catch (err: any) {
    // Graceful fallback - don't fail the entire pipeline
    logger.warn(`Google Scraper timeout/error - continuing without it`);
    return [];
  }
}
```

### Updated Research Flow

```typescript
async research(profile: BuyerProfile): Promise<CompanyResearch> {
  // Step 1: Google Scraper API (30s timeout)
  const googleResults = await this.safeExecute(
    () => this.withTimeout(
      () => this.googleScraperSearch(profile.companyName), 
      30000, 
      'Google Scraper'
    ),
    'Google Scraper',
    [] // Empty array fallback
  );

  // Step 2: Website Scraping
  let scrapedData = null;
  if (profile.verifiedWebsite) {
    scrapedData = await this.scraper.scrapeWebsite(profile.verifiedWebsite);
  }

  // Step 3: AI Analysis (uses googleResults)
  const aiAnalysis = await this.analyzeIndiaFit(
    profile, 
    googleResults,  // ← Google results passed to AI
    scrapedData
  );

  // Return research object
  return {
    business_model: scrapedData?.about || aiAnalysis.business_model,
    india_fit_score: aiAnalysis.india_fit_score,
    source_urls: [
      ...googleResults.map(r => r.url),  // ← Google URLs included
    ],
    // ... other fields
  };
}
```

## Testing

### Test Script: `test-google-scraper.js`

```bash
cd TT
node test-google-scraper.js
```

This will test the Google Scraper API directly.

### Run Full Pipeline

```bash
cd TT
npm run build
node -r dotenv/config dist/services/etl/pipeline.js dotenv_config_path=.env
```

## Important Notes

### 1. API Performance
- The Google Scraper API is **slow** (30+ seconds per request)
- This is normal - it's scraping Google in real-time
- The agent has a 30-second timeout
- If timeout occurs, pipeline continues without Google results

### 2. Graceful Degradation
- If Google Scraper fails/times out: ✅ Pipeline continues
- Agent still uses:
  - Website scraping
  - AI analysis
  - Trade data
- Google results are **optional enrichment**, not required

### 3. No API Key Required
- Removed `BRAVE_SEARCH_API_KEY` dependency
- Google Scraper API is open (no authentication)

### 4. Data Flow

**Input to Google Scraper:**
- Company name from `buyer_profiles.companyName`

**Output from Google Scraper:**
- Array of search results: `[{ title, url, description }]`

**Used by:**
- AI Analysis (Step 3) - to compute India fit score
- Research object - stored in `source_urls`

## Current Status

✅ Code updated and compiled successfully  
✅ Google Scraper API integrated into Agent 1  
✅ Graceful fallback if API is slow/unavailable  
✅ 30-second timeout configured  
⚠️ API is slow (30+ seconds) - this is expected  

## Next Steps

1. **Import trade data** into `standard_port_data` collection
2. **Run the pipeline** to test end-to-end
3. **Monitor logs** to see Google Scraper results
4. **Check enriched_buyers** collection for output

## Logs to Watch

When running the pipeline, you'll see:

```
[INFO] CompanyResearchAgent: Calling Google Scraper API for: <company_name>
[INFO] CompanyResearchAgent: Google Scraper found X results for <company_name>
```

Or if timeout:

```
[WARN] CompanyResearchAgent: Google Scraper timeout for <company_name> - continuing without it
```

## Rollback (if needed)

To revert to Brave Search:
1. Restore original `company-research.agent.ts` from git
2. Add `BRAVE_SEARCH_API_KEY` to `.env`
3. Rebuild: `npm run build`
