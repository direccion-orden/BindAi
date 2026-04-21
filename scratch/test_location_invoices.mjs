import fs from 'fs';

async function run() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const apiKeyLine = envFile.split('\n').find(l => l.startsWith('BIND_ERP_API_KEY='));
  const apiKey = apiKeyLine.split('=')[1].trim();

  const API_BASE = "https://api.bind.com.mx/api";
  const locationId = "0531cb87-1a5f-4d67-9b9d-ca3314393f0d"; // ARBOLEDA

  // Let's see if we can filter Invoices by LocationID
  const url = `${API_BASE}/Invoices?$filter=LocationID eq guid'${locationId}'&$top=5`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    }
  });

  if (res.ok) {
    const data = await res.json();
    console.log("Success Invoices:", data.value.length);
  } else {
    console.error("Failed:", await res.text());
  }
}

run();
