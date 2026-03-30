# Complete API Flow Diagram

## Overview: Data Flow from Database to APIs

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MongoDB: aaziko_trade                           │
│                                                                         │
│  Collection: standard_port_data (5.1M+ trade records)                  │
│  ├─ IMPORTER_NAME: "Tesla Inc"                                         │
│  ├─ IMPORT_COUNTRY: "USA"                                              │
│  ├─ HS_CODE: "870380"                                                  │
│  ├─ PRODUCT_DESCRIPTION: "Electric Vehicles"                           │
│  ├─ FOB_VALUE_USD: 50000                                               │
│  └─ IMPORT_DATE: "2024-01-15"                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Extract & Group
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    ETL Pipeline: Extract Importers                      │
│                                                                         │
│  Groups by company name, calculates:                                   │
│  ├─ Total shipments: 150                                               │
│  ├─ Total value: $5,000,000                                            │
│  ├─ Frequency: monthly                                                 │
│  ├─ Products: ["Electric Vehicles", "Battery Systems"]                │
│  └─ HS Codes: ["870380", "850760"]                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Store in buyer_profiles
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                Collection: buyer_profiles (working data)                │
│                                                                         │
│  {                                                                      │
│    companyName: "Tesla Inc",                                           │
│    country: "USA",                                                     │
│    industry: "Automotive",                                             │
│    domain: "tesla.com",                                                │
│    tradeStats: {                                                       │
│      totalShipments: 150,                                              │
│      totalValue: 5000000,                                              │
│      frequency: "monthly"                                              │
│    },                                                                  │
│    products: ["Electric Vehicles", "Battery Systems"],                │
│    hsCodes: ["870380", "850760"],                                      │
│    status: "classified"                                                │
│  }                                                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Agent 1: Company Research
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    🔍 API 1: Google Scraper                             │
│                                                                         │
│  URL: http://aaziko.google.202.47.115.6.sslip.io/search                │
│  Method: POST                                                           │
│  Content-Type: application/x-www-form-urlencoded                       │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ REQUEST                                                         │  │
│  │ ─────────────────────────────────────────────────────────────  │  │
│  │ company_name=Tesla Inc                                          │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    │ Scrapes Google                     │
│                                    │ (30 seconds)                       │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ RESPONSE                                                        │  │
│  │ ─────────────────────────────────────────────────────────────  │  │
│  │ {                                                               │  │
│  │   "results": [                                                  │  │
│  │     {                                                           │  │
│  │       "title": "Tesla - Electric Vehicles",                     │  │
│  │       "url": "https://www.tesla.com",                           │  │
│  │       "description": "Tesla designs and manufactures..."        │  │
│  │     },                                                          │  │
│  │     {                                                           │  │
│  │       "title": "Tesla Inc - Wikipedia",                         │  │
│  │       "url": "https://en.wikipedia.org/wiki/Tesla,_Inc.",      │  │
│  │       "description": "Tesla, Inc. is an American..."            │  │
│  │     }                                                           │  │
│  │   ]                                                             │  │
│  │ }                                                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Combine with buyer profile
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    🌐 API 2: Global API                                 │
│                                                                         │
│  URL: https://aaziko.global.202.47.115.6.sslip.io/api/research         │
│  Method: POST                                                           │
│  Content-Type: application/json                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ REQUEST (Complete Company Data)                                 │  │
│  │ ─────────────────────────────────────────────────────────────  │  │
│  │ {                                                               │  │
│  │   "company_name": "Tesla Inc",                                  │  │
│  │   "country": "USA",                                             │  │
│  │   "industry": "Automotive",                                     │  │
│  │   "domain": "tesla.com",                                        │  │
│  │   "trade_stats": {                                              │  │
│  │     "total_shipments": 150,                                     │  │
│  │     "total_value": 5000000,                                     │  │
│  │     "frequency": "monthly"                                      │  │
│  │   },                                                            │  │
│  │   "google_results": [                                           │  │
│  │     {                                                           │  │
│  │       "title": "Tesla - Electric Vehicles",                     │  │
│  │       "url": "https://www.tesla.com",                           │  │
│  │       "description": "Tesla designs and manufactures..."        │  │
│  │     },                                                          │  │
│  │     {                                                           │  │
│  │       "title": "Tesla Inc - Wikipedia",                         │  │
│  │       "url": "https://en.wikipedia.org/wiki/Tesla,_Inc.",      │  │
│  │       "description": "Tesla, Inc. is an American..."            │  │
│  │     }                                                           │  │
│  │   ],                                                            │  │
│  │   "products": ["Electric Vehicles", "Battery Systems"],        │  │
│  │   "hs_codes": ["870380", "850760"],                            │  │
│  │   "timestamp": "2026-03-26T11:53:31.385Z"                       │  │
│  │ }                                                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    │ Process & Store                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ RESPONSE (Your API decides what to return)                      │  │
│  │ ─────────────────────────────────────────────────────────────  │  │
│  │ {                                                               │  │
│  │   "status": "success",                                          │  │
│  │   "message": "Data received and processed"                      │  │
│  │ }                                                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Continue pipeline
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              Agent 1 continues: Website Scraping + AI Analysis          │
│              Agent 2: Contact Discovery (Apollo, Hunter, etc.)          │
│              Agent 3: Verification                                      │
│              Agent 4: Buyer Intelligence                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Final output
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              Collection: enriched_buyers (final output)                 │
│                                                                         │
│  Ready for Layer 2 (Communication System)                              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Sequence Diagram

