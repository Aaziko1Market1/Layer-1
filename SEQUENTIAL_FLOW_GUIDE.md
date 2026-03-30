# Sequential API Flow - Complete Guide

## 🔄 New Sequential Enrichment Mode

Your pipeline now has TWO modes:

1. **4-Agent Mode** (Old) - Parallel processing
2. **Sequential Mode** (NEW) - Strict sequential API chain

---

## 📊 Sequential Flow (Step by Step)

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Google Scraper API                                      │
│ ──────────────────────────────────────────────────────────────  │
│ URL: http://aaziko.google.202.47.115.6.sslip.io/search         │
│ Input: company_name                                             │
│ Output: Google search results                                   │
│ Timeout: 30 seconds                                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (Pass results to next step)
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Global API                                              │
│ ──────────────────────────────────────────────────────────────  │
│ URL: https://aaziko.global.202.47.115.6.sslip.io/api/research  │
│ Input: Company data + Google results (from Step 1)             │
│ Output: Global API response                                     │
│ Timeout: 10 seconds                                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (Pass results to next step)
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Brave Search API                                        │
│ ──────────────────────────────────────────────────────────────  │
│ URL: https://api.search.brave.com/res/v1/web/search            │
│ Input: Company name + Global results (from Step 2)             │
│ Output: Brave search results                                    │
│ Timeout: 5 seconds                                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (Pass results to next step)
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: AI Analysis                                             │
│ ──────────────────────────────────────────────────────────────  │
│ Input: All previous results (Google + Global + Brave)          │
│ Output: AI analysis (fit score, business model, etc.)          │
│ Timeout: 15 seconds                                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (Pass results to next step)
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Apollo API                                              │
│ ──────────────────────────────────────────────────────────────  │
│ URL: https://api.apollo.io/v1/mixed_people/search              │
│ Input: Company name + AI results (from Step 4)                 │
│ Output: Contact list from Apollo                                │
│ Timeout: 10 seconds                                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (Pass results to next step)
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Hunter.io API                                           │
│ ──────────────────────────────────────────────────────────────  │
│ URL: https://api.hunter.io/v2/domain-search                     │
│ Input: Company domain + Apollo results (from Step 5)           │
│ Output: Email list from Hunter.io                               │
│ Timeout: 10 seconds                                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (Pass results to next step)
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: Snov API                                                │
│ ──────────────────────────────────────────────────────────────  │
│ URL: https://api.snov.io/v1/get-domain-emails-with-info        │
│ Input: Company domain + Hunter results (from Step 6)           │
│ Output: Email list from Snov                                    │
│ Timeout: 10 seconds                                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (Pass ALL emails to final step)
┌─────────────────────────────────────────────────────────────────┐
│ STEP 8: ZeroBounce API (MANDATORY!)                             │
│ ──────────────────────────────────────────────────────────────  │
│ URL: https://api.zerobounce.net/v2/validate                     │
│ Input: ALL emails from Apollo + Hunter + Snov (Steps 5-7)      │
│ Output: Verified emails with status                             │
│ Timeout: 5 seconds per email                                    │
│ ⚠️  THIS STEP IS MANDATORY - Pipeline fails if it fails!        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                    ✅ COMPLETE
```

---

## 🚀 How to Run Sequential Mode

### Method 1: Command Line (Recommended)

```bash
cd TT

# Build first
npm run build

# Run with --sequential flag
node -r dotenv/config dist/services/etl/pipeline.js \
  100 50 25 10 \
  --sequential \
  dotenv_config_path=.env

# Args: extractLimit classifyLimit verifyLimit agentLimit --sequential
```

### Method 2: Via API

```bash
curl -X POST http://localhost:4400/api/analytics/run-etl \
  -H 'Content-Type: application/json' \
  -d '{
    "limit": 10,
    "useSequential": true
  }'
```

### Method 3: Programmatically

```typescript
import { runPipeline } from './services/etl/pipeline';

const result = await runPipeline({
  extractLimit: 100,
  classifyLimit: 50,
  agentLimit: 10,
  useSequential: true,  // Enable sequential mode
});
```

---

## 📝 Required API Keys

Add these to your `.env` file:

```bash
# MANDATORY (Pipeline will fail without these)
ZEROBOUNCE_API_KEY=your_zerobounce_key_here

