// Test Global API integration
const axios = require('axios');

async function testGlobalAPI() {
  console.log('\n=== Testing Global API ===\n');
  
  const testData = {
    company_name: 'Tesla Inc',
    country: 'USA',
    industry: 'Automotive',
    domain: 'tesla.com',
    trade_stats: {
      total_shipments: 150,
      total_value: 5000000,
      frequency: 'monthly',
    },
    google_results: [
      {
        title: 'Tesla - Electric Vehicles',
        url: 'https://www.tesla.com',
        description: 'Tesla designs and manufactures electric vehicles',
      },
      {
        title: 'Tesla Inc - Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Tesla,_Inc.',
        description: 'Tesla, Inc. is an American electric vehicle manufacturer',
      },
    ],
    products: ['Electric Vehicles', 'Battery Systems', 'Solar Panels'],
    hs_codes: ['870380', '850760', '854140'],
    timestamp: new Date().toISOString(),
  };
  
  try {
    console.log('Sending data to Global API...');
    console.log('URL: https://aaziko.global.202.47.115.6.sslip.io/api/research\n');
    console.log('Payload:', JSON.stringify(testData, null, 2), '\n');
    
    const response = await axios.post(
      'https://aaziko.global.202.47.115.6.sslip.io/api/research',
      testData,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    
    console.log('✅ API Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Global API is working!\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('Connection refused - API server may be down');
    } else if (error.code === 'ECONNABORTED') {
      console.error('Request timeout - API is too slow');
    } else if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    console.log('\n⚠️  Global API is not responding, but pipeline will continue without it\n');
  }
}

testGlobalAPI();
