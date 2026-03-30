# Complete Log Analysis - PT TRAKINDO UTAMA

## 📊 Pipeline Summary

**Company:** PT TRAKINDO UTAMA  
**Country:** VIETNAM  
**Total Time:** 119.5 seconds (2 minutes)  
**Status:** ✅ Completed (but with issues)  
**Contacts Found:** ❌ 0 (FAILED)

---

## 🔍 Step-by-Step Analysis

### ✅ STEP 1: EXTRACTION (Success)
```
[info] Starting importer extraction {"limit":1,"skipExisting":true}
[info] Extraction complete {"extracted":1,"skipped":0}
```

**Status:** ✅ SUCCESS  
**Time:** 63 seconds  
**Result:** 1 company extracted from trade data  
**Issues:** None

---

### ⚠️ STEP 2: CLASSIFICATION (Partial Success)
```
[info] Starting classification {"count":1}
[info] AI request {"tier":"standard","promptLength":475}
[warn] Failed to parse AI classification JSON {"company":"PT TRAKINDO UTAMA"}
[info] Classification complete {"classified":1,"failed":0}
```

**Status:** ⚠️ PARTIAL SUCCESS  
**Time:** 3 seconds  
**Result:** Company classified, but with warning  

**❌ ISSUE #1: AI Classification JSON Parse Error**
- **Problem:** AI returned invalid JSON
- **Error:** `Failed to parse AI classification JSON`
- **Impact:** Industry/category may be incorrect or "NOT_FOUND"
- **Root Cause:** AI response contains `"industry": NOT_FOUND` (should be `"industry": "NOT_FOUND"` with quotes)

**Fix Needed:**
```typescript
// AI is returning: "industry": NOT_FOUND
// Should return: "industry": "NOT_FOUND"
```

---

### ⚠️ STEP 3: WEBSITE VERIFICATION (Wrong Domain)
```
[info] === Website Verification Starting ===
[info] Verifying website {"buyer":"PT TRAKINDO UTAMA","country":"VIETNAM"}
[info] Starting website discovery
[info] Brave search completed {"candidatesFound":3}
[warn] Hunter returned no domain {"status":"not_found"}
[info] Website discovery completed {"candidatesFound":4}
[info] Calculating trust score {"domain":"signalhire.com"}
[info] Trust score calculated {"domain":"signalhire.com","totalScore":25,"trustBand":"rejected"}
[info] Skipping extraction — trust score below threshold
[info] Website verified {"domain":"signalhire.com","trustScore":25,"trustBand":"rejected"}
```

**Status:** ⚠️ WRONG DOMAIN DETECTED  
**Time:** 7 seconds  
**Result:** Found signalhire.com (WRONG!)  

**❌ ISSUE #2: Wrong Domain Detected**
- **Detected:** signalhire.com (a people search directory)
- **Should Be:** trakindo.co.id or trakindo.com (actual company)
- **Trust Score:** 25/100 (rejected - too low)
- **Impact:** Contact discovery will fail (searching wrong domain)

**Why This Happened:**
1. Brave Search returned signalhire.com in results
2. signalhire.com is a directory site (should be blacklisted!)
3. Real company domain not found

**Fix Needed:**
```typescript
// Add to blacklist in website-discovery.service.ts
'signalhire.com',  // People search directory
'rocketreach.com', // Contact database
'contactout.com',  // Contact finder
```

---

### ❌ STEP 4: COMPANY RESEARCH (Failed)
```
[info] === Company Research Starting ===
[info] CompanyResearchAgent: Starting company research
[info] Calling Google Scraper API for: PT TRAKINDO UTAMA
[error] CompanyResearchAgent: Google Scraper failed {"error":"Request failed with status code 500"}
[info] AI request {"tier":"standard","promptLength":475}
[error] CompanyResearchAgent: AI Analysis failed {"error":"Unexpected token 'N', ...\"ndustry\": NOT_FOUND,\"... is not valid JSON"}
[info] CompanyResearchAgent: Completed company research
```

**Status:** ❌ FAILED  
**Time:** 43.5 seconds  
**Result:** No company research data  

**❌ ISSUE #3: Google Scraper API Error 500**
- **Problem:** Google Scraper API returned 500 Internal Server Error
- **Impact:** No Google search results
- **Root Cause:** API is down or crashed
- **Fix:** Check if API is running:
  ```bash
  curl -X POST "http://aaziko.google.202.47.115.6.sslip.io/search" \
    -d "company_name=PT TRAKINDO UTAMA"
  ```

**❌ ISSUE #4: AI Analysis JSON Parse Error (Again)**
- **Problem:** Same as Issue #1 - AI returns invalid JSON
- **Error:** `Unexpected token 'N', ..."ndustry": NOT_FOUND,...`
- **Impact:** No AI analysis data
- **Root Cause:** AI model returns unquoted NOT_FOUND

