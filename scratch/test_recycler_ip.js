const ip = '192.168.1.69';
const port = '44333';
const protocols = ['http', 'https'];

async function check() {
  for (const protocol of protocols) {
    const url = `${protocol}://${ip}:${port}`;
    console.log(`Checking ${url}/system ...`);
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      
      const res = await fetch(`${url}/system`, {
        signal: controller.signal
      });
      clearTimeout(id);
      
      const data = await res.json();
      console.log(`[SUCCESS] Found recycler at ${url}! Response:`, data);
      return;
    } catch (e) {
      console.log(`[FAILED] ${url}/system failed: ${e.message}`);
    }
  }
}

check();