# REQUIRED for full functionality
APOLLO_API_KEY=jerlUbcCitpA_6F4SHBrVA
BRAVE_SEARCH_API_KEY=your_brave_key_here
HUNTER_API_KEY=your_hunter_key_here

# OPTIONAL
SNOV_API_KEY=your_snov_key_here
QWEN_32B_API_KEY=your_ai_key_here
```

**⚠️ IMPORTANT:** ZeroBounce API key is MANDATORY! The pipeline will throw an error if it's missing.

---

## 📊 What Data Flows Between Steps

### Step 1 → Step 2 (Google → Global)
```json
{
  "company_name": "Tesla Inc",
  "google_results": [
    {
      "title": "Tesla - Electric Vehicles",
      "url": "https://www.tesla.com",
      "description": "Tesla designs and manufactures..."
    }
  ],
  "trade_stats": { ... },
  "products": [...],
  "hs_codes": [...]
}
```

### Step 2 → Step 3 (Global → Brave)
```json
{
  "company_name": "Tesla Inc",
  "global_data": {
    "status": "success",
    "data": { ... }
  }
}
```

### Step 3 → Step 4 (Brave → AI)
```json
{
  "company_name": "Tesla Inc",
  "brave_results": [...],
  "global_data": { ... }
}
```

### Step 4 → Step 5 (AI → Apollo)
```json
{
  "company_name": "Tesla Inc",
  "ai_analysis": {
    "india_fit_score": 85,
    "business_model": "Manufacturing",
    "recommendation": "High potential"
  },
  "brave_data": { ... }
}
```

### Step 5 → Step 6 (Apollo → Hunter)
```json
{
  "domain": "tesla.com",
  "apollo_contacts": [
    {
      "name": "John Doe",
      "email": "john@tesla.com",
      "title": "Procurement Manager"
    }
  ],
  "ai_data": { ... }
}
```

### Step 6 → Step 7 (Hunter → Snov)
```json
{
  "domain": "tesla.com",
  "hunter_emails": [
    {
      "value": "jane@tesla.com",
      "type": "personal"
    }
  ],
  "apollo_data": { ... }
}
```

### Step 7 → Step 8 (Snov → ZeroBounce)
```json
{
  "emails_to_verify": [
    "john@tesla.com",
    "jane@tesla.com",
    "contact@tesla.com"
  ],
  "snov_data": { ... },
  "hunter_data": { ... },
  "apollo_data": { ... }
}
```

### Step 8 Output (ZeroBounce Final)
```json
{
  "verified_emails": [
    {
      "email": "john@tesla.com",
      "status": "valid",
      "valid": true
    },
    {
      "email": "jane@tesla.com",
      "status": "invalid",
      "valid": false
    }
  ],
  "valid_count": 1,
  "total_count": 2
}
```

---

## ⏱️ Timing & Performance

### Per Buyer Processing Time

| Step | API | Time | Cumulative |
|------|-----|------|------------|
| 1 | Google Scraper | ~30s | 30s |
| 2 | Global API | ~10s | 40s |
| 3 | Brave Search | ~5s | 45s |
| 4 | AI Analysis | ~15s | 60s |
| 5 | Apollo | ~10s | 70s |
| 6 | Hunter.io | ~10s | 80s |
| 7 | Snov | ~10s | 90s |
| 8 | ZeroBounce | ~5s × emails | 95-120s |

**Total: ~2 minutes per buyer**

### Batch Processing

- **10 buyers:** ~20-30 minutes
- **100 buyers:** ~3-4 hours
- **1000 buyers:** ~30-40 hours

**Recommendation:** Run overnight or in small batches (10-20 buyers)

---

## 🔍 Monitoring Progress

### Watch Logs in Real-Time

```bash
tail -f logs/combined.log
```

### Expected Log Output

```
[INFO] [STEP 1/8] Google Scraper API for: Tesla Inc
[INFO] ✅ Google API: Found 5 results
[INFO] [STEP 2/8] Global API for: Tesla Inc
[INFO] ✅ Global API: Response received
[INFO] [STEP 3/8] Brave Search API for: Tesla Inc
[INFO] ✅ Brave Search: Found 5 results
[INFO] [STEP 4/8] AI Analysis for: Tesla Inc
[INFO] ✅ AI Analysis: Complete
[INFO] [STEP 5/8] Apollo API for: Tesla Inc
[INFO] ✅ Apollo API: Found 3 contacts
[INFO] [STEP 6/8] Hunter.io API for: Tesla Inc
[INFO] ✅ Hunter.io API: Found 2 emails
[INFO] [STEP 7/8] Snov API for: Tesla Inc
[INFO] ✅ Snov API: Found 1 emails
[INFO] [STEP 8/8] ZeroBounce API (MANDATORY) for: Tesla Inc
[INFO] ✅ ZeroBounce: john@tesla.com - valid
[INFO] ✅ ZeroBounce: jane@tesla.com - invalid
[INFO] ✅ ZeroBounce: Verified 2 emails
[INFO] ✅ SUCCESS: Tesla Inc enriched successfully
```

### Check Database

```bash
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"

