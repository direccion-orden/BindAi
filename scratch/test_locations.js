require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

async function testLocations() {
  const API_BASE = "https://api.bind.com.mx/api";
  const apiKey = process.env.BIND_ERP_API_KEY;

  const res = await fetch(`${API_BASE}/Locations`, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    }
  });

  if (res.ok) {
    const data = await res.json();
    console.log("Locations found:", data.value.map(l => ({ id: l.ID, name: l.Name })));
  } else {
    console.error("Failed", await res.text());
  }
}

testLocations();
