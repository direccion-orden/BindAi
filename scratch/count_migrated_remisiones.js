const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const tokenPath = path.join(__dirname, 'temp_token.txt');
    if (!fs.existsSync(tokenPath)) {
      console.error("Access token file not found.");
      return;
    }
    const accessToken = fs.readFileSync(tokenPath, 'utf8').trim();
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    console.log("Querying all migrated remisiones without limit...");
    const queryRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}:runQuery`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{
            collectionId: "remisiones",
            allDescendants: false
          }],
          where: {
            fieldFilter: {
              field: { fieldPath: "migrated" },
              op: "EQUAL",
              value: { booleanValue: true }
            }
          }
          // No limit specified
        }
      })
    });

    if (!queryRes.ok) {
      console.error("Failed to query Firestore:", await queryRes.text());
      return;
    }

    const results = await queryRes.json();
    const docs = results.filter(r => r.document).map(r => r.document);
    console.log(`Found ${docs.length} migrated remisiones in response.`);
  } catch (e) {
    console.error(e);
  }
}

run();
