const fs = require('fs');
const path = require('path');

async function run() {
  try {
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

    const BIND_API_KEY = envVars['BIND_ERP_API_KEY'];
    if (!BIND_API_KEY) {
      console.error("Missing BIND_ERP_API_KEY");
      return;
    }

    console.log("Fetching OData $metadata from Bind ERP...");
    const res = await fetch("https://api.bind.com.mx/api/$metadata", {
      headers: {
        'Authorization': `Bearer ${BIND_API_KEY}`
      }
    });

    if (!res.ok) {
      console.error("Failed to fetch metadata:", res.status, res.statusText);
      return;
    }

    const metadataText = await res.text();
    fs.writeFileSync('scratch/bind_odata_metadata.xml', metadataText, 'utf-8');
    console.log("Metadata saved to scratch/bind_odata_metadata.xml");

    // Search for entities or properties containing SAT, CFDI, Clave, Unidad, Product
    const lines = metadataText.split('\n');
    console.log("\nSearching metadata for key terms...");
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes('sat') || line.toLowerCase().includes('cfdi') || line.toLowerCase().includes('clave') || line.toLowerCase().includes('unit')) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    });

  } catch (error) {
    console.error("Error:", error);
  }
}

run();
