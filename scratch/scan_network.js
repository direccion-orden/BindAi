const https = require('https');

async function scan() {
  console.log("Starting network scan in subnet 192.168.1.X...");
  const subnet = "192.168.1";
  const port = "44333";
  const promises = [];
  
  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}.${i}`;
    // Skip gateway and current PC
    if (i === 254 || i === 79) continue;
    
    promises.push((async () => {
      // Try HTTPS and HTTP
      for (const protocol of ['http', 'https']) {
        const url = `${protocol}://${ip}:${port}/system`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1500);
          
          const res = await fetch(url, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (res.ok) {
            console.log(`[FOUND] Recycler responding at: ${url}`);
            try {
              const data = await res.json();
              console.log(`System Data:`, data);
            } catch (err) {
              console.log(`Connected, but failed to parse JSON.`);
            }
            return ip;
          }
        } catch (e) {
          // Ignore connection errors/timeouts
        }
      }
      return null;
    })());
  }
  
  const results = await Promise.all(promises);
  const found = results.filter(r => r !== null);
  console.log("Scan finished. Found devices:", found);
}

scan();
