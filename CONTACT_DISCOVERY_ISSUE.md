# ⚠️ Contact Discovery Issue - Why Contacts Are NULL

## 🎯 Problem

Contacts and emails are NULL/empty in enriched buyers.

## 🔍 Root Causes Found

### 1. Apollo API Error 422
```
[error] Apollo company search failed 
{"companyName":"PT TRAKINDO UTAMA","status":422,"error":"Request failed with status code 422"}
```

**What this means:**
- Apollo API is rejecting the request
- HTTP 422 = "Unprocessable Entity"
- Usually means invalid request format or missing required fields

**Possible reasons:**
- API key is invalid or expired
- Request format is incorrect
- Company name format is not accepted
- API quota exceeded

### 2. Hunter API Returns "not_found"
```
[warn] Hunter returned no domain 
{"companyName":"PT TRAKINDO UTAMA","status":"not_found"}
```

**What this means:**
- Hunter API cannot find the company
- No domain/website associated with this company name
- This is VALID - NOT_FOUND is an honest response

### 3. No Domain Available
The buyers have `domain: NULL` because:
- Website verification found domains but they were rejected (low trust score)
- Brave Search found "volza.com" and "eximpedia.app" which are NOT company websites
- These are trade data aggregator sites, not the actual company websites

### 4. Contact Discovery Waterfall Failed
```
Apollo (422 error) → Hunter (not found) → Snov (not configured) → Website (no domain)
Result: contacts = [] (empty array)
```

## 📊 Pipeline Results

```json
{
  "contactDiscovery": {
    "discovered": 0,      // No contacts found
    "notFound": 2,        // 2 buyers had no contacts
    "failed": 0           // No failures (NOT_FOUND is valid)
  }
}
```

## 🔧 How to Fix

### Fix 1: Check Apollo API Key

**Check if API key is valid:**
```bash
# Test Apollo API directly
curl -X POST https://api.apollo.io/v1/mixed_people/search \
  -H "Content-Type: application/json" \
  -H "Cache-Control: no-cache" \
  -H "X-Api-Key: YOUR_APOLLO_KEY" \
  -d '{
    "q_organization_name": "Microsoft",
    "page": 1,
    "per_page": 10
  }'
```

**If you get 422 error:**
- API key might be invalid
- Request format might be wrong
- Check Apollo API documentation for correct format

### Fix 2: Update Apollo API Request Format

The current code might be using wrong request format. Check:
- `src/services/enrichment/apollo.service.ts`
- Verify request body matches Apollo API docs
- Check required fields

### Fix 3: Use Real Company Names

The current companies are from real trade data but might be:
- Small companies not in Apollo/Hunter databases
- Non-English company names (PT = Indonesian, LLP = Kazakhstan)
- Regional companies not indexed by US-based APIs

**Test with well-known companies:**
```bash
# Try with a well-known company
# Edit extractor to filter by specific company name
```

### Fix 4: Configure Snov API

Add Snov API key as backup:
```bash
# In .env file
SNOV_API_KEY=your_snov_api_key_here
```

### Fix 5: Accept NOT_FOUND as Valid

Remember: **NOT_FOUND is a VALID output!**

The system is designed to be honest:
- If no contacts found → `contacts = []`
- If no email found → `email = null`
- This is NOT an error, it's correct behavior

## 📋 Diagnostic Steps

### Step 1: Check API Keys
```bash
cat TT/.env | grep -E "(APOLLO|HUNTER|SNOV|ZEROBOUNCE)_API_KEY"
```

### Step 2: Test Apollo API Directly
```bash
# Create test-apollo-api.js
node test-apollo-api.js
```

### Step 3: Check Logs
```bash
tail -100 TT/logs/combined.log | grep -E "(Apollo|Hunter|Contact)"
```

### Step 4: Run Diagnostic
```bash
node diagnose-null-data.js
```

## 🎯 Expected Behavior

### For Real, Well-Known Companies
```javascript
{
  contacts: [
    {
      name: "John Doe",
      title: "Procurement Manager",
      email: "john.doe@company.com",
      emailVerified: true,
      source: "apollo"
    }
  ],
  enrichment: {
    apollo: { status: "success", credits_used: 1 },
    hunter: null  // Not used (Apollo succeeded)
  }
}
```

### For Small/Regional/Unknown Companies
```javascript
{
  contacts: [],  // ✅ VALID - No contacts found
  enrichment: {
    apollo: { status: "not_found", credits_used: 1 },
    hunter: { status: "not_found", credits_used: 1 },
    snov: null  // Not configured
  },
  status: "contact_not_found"  // ✅ VALID STATE
}
```

## ✅ What's Working

- ✅ Pipeline runs all 9 steps
- ✅ Extraction works (5 buyers extracted)
- ✅ Classification works (with graceful degradation)
- ✅ Website verification works
- ✅ Company research works (with defaults)
- ✅ Contact discovery runs (waterfall logic works)
- ✅ Verification works
- ✅ Intelligence works (with defaults)
- ✅ Storage works

## ⚠️ What's Not Working

- ❌ Apollo API returns 422 errors
- ⚠️ Hunter API finds no companies (expected for regional companies)
- ⚠️ No real company websites found (Brave finds aggregator sites)
- ⚠️ AI classification fails (no API keys configured)

## 💡 Recommendations

### Short Term
1. **Accept NOT_FOUND as valid** - This is correct behavior
2. **Test with well-known companies** - Try "Microsoft", "Apple", etc.
3. **Fix Apollo API 422 error** - Check API key and request format
4. **Configure Snov API** - Add backup contact source

### Long Term
1. **Use real company data** - Import trade data with well-known companies
2. **Configure all API keys** - Apollo, Hunter, Snov, ZeroBounce, Brave, AI
3. **Test with US/EU companies** - Better coverage in Apollo/Hunter databases
4. **Add manual contact enrichment** - For companies not in APIs

## 📖 Related Files

- `src/services/agents/contact-discovery.agent.ts` - Contact discovery logic
- `src/services/enrichment/apollo.service.ts` - Apollo API integration
- `src/services/enrichment/hunter.service.ts` - Hunter API integration
- `API_DATA_MAPPING.md` - Complete API mapping
- `diagnose-null-data.js` - Diagnostic script

---

## 🎓 Key Takeaway

**NULL contacts is often EXPECTED and VALID behavior!**

The system is designed to be honest:
- Small/regional companies → May not be in Apollo/Hunter
- Non-English companies → May not be indexed
- B2C companies → May not have procurement contacts
- New companies → May not be in databases yet

**This is NOT a bug, it's the system working correctly!** ✅

The real issue is the **Apollo API 422 error** which needs investigation.
