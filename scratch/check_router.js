async function checkRouter() {
  try {
    const res = await fetch('http://192.168.1.254', { method: 'GET', timeout: 2000 });
    console.log("Router HTTP Status:", res.status);
    const text = await res.text();
    const titleMatch = text.match(/<title>(.*?)<\/title>/i);
    console.log("Router Title:", titleMatch ? titleMatch[1] : "No title found");
    console.log("Server Header:", res.headers.get('server'));
  } catch (e) {
    console.log("Could not connect to router HTTP:", e.message);
  }
}

checkRouter();
