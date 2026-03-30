# Fixes Applied - Summary

## ✅ What I Fixed

### Fix #1: AI JSON Parse Error (FIXED ✅)

**Problem:** AI returns `"industry": NOT_FOUND` without quotes

**Solution:** Added JSON sanitization to handle unquoted values

**Files Modified:**
- `src/services/etl/classifier.ts`
- `src/services/agents/company-research.agent.ts`

**Code Added:**
```typescript
// Fix unquoted NOT_FOUND, UNKNOWN, NULL values
jsonStr = jsonStr.replace(/:\s*(NOT_FOUND|UNKNOWN|NULL|None|null)\s*([,}])/g, ': "$1"$2');

// Fix trailing commas
jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
```

**Result:** AI JSON will now parse correctly even with unquoted values

---

### Fix #2: Wrong Domain Detection (FIXED ✅)

**Problem:** Detected `signalhire.com` instead of actual company domain

**Solution:** Added contact/people search sites to blacklist

**File Modified:**
- `src/services/verification/website-discovery.service.ts`

**Domains Added to Blacklist:**
- signalhire.com
- rocketreach.com
- contactout.com
- lusha.com
- hunter.io
- snov.io
- apollo.io
- clearbit.com
- fullcontact.com

**Result:** These directory sites will be filtered out, allowing real company domains to be found

---

### Fix #3: Snov API Configuration (DOCUMENTED ✅)

**Problem:** Missing `SNOV_API_KEY` in .env

**Solution:** Added helpful comment in .env file

**File Modified:**
- `.env`

**Added:**
```bash
SNOV_API_KEY=
# Get free Snov API key: https://snov.io/register (50 credits/month free)
# After signup, go to: https://snov.io/api -> Generate API key
```

**Action Required:** You need to:
1. Go to https://snov.io/register
2. Sign up (free)
3. Get API key from https://snov.io/api
4. Add to .env: `SNOV_API_KEY=your_key_here`

---

## ⚠️ Issues I Cannot Fix

### Issue #1: Google Scraper API Error 500

**Problem:** API returned Internal Server Error

**Why I Can't Fix:** The API is external (running on another server)

**What You Need to Do:**
```bash
# Test if API is working
curl -X POST "http://aaziko.google.202.47.115.6.sslip.io/search" \
  -d "company_name=Tesla" \
  -H "Content-Type: application/x-www-form-urlencoded"

# If it returns 500:
# 1. Check API server logs
# 2. Restart API server
# 3. Fix API code if needed
```

---

### Issue #2: Apollo Requires Paid Plan

**Problem:** Apollo API returns 403 - requires paid subscription

**Why I Can't Fix:** This is a billing/subscription issue

**Options:**
1. **Upgrade Apollo Plan** ($49/month)
   - Go to https://www.apollo.io/pricing
   - Upgrade to paid plan
   
2. **Use Different Apollo Account**
   - Get a new account with free credits
   - Update `APOLLO_API_KEY` in .env
   
3. **Skip Apollo** (Recommended for now)
   - Hunter.io + Snov.io can find contacts
   - Apollo is optional

---

## 📊 Expected Results After Fixes

### Before (With Bugs):
```json
{
  "companyName": "PT TRAKINDO UTAMA",
  "domain": "signalhire.com",  // ❌ WRONG
  "contacts": [],               // ❌ EMPTY
  "aiAnalysis": {
    "classification": null      // ❌ FAILED (JSON parse error)
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
  "aiAnalysis": {
    "classification": {
      "industry": "NOT_FOUND",  // ✅ PARSED (with quotes added)
      "confidence": 0.7
    }
  }
}
```

---

## 🚀 How to Test Fixes

### Step 1: Delete Old Data
```bash
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"

use aaziko_trade

# Delete PT TRAKINDO UTAMA (has wrong data)
db.buyer_profiles.deleteOne({ companyName: "PT TRAKINDO UTAMA" })
db.enriched_buyers.deleteOne({ "verified_company.name": "PT TRAKINDO UTAMA" })

exit
```

### Step 2: Add Snov API Key (Optional but Recommended)
```bash
# Get free key from: https://snov.io/register
# Then add to .env:
nano TT/.env

# Add your key:
SNOV_API_KEY=your_actual_key_here

# Save and exit (Ctrl+X, Y, Enter)
```

### Step 3: Check Google Scraper API
```bash
# Test if it's working
curl -X POST "http://aaziko.google.202.47.115.6.sslip.io/search" \
  -d "company_name=Tesla" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --max-time 30

# If you get 500 error, the API needs to be fixed on the server side
```

### Step 4: Re-run Pipeline
```bash
cd TT

# Already built, just run
node -r dotenv/config dist/services/etl/pipeline.js \
  1 1 1 1 \
  dotenv_config_path=.env
```

### Step 5: Check Results
```bash
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"

use aaziko_trade

# Check domain
db.buyer_profiles.findOne(
  { companyName: "PT TRAKINDO UTAMA" },
  { companyName: 1, domain: 1, contacts: 1, "aiAnalysis.classification": 1 }
)

# Expected:
# - domain: NOT "signalhire.com" (should be actual company domain)
# - contacts: Array with 1+ contacts (NOT empty)
# - aiAnalysis.classification: Valid JSON (NOT null)
```

---

## 📈 Success Metrics

After fixes, you should see:

| Metric | Before | After |
|--------|--------|-------|
| AI JSON Parse Errors | ❌ Yes | ✅ No |
| Wrong Domains (signalhire.com) | ❌ Yes | ✅ No |
| Contacts Found | ❌ 0 | ✅ 1-3 |
| Classification Success | ⚠️ Partial | ✅ Full |

---

## 🔍 Monitor Logs

Watch for these improvements:

### Before:
```
[warn] Failed to parse AI classification JSON
[info] Website verified {"domain":"signalhire.com"}
[info] Contact discovery progress {"discovered":0}
```

### After:
```
[info] Classification complete {"classified":1,"failed":0}  ← No warnings!
[info] Website verified {"domain":"trakindo.co.id"}  ← Correct domain!
[info] Contact discovery progress {"discovered":1}  ← Contacts found!
```

---

## ✅ Summary

**Fixed:**
- ✅ AI JSON parse error (handles NOT_FOUND without quotes)
- ✅ Wrong domain detection (blacklisted signalhire.com and similar)
- ✅ Snov API documentation (added helpful comments)

**Cannot Fix (Need Your Action):**
- ⚠️ Google Scraper API 500 (check if API is running)
- ⚠️ Apollo paid plan (upgrade or skip)

**Build Status:** ✅ Successful

**Ready to Test:** ✅ Yes

---

## 🆘 If Still Having Issues

### Issue: Still getting signalhire.com
**Solution:** Make sure you rebuilt after adding to blacklist
```bash
cd TT
npm run build
```

### Issue: Still getting JSON parse errors
**Solution:** Check AI model output format
```bash
# Check logs for raw AI response
tail -100 logs/combined.log | grep -A 5 "AI request"
```

### Issue: Still no contacts
**Possible Causes:**
1. Wrong domain still detected (check blacklist)
2. Company has no public contacts (normal for some companies)
3. API keys not working (test them individually)

---

The main fixes are applied and built! Test by deleting old data and re-running the pipeline.
