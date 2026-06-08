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
const ENV = envVars['FACTURAMA_ENV'] || 'sandbox';

const baseUrl = (ENV.toLowerCase() === 'production')
  ? 'https://api.facturama.mx'
  : 'https://apisandbox.facturama.mx';

console.log("Testing credentials against catalog...");
console.log("User:", USER);
console.log("Env:", ENV);
console.log("Base URL:", baseUrl);

const authHeader = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

async function run() {
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
    console.log("Raw Response:", text.slice(0, 500)); // Limit to first 500 chars
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
