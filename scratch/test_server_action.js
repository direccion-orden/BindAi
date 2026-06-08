// Test if the Server Action endpoint is reachable  
async function testServerAction() {
  try {
    // Test against the Cloud Run URL directly
    const cloudRunUrl = 'https://ssrbindai6f1fc-7ktiwx6olq-uc.a.run.app/configuracion/shopify';
    const hostingUrl = 'https://bind-ai-6f1fc.web.app/configuracion/shopify';
    
    for (const url of [cloudRunUrl, hostingUrl]) {
      console.log(`\n--- Testing: ${url} ---`);
      
      // Test GET (page load)
      const getRes = await fetch(url);
      console.log(`GET status: ${getRes.status} ${getRes.statusText}`);
      
      // Test POST (simulating a Server Action call)
      const postRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/x-component',
          'Next-Action': 'dummy-test',
          'Origin': 'https://bind-ai-6f1fc.web.app',
        },
        body: '[]'
      });
      console.log(`POST status: ${postRes.status} ${postRes.statusText}`);
      
      if (postRes.status >= 400) {
        const body = await postRes.text();
        console.log(`POST body (first 500 chars): ${body.substring(0, 500)}`);
      }
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testServerAction();
