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
    console.log("Tokens keys:", Object.keys(json.tokens || {}));
    if (json.tokens?.refresh_token) {
      console.log("Found refresh_token!");
    } else {
      console.log("No refresh_token found.");
    }
    const accessToken = json.tokens?.access_token;
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    console.log("=== CHECKING CATEGORIES IN FIRESTORE ===");
    const catRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/categories?pageSize=20`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const catData = await catRes.json();
    const categories = catData.documents || [];
    console.log(`Found ${categories.length} categories in Firestore:`);
    categories.forEach(c => {
      const id = c.name.split('/').pop();
      const fields = c.fields || {};
      console.log(`  - ID: ${id} | Name: ${fields.name?.stringValue || fields.Name?.stringValue || "N/A"}`);
    });

    console.log("\n=== CHECKING PRODUCTS IN FIRESTORE ===");
    const prodRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/products?pageSize=10`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const prodData = await prodRes.json();
    const products = prodData.documents || [];
    console.log(`Found ${products.length} sample products:`);
    products.forEach((p, idx) => {
      const fields = p.fields || {};
      console.log(`\nProduct ${idx + 1}: ${fields.title?.stringValue || fields.Title?.stringValue}`);
      console.log(`  - productType: ${fields.productType?.stringValue}`);
      console.log(`  - TypeText: ${fields.TypeText?.stringValue}`);
      console.log(`  - Category1ID: ${fields.Category1ID?.stringValue}`);
      console.log(`  - Category2ID: ${fields.Category2ID?.stringValue}`);
      console.log(`  - Category3ID: ${fields.Category3ID?.stringValue}`);
      console.log(`  - categoryId: ${fields.categoryId?.stringValue}`);
    });

  } catch (error) {
    console.error("Error:", error);
  }
}

run();
