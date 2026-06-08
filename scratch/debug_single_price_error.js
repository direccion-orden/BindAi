const fs = require('fs');
const path = require('path');
const os = require('os');

const BIND_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const API_BASE = "https://api.bind.com.mx/api";
const bindHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${BIND_API_KEY}`
};

async function run() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = json.tokens.access_token;
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    console.log("Fetching products from Firestore to find a few skipped ones...");
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

    const productsData = await queryRes.json();
    const products = productsData.filter(p => p.document).map(p => p.document);

    // Let's print some IDs that are from Bind ERP but might have been skipped
    const sampleIds = products.slice(10, 15).map(doc => doc.name.split('/').pop());
    console.log("Sample IDs to test:", sampleIds);

    for (const id of sampleIds) {
      console.log(`\nFetching ${id} from Bind ERP...`);
      const res = await fetch(`${API_BASE}/Products/${id}`, { headers: bindHeaders });
      console.log(`Status: ${res.status}`);
      if (!res.ok) {
        console.log("Error body:", await res.text());
      } else {
        const data = await res.json();
        console.log("Success! Title:", data.Title);
      }
    }

  } catch (e) {
    console.error(e);
  }
}
run();
