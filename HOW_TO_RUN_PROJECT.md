# Complete Guide: How to Run TT Project

## 🚀 Quick Start (If Everything is Ready)

```bash
# 1. Go to TT folder
cd TT

# 2. Start backend server
npm run dev

# 3. In another terminal, start dashboard
cd TT/dashboard
npm run dev
```

Then open:
- Backend API: http://localhost:4400
- Dashboard: http://localhost:4401

---

## 📋 Complete Setup Guide (First Time)

### Step 1: Check Prerequisites

```bash
# Check Node.js (need v18+)
node --version

# Check npm
npm --version

# Check MongoDB connection
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"
```

### Step 2: Install Dependencies

```bash
# Go to TT folder
cd TT

# Install backend dependencies
npm install

# Install dashboard dependencies
cd dashboard
npm install
cd ..
```

### Step 3: Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env file (use nano, vim, or any editor)
nano .env
```

**Minimum required in .env:**
```bash
# MongoDB (already configured)
MONGODB_URI=mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin

# Redis (if you have it)
REDIS_URL=redis://127.0.0.1:6379

# Server
PORT=4400
NODE_ENV=development
LOG_LEVEL=info

# Apollo API (for contact discovery)
APOLLO_API_KEY=jerlUbcCitpA_6F4SHBrVA
```

**Optional (for better results):**
```bash
# AI Models (SiliconFlow)
QWEN_32B_API_KEY=your_key_here
QWEN_235B_API_KEY=your_key_here

# Enrichment APIs
HUNTER_API_KEY=your_key_here
ZEROBOUNCE_API_KEY=your_key_here
BRAVE_SEARCH_API_KEY=your_key_here
```

### Step 4: Build TypeScript

```bash
# Build the project
npm run build

# You should see: dist/ folder created
ls dist/
```

### Step 5: Check Database Connection

```bash
# Test if database is accessible
node check-trade-data.js
```

**Expected output:**
```
✅ Connected to MongoDB

=== AVAILABLE COLLECTIONS ===
  - audit_log
  - dedup_decisions
  - buyer_profiles

=== TRADE DATA SOURCE ===
standard_port_data: 0 records

⚠️  No trade data found in standard_port_data collection
```

---

## 📊 Import Trade Data (Required!)

Your pipeline needs trade data in `standard_port_data` collection.

### Option 1: If You Have Trade Data File

```bash
# If you have a CSV/Excel file with trade data
# You need to import it to MongoDB

# Example structure needed:
# IMPORTER_NAME, IMPORT_COUNTRY, HS_CODE, PRODUCT_DESCRIPTION, FOB_VALUE_USD, IMPORT_DATE
```

### Option 2: Check Existing Data

```bash
# Connect to MongoDB
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"

# Switch to database
use aaziko_trade

# Check if data exists
db.standard_port_data.countDocuments()

# See sample record
db.standard_port_data.findOne()
```

### Option 3: Import Sample Data (For Testing)

```bash
# If you have import-sample-trade-data.js
node import-sample-trade-data.js
```

---

## 🏃 Running the Project

### Method 1: Development Mode (Recommended)

**Terminal 1 - Backend:**
```bash
cd TT
npm run dev
```

**Terminal 2 - Dashboard:**
```bash
cd TT/dashboard
npm run dev
```

**What you'll see:**
```
Backend (Terminal 1):
✅ Connected to MongoDB
✅ Server running on port 4400
✅ Health check: http://localhost:4400/api/health

Dashboard (Terminal 2):
✅ Vite dev server running
✅ Dashboard: http://localhost:4401
```

### Method 2: Production Mode

```bash
# Build first
npm run build

# Start backend
npm start

# Start dashboard (in another terminal)
cd dashboard
npm run build
npm run preview
```

---

## 🔄 Running the ETL Pipeline

Once the server is running, you can process buyers through the pipeline.

### Option 1: Via API (Recommended)

```bash
# Trigger pipeline via API
curl -X POST http://localhost:4400/api/analytics/run-etl \
  -H 'Content-Type: application/json' \
  -d '{
    "limit": 100,
    "country": "USA",
    "skipExisting": true
  }'
