import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    envVars[key] = val.replace(/^["']|["']$/g, '');
  }
});

const USER = envVars['FACTURAMA_USER'];
const PASS = envVars['FACTURAMA_PASSWORD'];

async function testEnv(envName, baseUrl) {
  console.log(`--- Testing ${envName} (${baseUrl}) ---`);
  const authHeader = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
  try {
    const res = await fetch(`${baseUrl}/catalogs/ProductsOrServices?keyword=computadora`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });
    console.log("Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Response Length:", text.length);
    if (res.status === 200) {
      console.log("SUCCESS! Credentials are valid for:", envName);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

async function run() {
  await testEnv("Sandbox", "https://apisandbox.facturama.mx");
  await testEnv("Production", "https://api.facturama.mx");
}

run();
