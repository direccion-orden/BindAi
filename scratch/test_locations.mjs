import fs from 'fs';

async function run() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const apiKeyLine = envFile.split('\n').find(l => l.startsWith('BIND_ERP_API_KEY='));
  const apiKey = apiKeyLine.split('=')[1].trim();

  const API_BASE = "https://api.bind.com.mx/api";
  const res = await fetch(`${API_BASE}/Locations`, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    }
  });

  if (res.ok) {
    const data = await res.json();
    console.log(JSON.stringify(data.value.map(l => ({ id: l.ID, name: l.Name })), null, 2));
  } else {
    console.error("Failed:", await res.text());
  }
}

run();