```

### Option 2: Via Command Line

```bash
# Run pipeline directly
node -r dotenv/config dist/services/etl/pipeline.js dotenv_config_path=.env

# With custom limits
node -r dotenv/config dist/services/etl/pipeline.js 100 50 25 10 dotenv_config_path=.env
# Args: extractLimit classifyLimit verifyLimit agentLimit
```

### Option 3: Via Dashboard

1. Open dashboard: http://localhost:4401
2. Go to "Pipeline" page
3. Click "Start Pipeline" button
4. Monitor progress in real-time

---

## 📈 Complete Pipeline Flow (What Happens When You Run)

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: EXTRACT IMPORTERS                                       │
│ ─────────────────────────────────────────────────────────────   │
│ • Reads from: standard_port_data collection                     │
│ • Groups by company name                                        │
│ • Calculates trade statistics                                   │
│ • Stores in: buyer_profiles (status: extracted)                 │
│ • Time: ~5-10 seconds per 100 companies                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: CLASSIFY WITH AI                                        │
│ ─────────────────────────────────────────────────────────────   │
│ • Reads: buyer_profiles (status: extracted)                     │
│ • AI classifies industry and type                               │
│ • Updates: buyer_profiles (status: classified)                  │
│ • Time: ~5-10 seconds per buyer                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: VERIFY WEBSITES                                         │
│ ─────────────────────────────────────────────────────────────   │
│ • Reads: buyer_profiles (status: classified)                    │
│ • Verifies company websites                                     │
│ • Updates: buyer_profiles (status: website_verified)            │
│ • Time: ~10-15 seconds per buyer                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: AGENT 1 - COMPANY RESEARCH                              │
│ ─────────────────────────────────────────────────────────────   │
│ • Reads: buyer_profiles (status: website_verified)              │
│                                                                 │
│ 4.1 Google Scraper API ← YOUR API                               │
│     POST http://aaziko.google.202.47.115.6.sslip.io/search      │
│     Input: company_name                                         │
│     Output: Google search results                               │
│     Time: ~30 seconds                                           │
│                                                                 │
│ 4.2 Global API ← YOUR API                                       │
│     POST https://aaziko.global.202.47.115.6.sslip.io/api/research│
│     Input: ALL company data + Google results                    │
│     Time: ~10 seconds                                           │
│                                                                 │
│ 4.3 Website Scraping                                            │
│     Scrapes verified website                                    │
│     Time: ~10 seconds                                           │
│                                                                 │
│ 4.4 AI Analysis                                                 │
│     Computes India fit score                                    │
│     Time: ~5-10 seconds                                         │
│                                                                 │
│ • Updates: buyer_profiles (status: researched)                  │
│ • Total time: ~50-60 seconds per buyer                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: AGENT 2 - CONTACT DISCOVERY                             │
│ ─────────────────────────────────────────────────────────────   │
│ • Reads: buyer_profiles (status: researched)                    │
│ • Waterfall: Apollo → Hunter → Snov → Website                   │
│ • Finds emails, LinkedIn, phone numbers                         │
│ • Verifies emails with ZeroBounce                               │
│ • Updates: buyer_profiles (status: contact_found)               │
│ • Time: ~20-30 seconds per buyer                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: AGENT 3 - VERIFICATION                                  │
│ ─────────────────────────────────────────────────────────────   │
│ • Reads: buyer_profiles (status: contact_found)                 │
│ • Computes 4-level confidence scores                            │
│ • Updates: buyer_profiles (status: verified)                    │
│ • Time: ~1-2 seconds per buyer                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 7: AGENT 4 - BUYER INTELLIGENCE                            │
│ ─────────────────────────────────────────────────────────────   │
│ • Reads: buyer_profiles (status: verified)                      │
│ • Generates fit score, icebreakers, pain points                 │
│ • Determines mention policy                                     │
│ • Sets channel eligibility                                      │
│ • Makes qualification decision                                  │
│ • Updates: buyer_profiles (status: ready)                       │
│ • Time: ~5-10 seconds per buyer                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 8: DEDUPLICATION                                           │
│ ─────────────────────────────────────────────────────────────   │
│ • Reads: buyer_profiles (status: ready)                         │
│ • Checks 4 levels: domain, name, parent, email                  │
│ • Logs decisions in: dedup_decisions                            │
│ • Time: ~1 second per buyer                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 9: ENRICHED STORAGE (FINAL OUTPUT)                         │
│ ─────────────────────────────────────────────────────────────   │
│ • Reads: buyer_profiles (status: ready)                         │
│ • Transforms to enriched format                                 │
│ • Stores in: enriched_buyers ← FINAL OUTPUT                     │
│ • Updates: buyer_profiles (status: enriched)                    │
│ • Time: ~1 second per buyer                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ ✅ COMPLETE - Ready for Layer 2                                 │
│                                                                 │
│ Collection: enriched_buyers                                     │
│ • Contains all buyer intelligence                               │
│ • Ready for communication system                                │
│ • Includes fit scores, contacts, icebreakers                    │
└─────────────────────────────────────────────────────────────────┘
```