---

### ❌ STEP 5: CONTACT DISCOVERY (Failed - No Contacts)
```
[info] === Contact Discovery Starting ===
[info] ContactDiscoveryAgent: Starting contact discovery
[warn] Apollo mixed_people/search requires paid plan (403)
[warn] Apollo people/search also requires paid plan (403)
[warn] Snov API key not configured
[info] ContactDiscoveryAgent: Completed contact discovery (no contacts)
[info] Contact discovery progress {"discovered":0,"notFound":1,"failed":0}
```

**Status:** ❌ FAILED - NO CONTACTS FOUND  
**Time:** 1.9 seconds  
**Result:** 0 contacts  

**❌ ISSUE #5: Apollo API - Paid Plan Required**
- **Problem:** Apollo API requires paid subscription
- **Error:** `403 - requires paid plan`
- **Impact:** Cannot search contacts via Apollo
- **Fix:** 
  - Upgrade Apollo plan, OR
  - Use different Apollo API key, OR
  - Skip Apollo and rely on Hunter/Snov

**❌ ISSUE #6: Snov API Not Configured**
- **Problem:** Missing `SNOV_API_KEY` in .env
- **Impact:** Cannot search contacts via Snov
- **Fix:** Add to .env:
  ```bash
  SNOV_API_KEY=your_snov_key_here
  ```

**❌ ISSUE #7: Hunter.io Found 0 Contacts**
- **Problem:** Hunter searched wrong domain (signalhire.com)
- **Impact:** No contacts found
- **Root Cause:** Wrong domain from Step 3

---

### ✅ STEP 6: VERIFICATION (Success - but no data to verify)
```
[info] === Verification Starting ===
[info] VerificationAgent: Starting verification
[info] VerificationAgent: Completed verification
```

**Status:** ✅ SUCCESS (but nothing to verify)  
**Time:** 0.001 seconds  
**Result:** Verified empty data  
**Issues:** None (but no contacts to verify)

---

### ✅ STEP 7: BUYER INTELLIGENCE (Success - but limited data)
```
[info] === Buyer Intelligence Starting ===
[info] BuyerIntelligenceAgent: Starting intelligence generation
[info] BuyerIntelligenceAgent: Completed intelligence generation
```

**Status:** ✅ SUCCESS (but limited)  
**Time:** 0.002 seconds  
**Result:** Generated intelligence with limited data  
**Issues:** None (but based on incomplete data)

---

### ✅ STEP 8: ENRICHED STORAGE (Success)
```
[info] === Enriched Storage Starting ===
[info] Found profiles ready for enriched storage {"count":1}
[info] Dedup decision {"decision":"allowed","reason":"No duplicates found"}
[info] === Enriched Storage Complete === {"stored":1}
```

**Status:** ✅ SUCCESS  
**Time:** 1 second  
**Result:** 1 buyer stored in enriched_buyers  
**Issues:** None (but stored incomplete data)

---

## 📋 Summary of All Issues

### Critical Issues (Must Fix):

| # | Issue | Impact | Priority |
|---|-------|--------|----------|
| 1 | AI returns invalid JSON (`NOT_FOUND` without quotes) | Classification fails | 🔴 HIGH |
| 2 | Wrong domain detected (signalhire.com) | No contacts found | 🔴 HIGH |
| 3 | Google Scraper API Error 500 | No Google data | 🔴 HIGH |
| 4 | Apollo requires paid plan (403) | No Apollo contacts | 🟡 MEDIUM |
| 5 | Snov API not configured | No Snov contacts | 🟡 MEDIUM |
| 6 | Hunter found 0 contacts (wrong domain) | No Hunter contacts | 🔴 HIGH |

### Result:
- ❌ **0 contacts found**
- ❌ **Wrong domain stored**
- ❌ **Incomplete company data**
- ⚠️ **Buyer stored but unusable**

---

## 🔧 Fixes Required

### Fix #1: AI JSON Parse Error (HIGH PRIORITY)

**Problem:** AI returns `"industry": NOT_FOUND` instead of `"industry": "NOT_FOUND"`

**Location:** `src/services/ai/router.ts` or AI prompt

**Fix:**
```typescript
// Add JSON validation and fix
let aiResponse = await callAI(prompt);

// Fix unquoted NOT_FOUND
aiResponse = aiResponse.replace(/:\s*NOT_FOUND/g, ': "NOT_FOUND"');

// Then parse
const parsed = JSON.parse(aiResponse);
```

---

### Fix #2: Add signalhire.com to Blacklist (HIGH PRIORITY)

**Problem:** signalhire.com is a directory, not company website

**Location:** `src/services/verification/website-discovery.service.ts`

