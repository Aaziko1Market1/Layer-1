# Contact Discovery Issues - Diagnosis & Fix

## 🔍 Issues Found in Your Log

### Issue 1: Apollo API - Paid Plan Required ❌
```
[warn] Apollo mixed_people/search requires paid plan (403)
[warn] Apollo people/search also requires paid plan (403)
```

**Problem:** Your Apollo API key doesn't have access to contact search endpoints.

**Solutions:**
1. Upgrade Apollo plan to include contact search
2. Use alternative free API key
3. Skip Apollo and rely on Hunter/Snov

---

### Issue 2: Hunter.io - Found 0 Contacts ❌
```
[info] Hunter: Found 0 contacts for domain volza.com
```

**Problem:** Wrong domain detected! 
- Detected: `volza.com` (a trade data website)
- Should be: Actual company domain

**Root Cause:** Website verification found volza.com in search results instead of real company website.

---

### Issue 3: Snov API - Not Configured ❌
```
[warn] Snov API key not configured
```

**Problem:** Missing `SNOV_API_KEY` in .env file.

---

### Issue 4: Google Scraper - Timeout ⏱️
```
[error] Google Scraper timeout after 30000ms
```

**Problem:** Google Scraper API taking too long (>30 seconds).

---

### Issue 5: Wrong Domain Detection 🌐
```
[info] Website verified {"domain":"volza.com","trustScore":25,"trustBand":"rejected"}
```

**Problem:** 
- Found: volza.com (trade data aggregator)
- This is NOT the company's actual website
- Hunter/Snov can't find contacts for wrong domain

---

## 🔧 Fixes to Apply

### Fix 1: Improve Domain Detection

The issue is that Brave Search returns trade data sites (volza.com, importgenius.com) instead of actual company websites.

**Update website verification to filter out these sites:**

```typescript
// Add to website-discovery.service.ts
const BLACKLIST_DOMAINS = [
  'volza.com',
  'importgenius.com',
  'panjiva.com',
  'trademap.org',
  'zauba.com',
  'seair.co.in',
  'infodriveindia.com',
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'wikipedia.org',
  'bloomberg.com',
  'crunchbase.com'
];

// Filter candidates
candidates = candidates.filter(c => {
  const domain = new URL(c.url).hostname.replace('www.', '');
  return !BLACKLIST_DOMAINS.some(bl => domain.includes(bl));
});
```

---

### Fix 2: Add Manual Domain Lookup

If automatic detection fails, try manual domain search:

```typescript
// Try company name + official site
const manualSearch = await braveSearch(`${companyName} official website`);

// Try company name + domain
const domainSearch = await braveSearch(`${companyName} site:*.com OR site:*.co.id`);
```

---

### Fix 3: Configure All API Keys

Add to `.env`:

```bash
# Apollo (get free or paid key)
APOLLO_API_KEY=your_working_apollo_key

# Hunter.io (get free key - 50 searches/month)
HUNTER_API_KEY=your_hunter_key

# Snov (get free key - 50 credits/month)
SNOV_API_KEY=your_snov_key

# ZeroBounce (get free key - 100 verifications/month)
ZEROBOUNCE_API_KEY=your_zerobounce_key

# Brave Search (for better domain discovery)
BRAVE_SEARCH_API_KEY=your_brave_key
```

---

### Fix 4: Increase Google Scraper Timeout

```typescript
// In company-research.agent.ts
timeout: 60000, // Increase to 60 seconds
```

---

### Fix 5: Add Fallback Contact Discovery

If all APIs fail, try scraping the website directly:

```typescript
// Scrape contact page
const contactUrls = [
  `${domain}/contact`,
  `${domain}/contact-us`,
  `${domain}/about/contact`,
  `${domain}/get-in-touch`
];

// Extract emails from contact pages
const emails = await scrapeContactPages(contactUrls);
```

---

## 🚀 Quick Fix Implementation

### Step 1: Update Domain Blacklist

```bash
cd TT/src/services/scraping
```

Add blacklist to `website-discovery.service.ts`:

```typescript
private readonly BLACKLIST_DOMAINS = [
  'volza.com',
  'importgenius.com',
  'panjiva.com',
  'trademap.org',
  'zauba.com',
  'seair.co.in',
  'infodriveindia.com',
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'wikipedia.org',
  'bloomberg.com',
  'crunchbase.com',
  'dnb.com',
  'zoominfo.com'
];

// In discoverWebsite method, filter candidates:
candidates = candidates.filter(candidate => {
  const url = new URL(candidate.url);
  const domain = url.hostname.replace('www.', '');
  
  // Check if domain is blacklisted
  const isBlacklisted = this.BLACKLIST_DOMAINS.some(bl => 
    domain.includes(bl) || bl.includes(domain)
  );
  
  return !isBlacklisted;
});
```

### Step 2: Add API Keys

Get free API keys:

1. **Hunter.io:** https://hunter.io/users/sign_up
   - Free: 50 searches/month
   
2. **Snov.io:** https://snov.io/register
   - Free: 50 credits/month
   
3. **ZeroBounce:** https://www.zerobounce.net/members/signup/
   - Free: 100 verifications/month
   
4. **Apollo.io:** https://www.apollo.io/sign-up
   - Free: 50 credits/month (limited features)

Add to `.env`:
```bash
HUNTER_API_KEY=your_key_here
SNOV_API_KEY=your_key_here
ZEROBOUNCE_API_KEY=your_key_here
APOLLO_API_KEY=your_working_key_here
```

### Step 3: Rebuild and Test

```bash
cd TT
npm run build

# Test with 1 buyer
node -r dotenv/config dist/services/etl/pipeline.js 1 1 1 1 dotenv_config_path=.env
```

---

## 🧪 Test Specific Company

To test with PT TRAKINDO UTAMA:

```bash
# Connect to MongoDB
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"

use aaziko_trade

# Find the buyer
db.buyer_profiles.findOne({ companyName: "PT TRAKINDO UTAMA" })

# Check contacts
db.buyer_profiles.findOne(
  { companyName: "PT TRAKINDO UTAMA" },
  { contacts: 1, domain: 1, verifiedWebsite: 1 }
)

# Delete and re-process
db.buyer_profiles.deleteOne({ companyName: "PT TRAKINDO UTAMA" })
db.enriched_buyers.deleteOne({ "verified_company.name": "PT TRAKINDO UTAMA" })
```

Then run pipeline again.

---

## 📊 Expected Results After Fix

### Before (Current):
```json
{
  "companyName": "PT TRAKINDO UTAMA",
  "domain": "volza.com",  // ❌ WRONG
  "contacts": [],          // ❌ EMPTY
  "contactDiscovery": {
    "discovered": 0,
    "notFound": 1
  }
}
```

### After (Fixed):
```json
{
  "companyName": "PT TRAKINDO UTAMA",
  "domain": "trakindo.co.id",  // ✅ CORRECT
  "contacts": [
    {
      "name": "John Doe",
      "email": "john@trakindo.co.id",
      "title": "Procurement Manager",
      "source": "hunter"
    }
  ],
  "contactDiscovery": {
    "discovered": 1,
    "notFound": 0
  }
}
```

---

## 🔍 Debug Commands

### Check what domain was found:
```bash
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"
use aaziko_trade
db.buyer_profiles.find({}, { companyName: 1, domain: 1, verifiedWebsite: 1 })
```

### Check contact discovery results:
```bash
db.buyer_profiles.find(
  { contacts: { $exists: true, $ne: [] } },
  { companyName: 1, contacts: 1 }
)
```

### Check failed contact discoveries:
```bash
db.buyer_profiles.find(
  { contacts: { $size: 0 } },
  { companyName: 1, domain: 1 }
)
```

---

## ⚠️ Important Notes

1. **Domain is critical** - Wrong domain = No contacts
2. **API keys must be valid** - Free tiers have limits
3. **Apollo requires paid plan** - For full contact search
4. **Some companies have no public contacts** - This is normal
5. **Trade data sites are not company websites** - Must filter them out

---

## 🎯 Priority Fixes

1. ✅ **HIGH:** Add domain blacklist (blocks volza.com, etc.)
2. ✅ **HIGH:** Configure Hunter.io API key
3. ✅ **MEDIUM:** Configure Snov API key
4. ✅ **MEDIUM:** Configure ZeroBounce API key
5. ✅ **LOW:** Upgrade Apollo plan or use alternative

---

## 📝 Summary

**Root Cause:** Wrong domain detected (volza.com instead of actual company domain)

**Solution:** 
1. Blacklist trade data websites
2. Improve domain detection
3. Configure all API keys
4. Re-process buyers

**Expected Outcome:** Contacts will be found for companies with valid domains.

---

See next file for code implementation...