use aaziko_trade

# Count enriched buyers
db.buyer_profiles.countDocuments({ status: "enriched" })

# See latest enriched buyer
db.buyer_profiles.findOne(
  { status: "enriched" },
  { sort: { updatedAt: -1 } }
)

# Check sequential enrichment data
db.buyer_profiles.findOne(
  { "sequential_enrichment.status": "complete" },
  { sequential_enrichment: 1, companyName: 1 }
)
```

---

## ❌ Error Handling

### If Any Step Fails (Except ZeroBounce)

- ✅ Pipeline continues to next step
- ⚠️ Error is logged
- 📝 Step marked as failed in data
- ✅ Remaining steps still execute

### If ZeroBounce Fails (MANDATORY)

- ❌ Pipeline stops for that buyer
- ❌ Buyer marked as "enrichment_failed"
- 📝 Error logged
- ⚠️ Next buyer starts processing

### Common Errors

**"ZeroBounce API key not configured"**
```bash
# Add to .env
ZEROBOUNCE_API_KEY=your_key_here
```

**"Google Scraper timeout"**
- Normal! API takes 30+ seconds
- Check if API is running
- Pipeline continues anyway

**"Global API unavailable"**
- Check if API is online
- Pipeline continues anyway

**"No domain available for Hunter/Snov"**
- Normal for some companies
- Those steps are skipped
- Pipeline continues

---

## 🆚 Sequential vs 4-Agent Mode

| Feature | Sequential Mode | 4-Agent Mode |
|---------|----------------|--------------|
| **Processing** | One step at a time | Parallel agents |
| **Speed** | Slower (~2 min/buyer) | Faster (~1 min/buyer) |
| **Data Flow** | Strict chain | Independent |
| **APIs** | 8 APIs in sequence | 4 agents parallel |
| **ZeroBounce** | Mandatory | Optional |
| **Use Case** | When order matters | When speed matters |

### When to Use Sequential Mode

✅ When you need strict API order  
✅ When each API depends on previous results  
✅ When ZeroBounce verification is mandatory  
✅ When you want complete data chain  

### When to Use 4-Agent Mode

✅ When you need faster processing  
✅ When APIs are independent  
✅ When some APIs can fail  
✅ When you want parallel execution  

---

## 🧪 Testing Sequential Mode

### Test with 1 Buyer

```bash
cd TT
npm run build

# Process just 1 buyer
node -r dotenv/config dist/services/etl/pipeline.js \
  1 1 1 1 \
  --sequential \
  dotenv_config_path=.env
```

### Check Results

```bash
# Watch logs
tail -f logs/combined.log

# Check database
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"
use aaziko_trade
db.buyer_profiles.findOne({ status: "enriched" })
```

---

## 📚 Files Modified

1. `src/services/agents/sequential-enrichment.agent.ts` - NEW sequential agent
2. `src/services/etl/agent-runner.ts` - Added runSequentialEnrichment()
3. `src/services/etl/pipeline.ts` - Added useSequential option

---

## ✅ Success Checklist

- [ ] All API keys configured in .env
- [ ] ZeroBounce API key added (MANDATORY)
- [ ] Project built (`npm run build`)
- [ ] Trade data available in database
- [ ] Run with `--sequential` flag
- [ ] Monitor logs (`tail -f logs/combined.log`)
- [ ] Check enriched buyers in database

---

## 🆘 Quick Commands

```bash
# Build
npm run build

# Run sequential mode (10 buyers)
node -r dotenv/config dist/services/etl/pipeline.js 10 10 10 10 --sequential dotenv_config_path=.env

# Watch logs
tail -f logs/combined.log

# Check results
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"
```

Good luck! 🚀
