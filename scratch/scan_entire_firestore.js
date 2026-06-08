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

    // Function to page through all documents in a collection
    async function getAllDocuments(collectionName) {
      let documents = [];
      let nextPageToken = "";
      do {
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/${collectionName}?pageSize=300${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
        const res = await fetch(url, { headers });
        const data = await res.json();
        if (data.documents) {
          documents = documents.concat(data.documents);
        }
        nextPageToken = data.nextPageToken || "";
      } while (nextPageToken);
      return documents;
    }

    const collections = ["categories", "vendors", "clients", "products"];
    for (const coll of collections) {
      console.log(`\n=== SCANNING COLLECTION: ${coll} ===`);
      const docs = await getAllDocuments(coll);
      console.log(`Retrieved ${docs.length} documents.`);
      let corruptions = 0;
      docs.forEach(doc => {
        const id = doc.name.split('/').pop();
        const fields = doc.fields || {};
        let docCorrupted = false;
        
        function scanFields(obj) {
          if (!obj) return;
          Object.keys(obj).forEach(key => {
            const fieldVal = obj[key];
            if (fieldVal && fieldVal.stringValue) {
              const val = fieldVal.stringValue;
              if (val.includes("Ã") || val.includes("Â") || val.includes("Ã³") || val.includes("Ã¡")) {
                console.log(`Document ID: ${id} | Field: ${key} | Value: ${val}`);
                corruptions++;
                docCorrupted = true;
              }
            } else if (fieldVal && fieldVal.mapValue) {
              scanFields(fieldVal.mapValue.fields);
            } else if (fieldVal && fieldVal.arrayValue && fieldVal.arrayValue.values) {
              fieldVal.arrayValue.values.forEach(v => {
                if (v.stringValue && (v.stringValue.includes("Ã") || v.stringValue.includes("Â"))) {
                  console.log(`Document ID: ${id} | Array Value: ${v.stringValue}`);
                  corruptions++;
                  docCorrupted = true;
                } else if (v.mapValue) {
                  scanFields(v.mapValue.fields);
                }
              });
            }
          });
        }
        
        scanFields(fields);
      });
      console.log(`Finished ${coll}. Found ${corruptions} corruptions.`);
    }

  } catch (e) {
    console.error("Error:", e);
  }
}

run();