**Total Time Per Buyer:** ~80-120 seconds (1-2 minutes)

---

## 📊 Monitoring Progress

### Check Logs

```bash
# Watch logs in real-time
tail -f logs/combined.log

# Or if running in dev mode, logs appear in terminal
```

### Check Database

```bash
# Connect to MongoDB
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"

use aaziko_trade

# Count buyers by status
db.buyer_profiles.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])

# Count enriched buyers
db.enriched_buyers.countDocuments()

# See latest enriched buyer
db.enriched_buyers.findOne({}, { sort: { created_at: -1 } })
```

### Check via API

```bash
# Health check
curl http://localhost:4400/api/health

# Buyer stats
curl http://localhost:4400/api/buyers/stats

# Pipeline status
curl http://localhost:4400/api/analytics/pipeline

# Queue stats
curl http://localhost:4400/api/jobs/queue-stats
```

### Check via Dashboard

Open http://localhost:4401 and navigate to:
- **Dashboard** - KPIs and statistics
- **Buyers** - Search and filter buyers
- **Pipeline** - Pipeline status and controls
- **Health** - System health check

---

## 🧪 Testing Individual Components

### Test APIs

```bash
# Test Google Scraper API
node test-google-scraper.js

# Test Global API
node test-global-api.js

# Test database connection
node check-trade-data.js
```

### Test Individual Pipeline Steps

```bash
# Build first
npm run build

# Test extraction only
node -r dotenv/config dist/services/etl/extractor.js dotenv_config_path=.env

# Test classification only
node -r dotenv/config dist/services/etl/classifier.js dotenv_config_path=.env

# Test Agent 1 only
node -r dotenv/config dist/services/etl/agent-runner.js dotenv_config_path=.env
```

---

## 🐛 Troubleshooting

### Problem: "Cannot connect to MongoDB"

**Solution:**
```bash
# Check if MongoDB is accessible
ping 43.249.231.93

# Try connecting manually
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"

# Check .env file has correct MONGODB_URI
cat .env | grep MONGODB_URI
```

### Problem: "No trade data found"

**Solution:**
```bash
# Check if standard_port_data has records
node check-trade-data.js

# If empty, you need to import trade data first
# Contact your data team or import from CSV/Excel
```

### Problem: "Port 4400 already in use"

**Solution:**
```bash
# Find process using port 4400
lsof -i :4400

# Kill the process
kill -9 <PID>

# Or change port in .env
echo "PORT=4500" >> .env
```

### Problem: "Google Scraper API timeout"

**Solution:**
- This is normal - API takes 30+ seconds
- Pipeline will continue without it
- Check logs: `tail -f logs/combined.log`

### Problem: "Global API unavailable"

**Solution:**
- Check if API is running: `curl https://aaziko.global.202.47.115.6.sslip.io`
- Pipeline will continue without it
- Not critical for pipeline to work

### Problem: "Build errors"

**Solution:**
```bash
# Clean and rebuild
rm -rf dist/
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

---

## 📝 Example: Complete Run from Scratch

```bash
# 1. Go to project
cd ~/aaziko/TT

# 2. Install dependencies (first time only)
npm install
cd dashboard && npm install && cd ..

