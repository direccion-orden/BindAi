const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = json.tokens.access_token;
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    console.log("Fetching a single raw product document from Firestore...");
    const companyDocRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/products/7cbdf932-9be3-4fb5-a09f-000a53356783`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const doc = await companyDocRes.json();
    console.log("Document Name:", doc?.name);
    console.log("Document Fields:");
    console.log(JSON.stringify(doc?.fields, null, 2));

  } catch (e) {
    console.error(e);
  }
}
run();
