const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
      console.error("firebase-tools.json not found!");
      return;
    }
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = json.tokens?.access_token;
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    if (!accessToken) {
      console.error("Access token not found!");
      return;
    }

    const headers = { 'Authorization': `Bearer ${accessToken}` };

    console.log("=== CHECKING FOR ENCODING CORRUPTIONS IN VENDORS ===");
    const vendorsRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/vendors?pageSize=50`, { headers });
    const vendorsData = await vendorsRes.json();
    const vendors = vendorsData.documents || [];
    let vendorCorruptions = 0;
    vendors.forEach(doc => {
      const id = doc.name.split('/').pop();
      const fields = doc.fields || {};
      Object.keys(fields).forEach(key => {
        const val = fields[key]?.stringValue || "";
        if (val.includes("Ã") || val.includes("Â")) {
          console.log(`Vendor ID: ${id} | Field: ${key} | Value: ${val}`);
          vendorCorruptions++;
        }
      });
    });
    console.log(`Checked ${vendors.length} vendors. Found ${vendorCorruptions} corruptions.\n`);

    console.log("=== CHECKING FOR ENCODING CORRUPTIONS IN CLIENTS ===");
    const clientsRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/clients?pageSize=50`, { headers });
    const clientsData = await clientsRes.json();
    const clients = clientsData.documents || [];
    let clientCorruptions = 0;
    clients.forEach(doc => {
      const id = doc.name.split('/').pop();
      const fields = doc.fields || {};
      Object.keys(fields).forEach(key => {
        const val = fields[key]?.stringValue || "";
        if (val.includes("Ã") || val.includes("Â")) {
          console.log(`Client ID: ${id} | Field: ${key} | Value: ${val}`);
          clientCorruptions++;
        }
      });
    });
    console.log(`Checked ${clients.length} clients. Found ${clientCorruptions} corruptions.\n`);

    console.log("=== CHECKING FOR ENCODING CORRUPTIONS IN PRODUCTS (SAMPLES) ===");
    const productsRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/products?pageSize=100`, { headers });
    const productsData = await productsRes.json();
    const products = productsData.documents || [];
    let productCorruptions = 0;
    products.forEach(doc => {
      const id = doc.name.split('/').pop();
      const fields = doc.fields || {};
      Object.keys(fields).forEach(key => {
        const val = fields[key]?.stringValue || "";
        if (val.includes("Ã") || val.includes("Â")) {
          console.log(`Product ID: ${id} | Field: ${key} | Value: ${val}`);
          productCorruptions++;
        }
      });
    });
    console.log(`Checked ${products.length} products. Found ${productCorruptions} corruptions.\n`);

  } catch (e) {
    console.error("Error:", e);
  }
}

run();