# 3. Configure environment (first time only)
cp .env.example .env
nano .env  # Add your API keys

# 4. Build
npm run build

# 5. Check database
node check-trade-data.js

# 6. Start backend (Terminal 1)
npm run dev

# 7. Start dashboard (Terminal 2)
cd dashboard
npm run dev

# 8. Open browser
# Backend: http://localhost:4400/api/health
# Dashboard: http://localhost:4401

# 9. Run pipeline (Terminal 3 or via dashboard)
curl -X POST http://localhost:4400/api/analytics/run-etl \
  -H 'Content-Type: application/json' \
  -d '{"limit": 10}'

# 10. Monitor progress
tail -f logs/combined.log

# 11. Check results
curl http://localhost:4400/api/buyers/stats
```

---

## 🎯 What to Expect

### First Run (10 buyers)
- **Time:** ~15-20 minutes
- **Output:** 10 enriched buyers in database
- **Logs:** Detailed progress for each step

### Production Run (1000 buyers)
- **Time:** ~20-30 hours
- **Output:** 1000 enriched buyers
- **Recommendation:** Run overnight or in batches

### Daily Limit
- Default: 5000 buyers/day
- Configurable in .env: `DAILY_RESEARCH_LIMIT=5000`

---

## 📚 Important Files

```
TT/
├── .env                          # Your configuration (secrets)
├── package.json                  # Dependencies
├── dist/                         # Compiled JavaScript (after build)
├── logs/                         # Application logs
│   ├── combined.log              # All logs
│   └── error.log                 # Error logs only
├── src/                          # Source code
│   ├── index.ts                  # Server entry point
│   ├── services/etl/             # Pipeline code
│   │   ├── pipeline.ts           # Main pipeline
│   │   ├── extractor.ts          # Step 1
│   │   ├── classifier.ts         # Step 2
│   │   └── agent-runner.ts       # Steps 4-7
│   └── services/agents/          # 4 agents
│       ├── company-research.agent.ts    # Agent 1 (with your APIs)
│       ├── contact-discovery.agent.ts   # Agent 2
│       ├── verification.agent.ts        # Agent 3
│       └── buyer-intelligence.agent.ts  # Agent 4
├── dashboard/                    # React dashboard
├── test-google-scraper.js        # Test Google API
├── test-global-api.js            # Test Global API
├── check-trade-data.js           # Check database
└── HOW_TO_RUN_PROJECT.md         # This file
```

---

## ✅ Success Checklist

- [ ] Node.js installed (v18+)
- [ ] Dependencies installed (`npm install`)
- [ ] .env file configured
- [ ] MongoDB accessible
- [ ] Trade data imported to `standard_port_data`
- [ ] Project builds successfully (`npm run build`)
- [ ] Backend starts (`npm run dev`)
- [ ] Dashboard starts (`cd dashboard && npm run dev`)
- [ ] Health check works (`curl http://localhost:4400/api/health`)
- [ ] Pipeline runs successfully
- [ ] Enriched buyers appear in database

---

## 🆘 Need Help?

1. Check logs: `tail -f logs/combined.log`
2. Check database: `node check-trade-data.js`
3. Test APIs: `node test-google-scraper.js`
4. Check health: `curl http://localhost:4400/api/health`
5. Review documentation:
   - `README.md` - Project overview
   - `DUAL_API_INTEGRATION.md` - API integration details
   - `API_FLOW_DIAGRAM.md` - Visual flow diagrams
   - `COMPLETE_SYSTEM_STATUS.md` - System status

---

## 🚀 Quick Commands Reference

```bash
# Development
npm run dev                    # Start backend
cd dashboard && npm run dev    # Start dashboard

# Build
npm run build                  # Compile TypeScript

# Pipeline
npm run etl:extract           # Extract only
npm run etl:hydrate           # Hydrate data
curl -X POST http://localhost:4400/api/analytics/run-etl  # Full pipeline

# Testing
node test-google-scraper.js   # Test Google API
node test-global-api.js       # Test Global API
node check-trade-data.js      # Check database

# Database
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"

# Logs
tail -f logs/combined.log     # Watch logs
tail -f logs/error.log        # Watch errors only
```

Good luck! 🎉
