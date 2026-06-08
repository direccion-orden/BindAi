const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
      console.error("No firebase-tools.json found!");
      return;
    }
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = json.tokens.access_token;
    if (!accessToken) {
      console.error("No access token found in firebase-tools.json!");
      return;
    }

    console.log("Using access token from firebase-tools.json...");

    const projectId = "bind-ai-6f1fc";

    // 1. Fetch companies
    console.log("Fetching companies...");
    const companiesRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!companiesRes.ok) {
      console.error("Failed to fetch companies:", await companiesRes.text());
      return;
    }

    const companiesData = await companiesRes.json();
    const companies = companiesData.documents || [];
    console.log(`Found ${companies.length} companies:`);

    for (const companyDoc of companies) {
      const companyId = companyDoc.name.split('/').pop();
      const companyName = companyDoc.fields?.name?.stringValue || "Unknown";
      console.log(`\nCompany: ${companyName} (${companyId})`);

      // 2. Count products in subcollection products using runQuery
      const queryRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}:runQuery`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{
              collectionId: "products",
              allDescendants: false
            }]
          }
        })
      });

      if (!queryRes.ok) {
        console.error(`Failed to query company specific products:`, await queryRes.text());
        continue;
      }

      const productsData = await queryRes.json();
      // Firestore returns array of objects like [{ document: ... }, {}] or [ {} ] empty
      const products = productsData.filter(p => p.document);
      console.log(`- Products count: ${products.length}`);
      if (products.length > 0) {
        console.log("Examples of some products:");
        products.slice(0, 5).forEach((p, idx) => {
          const doc = p.document;
          const title = doc.fields?.title?.stringValue || doc.fields?.name?.stringValue || "No Name";
          const sku = doc.fields?.variants?.arrayValue?.values?.[0]?.mapValue?.fields?.sku?.stringValue || "No SKU";
          console.log(`  ${idx + 1}. [SKU: ${sku}] ${title}`);
        });
      }
    }

  } catch (error) {
    console.error("Error running script:", error);
  }
}

run();
