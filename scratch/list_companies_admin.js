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

    if (!accessToken) {
      console.error("Access token not found!");
      return;
    }

    const headers = { 'Authorization': `Bearer ${accessToken}` };
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies`, { headers });
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