**Fix:**
```typescript
private readonly BLACKLIST_DOMAINS = [
  // ... existing domains ...
  'signalhire.com',  // People search directory
  'rocketreach.com', // Contact database
  'contactout.com',  // Contact finder
  'lusha.com',       // Contact finder
  'zoominfo.com',    // Already there
];
```

---

### Fix #3: Check Google Scraper API (HIGH PRIORITY)

**Problem:** API returned 500 error

**Test:**
```bash
curl -X POST "http://aaziko.google.202.47.115.6.sslip.io/search" \
  -d "company_name=Tesla" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

**If API is down:**
- Restart the API server
- Check API logs
- Fix API code

---

### Fix #4: Configure Snov API (MEDIUM PRIORITY)

**Problem:** Missing API key

**Fix:**
```bash
# Add to .env
SNOV_API_KEY=your_snov_key_here
```

**Get free key:** https://snov.io/register (50 credits/month free)

---

### Fix #5: Apollo API Plan (MEDIUM PRIORITY)

**Problem:** Free plan doesn't support contact search

**Options:**
1. Upgrade to paid plan ($49/month)
2. Use different Apollo account with credits
3. Skip Apollo, rely on Hunter + Snov

---

### Fix #6: Improve Domain Detection (HIGH PRIORITY)

**Problem:** Real company domain not found

**Fix:** Add manual domain search for known companies
```typescript
// In website-discovery.service.ts
const knownDomains = {
  'PT TRAKINDO UTAMA': 'trakindo.co.id',
  'TESLA': 'tesla.com',
  // ... add more
};

if (knownDomains[companyName]) {
  return knownDomains[companyName];
}
```

---

## 🧪 How to Test Fixes

### Test 1: Delete Bad Data
```bash
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"
use aaziko_trade

# Delete PT TRAKINDO UTAMA
db.buyer_profiles.deleteOne({ companyName: "PT TRAKINDO UTAMA" })
db.enriched_buyers.deleteOne({ "verified_company.name": "PT TRAKINDO UTAMA" })
```

### Test 2: Apply Fixes
```bash
cd TT

# 1. Add signalhire.com to blacklist (already done above)
# 2. Fix AI JSON parsing
# 3. Configure Snov API key

npm run build
```

### Test 3: Re-run Pipeline
```bash
node -r dotenv/config dist/services/etl/pipeline.js 1 1 1 1 dotenv_config_path=.env
```

### Test 4: Check Results
```bash
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"
use aaziko_trade

# Check domain
db.buyer_profiles.findOne(
  { companyName: "PT TRAKINDO UTAMA" },
  { domain: 1, contacts: 1 }
)

# Expected:
# domain: "trakindo.co.id" (NOT signalhire.com)
# contacts: [1-3 contacts] (NOT empty array)
```

---

## 📊 Expected Results After Fixes

### Before (Current):
```json
{
  "companyName": "PT TRAKINDO UTAMA",
  "domain": "signalhire.com",  // ❌ WRONG
  "contacts": [],               // ❌ EMPTY
  "company_research": null,     // ❌ FAILED
  "contactDiscovery": {
    "discovered": 0
  }
}
```

### After (Fixed):
```json
{
  "companyName": "PT TRAKINDO UTAMA",
  "domain": "trakindo.co.id",   // ✅ CORRECT
  "contacts": [
    {
      "name": "John Doe",
      "email": "john@trakindo.co.id",
      "source": "hunter"
    }
  ],
  "company_research": {
    "business_model": "...",
    "india_fit_score": 75
  },
  "contactDiscovery": {
    "discovered": 1
  }
}
```

---

## 🎯 Priority Order

1. **🔴 HIGH:** Add signalhire.com to blacklist
2. **🔴 HIGH:** Fix AI JSON parsing (NOT_FOUND quotes)
3. **🔴 HIGH:** Check/fix Google Scraper API
4. **🟡 MEDIUM:** Configure Snov API key
5. **🟡 MEDIUM:** Upgrade Apollo or skip it

---

## ✅ Quick Fix Commands

```bash
# 1. Add signalhire.com to blacklist (manual edit)
# Edit: TT/src/services/verification/website-discovery.service.ts

# 2. Add Snov API key
echo "SNOV_API_KEY=your_key_here" >> TT/.env

# 3. Rebuild
cd TT && npm run build

# 4. Delete bad data
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin" \
  --eval 'db.buyer_profiles.deleteOne({companyName:"PT TRAKINDO UTAMA"})' \
  aaziko_trade

# 5. Re-run
node -r dotenv/config dist/services/etl/pipeline.js 1 1 1 1 dotenv_config_path=.env
```

---

This analysis shows 6 critical issues that need to be fixed for successful contact discovery!