```
Database          Pipeline         Google API        Global API        Agent 1
   │                 │                  │                │               │
   │  Trade Data     │                  │                │               │
   ├────────────────>│                  │                │               │
   │                 │                  │                │               │
   │                 │  Extract &       │                │               │
   │                 │  Group           │                │               │
   │                 │                  │                │               │
   │                 │  buyer_profiles  │                │               │
   │                 ├─────────────────────────────────────────────────>│
   │                 │                  │                │               │
   │                 │                  │  POST          │               │
   │                 │                  │  company_name  │               │
   │                 │                  │<──────────────────────────────│
   │                 │                  │                │               │
   │                 │                  │  Scrape Google │               │
   │                 │                  │  (30s)         │               │
   │                 │                  │                │               │
   │                 │                  │  google_results│               │
   │                 │                  ├───────────────────────────────>│
   │                 │                  │                │               │
   │                 │                  │                │  POST         │
   │                 │                  │                │  ALL DATA     │
   │                 │                  │                │<──────────────│
   │                 │                  │                │               │
   │                 │                  │                │  Process      │
   │                 │                  │                │  (10s)        │
   │                 │                  │                │               │
   │                 │                  │                │  Response     │
   │                 │                  │                ├──────────────>│
   │                 │                  │                │               │
   │                 │                  │                │  Continue     │
   │                 │                  │                │  Research     │
   │                 │                  │                │               │
   │                 │  enriched_buyers │                │               │
   │<────────────────┼──────────────────────────────────────────────────│
   │                 │                  │                │               │
```

## Data Transformation Example

### Input: MongoDB Trade Record
```json
{
  "IMPORTER_NAME": "Tesla Inc",
  "IMPORT_COUNTRY": "USA",
  "HS_CODE": "870380",
  "PRODUCT_DESCRIPTION": "Electric Vehicles",
  "FOB_VALUE_USD": 50000,
  "IMPORT_DATE": "2024-01-15"
}
```

### After ETL: buyer_profiles
```json
{
  "companyName": "Tesla Inc",
  "country": "USA",
  "industry": "Automotive",
  "tradeStats": {
    "totalShipments": 150,
    "totalValue": 5000000,
    "frequency": "monthly"
  },
  "products": ["Electric Vehicles", "Battery Systems"],
  "hsCodes": ["870380", "850760"]
}
```

### To Google Scraper API
```
POST http://aaziko.google.202.47.115.6.sslip.io/search
company_name=Tesla Inc
```

### From Google Scraper API
```json
{
  "results": [
    {
      "title": "Tesla - Electric Vehicles",
      "url": "https://www.tesla.com",
      "description": "Tesla designs and manufactures electric vehicles"
    }
  ]
}
```

### To Global API (Combined Data)
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

### Final Output: enriched_buyers
```json
{
  "verified_company": {
    "name": "Tesla Inc",
    "country": "USA",
    "domain": "tesla.com"
  },
  "company_research": {
    "business_model": "Electric vehicle manufacturer",
    "india_fit_score": 85,
    "source_urls": ["https://www.tesla.com"]
  },
  "trade_data": {
    "total_amount_usd": 5000000,
    "transaction_count": 150,
    "trade_frequency": 12.5
  },
  "intelligence": {
    "fit_score": 85,
    "fit_band": "HIGH",
    "icebreaker_points": ["..."],
    "likely_pain_points": ["..."]
  }
}
```

## Summary

1. **MongoDB** provides raw trade data
2. **ETL Pipeline** extracts and groups by company
3. **Google Scraper API** gets search results
4. **Global API** receives everything (trade data + Google results)
5. **Agent 1** continues with website scraping and AI analysis
6. **Final output** goes to enriched_buyers collection

Both APIs are optional - if they fail, the pipeline continues with fallback data.
