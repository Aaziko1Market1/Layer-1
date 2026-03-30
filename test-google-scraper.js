// Test Google Scraper API integration
const axios = require('axios');

async function testGoogleScraper() {
  console.log('\n=== Testing Google Scraper API ===\n');
  
  const testCompany = 'Tesla';
  
  try {
    console.log(`Searching for: ${testCompany}`);
    console.log('API: http://aaziko.google.202.47.115.6.sslip.io/search\n');
    
    const response = await axios.post(
      'http://aaziko.google.202.47.115.6.sslip.io/search',
      `company_name=${encodeURIComponent(testCompany)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );
    
    console.log('✅ API Response Status:', response.status);
    console.log('Response Type:', typeof response.data);
    console.log('\nResponse Data:');
    
    if (typeof response.data === 'string') {
      // HTML response
      console.log('Received HTML response (length:', response.data.length, 'chars)');
      console.log('\nFirst 500 characters:');
      console.log(response.data.substring(0, 500));
    } else if (typeof response.data === 'object') {
      // JSON response
      console.log('Received JSON response:');
      console.log(JSON.stringify(response.data, null, 2));
    }
    
    console.log('\n✅ Google Scraper API is working!\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testGoogleScraper();
