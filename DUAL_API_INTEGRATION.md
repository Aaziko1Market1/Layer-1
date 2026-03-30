# Dual API Integration - Google Scraper + Global API

## Summary

Agent 1 (Company Research) now uses TWO APIs in sequence:

1. **Google Scraper API** - Gets Google search results for company
2. **Global API** - Receives all company data + Google results

## Complete Data Flow

```
standard_port_data (trade data)
        ↓
   Extract Importers
        ↓
   Classify with AI
        ↓
   Verify Websites
        ↓
┌─────────────────────────────────────────────────────┐
│  Agent 1: Company Research                          │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Step 1: Google Scraper API                        │
│  ├─ URL: http://aaziko.google.202.47.115.6.sslip.io│
│  ├─ Input: company_name                            │
│  ├─ Output: Google search results                  │
│  └─ Timeout: 30 seconds                            │
│                                                     │
│  Step 1.5: Global API ← NEW!                       │
│  ├─ URL: https://aaziko.global.202.47.115.6.sslip.io│
│  ├─ Input: ALL company data + Google results      │
│  ├─ Method: POST /api/research                     │
│  └─ Timeout: 10 seconds                            │
│                                                     │
│  Step 2: Website Scraping                          │
│  Step 3: AI Analysis                               │
│  Step 4: Assemble Research                         │
└─────────────────────────────────────────────────────┘
        ↓
   Agent 2: Contact Discovery
        ↓
   Agent 3: Verification
        ↓
   Agent 4: Buyer Intelligence
        ↓
   enriched_buyers (final output)
```

## API 1: Google Scraper

### Endpoint
```
POST http://aaziko.google.202.47.115.6.sslip.io/search
```

### Request
```
Content-Type: application/x-www-form-urlencoded
Body: company_name=<company_name>
```

### Response
```json
{
  "results": [
    {
      "title": "Company Name - Official Site",
      "url": "https://example.com",
      "description": "Company description..."
    }
  ]
}
```

### Example
```bash
curl -X POST "http://aaziko.google.202.47.115.6.sslip.io/search" \
  -d "company_name=Tesla" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

## API 2: Global API

### Endpoint
```
POST https://aaziko.global.202.47.115.6.sslip.io/api/research
```

### Request
```json
{
  "company_name": "Tesla Inc",
  "country": "USA",
  "industry": "Automotive",
  "domain": "tesla.com",
  "trade_stats": {
    "total_shipments": 150,
    "total_value": 5000000,
    "frequency": "monthly"
  },
  "google_results": [
    {
      "title": "Tesla - Electric Vehicles",
      "url": "https://www.tesla.com",
      "description": "Tesla designs and manufactures electric vehicles"
    }
  ],
  "products": ["Electric Vehicles", "Battery Systems"],
  "hs_codes": ["870380", "850760"],
  "timestamp": "2026-03-26T11:53:31.385Z"
}
```

### Example
```bash
curl -X POST "https://aaziko.global.202.47.115.6.sslip.io/api/research" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Tesla Inc",
    "country": "USA",
    "google_results": [...]
  }'
