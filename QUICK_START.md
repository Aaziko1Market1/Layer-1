# 🚀 Quick Start Guide

## 1️⃣ First Time Setup (5 minutes)

```bash
# Go to TT folder
cd TT

# Install dependencies
npm install
cd dashboard && npm install && cd ..

# Copy environment file
cp .env.example .env

# Build project
npm run build
```

## 2️⃣ Start the Project (2 terminals)

### Terminal 1 - Backend
```bash
cd TT
npm run dev
```
✅ Backend running at: **http://localhost:4400**

### Terminal 2 - Dashboard
```bash
cd TT/dashboard
npm run dev
```
✅ Dashboard running at: **http://localhost:4401**

## 3️⃣ Run the Pipeline

### Option A: Via Dashboard (Easy)
1. Open http://localhost:4401
2. Click "Pipeline" in sidebar
3. Click "Start Pipeline" button
4. Watch progress!

### Option B: Via API
```bash
curl -X POST http://localhost:4400/api/analytics/run-etl \
  -H 'Content-Type: application/json' \
  -d '{"limit": 10}'
```

### Option C: Via Command Line
```bash
node -r dotenv/config dist/services/etl/pipeline.js dotenv_config_path=.env
```

## 4️⃣ Check Results

### Via Dashboard
- Open http://localhost:4401
- Go to "Buyers" page
- See enriched buyers!

### Via API
```bash
# Get buyer stats
curl http://localhost:4400/api/buyers/stats

# Get all buyers
curl http://localhost:4400/api/buyers

# Get pipeline status
curl http://localhost:4400/api/analytics/pipeline
```

### Via Database
```bash
mongo "mongodb://admin:Aaziko%21%40%23123@43.249.231.93:27017/?authSource=admin"

use aaziko_trade

# Count enriched buyers
db.enriched_buyers.countDocuments()

# See latest buyer
db.enriched_buyers.findOne({}, { sort: { created_at: -1 } })
```

---

## 📊 What Happens When Pipeline Runs?

```
1. Extract Importers (from standard_port_data)
   ↓
2. Classify with AI
   ↓
3. Verify Websites
   ↓
4. Agent 1: Company Research
   ├─ Google Scraper API ← YOUR API
   ├─ Global API ← YOUR API
   ├─ Website Scraping
   └─ AI Analysis
   ↓
5. Agent 2: Contact Discovery (Apollo, Hunter, etc.)
   ↓
6. Agent 3: Verification
   ↓
7. Agent 4: Buyer Intelligence
   ↓
8. Deduplication
   ↓
9. Store in enriched_buyers ✅
```

**Time:** ~1-2 minutes per buyer

---

## ⚠️ Before Running Pipeline

Make sure you have **trade data** in database:

```bash
# Check if data exists
node check-trade-data.js
```

**Expected:**
```
✅ Connected to MongoDB
standard_port_data: 5000 records  ← Need this!
```

If you see `0 records`, you need to import trade data first.

---

## 🧪 Test Your APIs

```bash
# Test Google Scraper API
node test-google-scraper.js

# Test Global API
node test-global-api.js
```

---

## 🐛 Common Issues

### "Cannot connect to MongoDB"
```bash
# Check connection
ping 43.249.231.93
```

### "Port 4400 already in use"
```bash
# Kill existing process
lsof -i :4400
kill -9 <PID>
```

### "No trade data found"
- You need to import trade data to `standard_port_data` collection first

### "Google Scraper timeout"
- Normal! API takes 30+ seconds
- Pipeline continues without it

### "Global API unavailable"
- Check if API is running
- Pipeline continues without it

---

## 📁 Important URLs

| Service | URL |
|---------|-----|
| Backend API | http://localhost:4400 |
| Health Check | http://localhost:4400/api/health |
| Dashboard | http://localhost:4401 |
| Google Scraper | http://aaziko.google.202.47.115.6.sslip.io |
| Global API | https://aaziko.global.202.47.115.6.sslip.io |

---

## 📚 More Documentation

- **HOW_TO_RUN_PROJECT.md** - Complete detailed guide
- **DUAL_API_INTEGRATION.md** - API integration details
- **API_FLOW_DIAGRAM.md** - Visual flow diagrams
- **README.md** - Project overview
- **COMPLETE_SYSTEM_STATUS.md** - System status

---

## ✅ Success!

If you see this, you're ready:

```
✅ Backend running on port 4400
✅ Dashboard running on port 4401
✅ MongoDB connected
✅ Trade data available
✅ Pipeline running
✅ Enriched buyers in database
```

🎉 **Your TT project is working!**