```

## Code Implementation

### New Method: `sendToGlobalAPI()`

```typescript
private async sendToGlobalAPI(
  profile: BuyerProfile,
  googleResults: Array<{ title: string; url: string; description: string }>
): Promise<void> {
  try {
    logger.info(`Sending data to Global API for: ${profile.companyName}`);
    
    // Prepare comprehensive payload
    const payload = {
      company_name: profile.companyName,
      country: profile.country,
      industry: profile.industry,
      domain: profile.domain,
      trade_stats: {
        total_shipments: profile.tradeStats.totalShipments,
        total_value: profile.tradeStats.totalValue,
        frequency: profile.tradeStats.frequency,
      },
      google_results: googleResults,
      products: profile.products.slice(0, 10),
      hs_codes: profile.hsCodes.slice(0, 10),
      timestamp: new Date().toISOString(),
    };

    const response = await axios.post(
      'https://aaziko.global.202.47.115.6.sslip.io/api/research',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    logger.info(`Global API response for ${profile.companyName}:`, {
      status: response.status,
      data: response.data,
    });
  } catch (err: any) {
    // Graceful fallback - don't fail pipeline
    logger.warn(`Global API error - continuing without it`);
  }
}
```

### Updated Research Flow

```typescript
async research(profile: BuyerProfile): Promise<CompanyResearch> {
  // Step 1: Google Scraper API
  const googleResults = await this.googleScraperSearch(profile.companyName);

  // Step 1.5: Send to Global API (NEW!)
  if (googleResults.length > 0) {
    await this.sendToGlobalAPI(profile, googleResults);
  }

  // Step 2: Website Scraping
  const scrapedData = await this.scraper.scrapeWebsite(profile.verifiedWebsite);

  // Step 3: AI Analysis
  const aiAnalysis = await this.analyzeIndiaFit(profile, googleResults, scrapedData);

  // Step 4: Return research
  return { ... };
}
```

## Data Sent to Global API

### Complete Payload Structure

```typescript
{
  // Company identification
  company_name: string;          // "Tesla Inc"
  country: string;               // "USA"
  industry: string | null;       // "Automotive"
  domain: string | null;         // "tesla.com"
  
  // Trade statistics from MongoDB
  trade_stats: {
    total_shipments: number;     // 150
    total_value: number;         // 5000000
    frequency: string;           // "monthly" | "weekly" | "quarterly" | "sporadic"
  };
  
  // Google search results from Step 1
  google_results: Array<{
    title: string;               // "Tesla - Electric Vehicles"
    url: string;                 // "https://www.tesla.com"
    description: string;         // "Tesla designs and manufactures..."
  }>;
  
  // Product information
  products: string[];            // ["Electric Vehicles", "Battery Systems"]
  hs_codes: string[];            // ["870380", "850760"]
  
  // Metadata
  timestamp: string;             // ISO 8601 timestamp
}
```

## Testing

### Test Google Scraper API
```bash
cd TT
node test-google-scraper.js
```

### Test Global API
```bash
cd TT
node test-global-api.js
```

### Test Full Pipeline
```bash
cd TT
npm run build
node -r dotenv/config dist/services/etl/pipeline.js dotenv_config_path=.env
```

## Error Handling

Both APIs have **graceful fallback**:

### If Google Scraper fails:
- ✅ Pipeline continues
- ✅ Global API is skipped (no data to send)
- ✅ Agent uses website scraping + AI analysis

### If Global API fails:
- ✅ Pipeline continues
- ✅ Data is logged but not sent
- ✅ Agent completes research normally

### Timeout Handling
```typescript
// Google Scraper: 30 seconds (scraping takes time)
timeout: 30000

// Global API: 10 seconds (should be fast)
timeout: 10000
```

### Error Types Handled
- `ECONNABORTED` - Timeout
- `ECONNREFUSED` - Connection refused
- `502` - Bad Gateway
- Network errors
- JSON parse errors

## Logs to Watch

### Successful Flow
```
[INFO] CompanyResearchAgent: Calling Google Scraper API for: Tesla Inc
[INFO] CompanyResearchAgent: Google Scraper found 5 results for Tesla Inc
[INFO] CompanyResearchAgent: Sending data to Global API for: Tesla Inc
[INFO] CompanyResearchAgent: Global API response for Tesla Inc: { status: 200, data: {...} }
```

### With Errors
```
[WARN] CompanyResearchAgent: Google Scraper timeout for Tesla Inc - continuing without it
[WARN] CompanyResearchAgent: Global API unavailable for Tesla Inc - continuing without it
```

## Current Status

✅ Google Scraper API integrated  
✅ Global API integrated  
✅ Dual API flow implemented  
✅ Graceful error handling  
✅ Code compiled successfully  
⚠️ Google Scraper API is slow (30+ seconds)  
⚠️ Global API is currently unavailable (502/timeout)  

## When APIs Are Ready

Once both APIs are working:

1. **Google Scraper** will provide search results
2. **Global API** will receive:
   - Company name, country, industry
   - Trade statistics (shipments, value, frequency)
   - Google search results
   - Products and HS codes
   - Timestamp

3. **Global API** can use this data for:
   - Further enrichment
   - External processing
   - Data warehousing
   - Analytics
   - Third-party integrations

## Configuration

No configuration needed! Both APIs are:
- ✅ Hardcoded in the agent
- ✅ No API keys required
- ✅ Automatic fallback if unavailable

## Files Modified

1. `src/services/agents/company-research.agent.ts`
   - Added `sendToGlobalAPI()` method
   - Updated `research()` flow
   - Added error handling

2. Test scripts created:
   - `test-google-scraper.js`
   - `test-global-api.js`

## Next Steps

1. **Fix Global API** - Make sure it's running and accessible
2. **Import trade data** - Load data into `standard_port_data`
3. **Run pipeline** - Test end-to-end flow
4. **Monitor logs** - Watch both API calls
5. **Check Global API** - Verify it receives data correctly

## Rollback (if needed)

To remove Global API integration:

```typescript
// In company-research.agent.ts, remove these lines:
if (googleResults.length > 0) {
  await this.sendToGlobalAPI(profile, googleResults);
}

// And delete the sendToGlobalAPI() method
```

Then rebuild: `npm run build`
