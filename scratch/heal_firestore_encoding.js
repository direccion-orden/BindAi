const fs = require('fs');
const path = require('path');
const os = require('os');

const DRY_RUN = false; // Set to false to perform the actual update

function fixDoubleEncoding(str) {
  if (!str) return str;
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode <= 0x7F) {
      bytes.push(charCode);
    } else if (charCode >= 0xA0 && charCode <= 0xFF) {
      bytes.push(charCode);
    } else {
      const char = str.charAt(i);
      switch (char) {
        case '€': bytes.push(0x80); break;
        case '‚': bytes.push(0x82); break;
        case 'ƒ': bytes.push(0x83); break;
        case '„': bytes.push(0x84); break;
        case '…': bytes.push(0x85); break;
        case '†': bytes.push(0x86); break;
        case '‡': bytes.push(0x87); break;
        case 'ˆ': bytes.push(0x88); break;
        case '‰': bytes.push(0x89); break;
        case 'Š': bytes.push(0x8A); break;
        case '‹': bytes.push(0x8B); break;
        case 'Œ': bytes.push(0x8C); break;
        case 'Ž': bytes.push(0x8E); break;
        case '‘': bytes.push(0x91); break;
        case '’': bytes.push(0x92); break;
        case '“': bytes.push(0x93); break;
        case '”': bytes.push(0x94); break;
        case '•': bytes.push(0x95); break;
        case '–': bytes.push(0x96); break;
        case '—': bytes.push(0x97); break;
        case '˜': bytes.push(0x98); break;
        case '™': bytes.push(0x99); break;
        case 'š': bytes.push(0x9A); break;
        case '›': bytes.push(0x9B); break;
        case 'œ': bytes.push(0x9C); break;
        case 'ž': bytes.push(0x9E); break;
        case 'Ÿ': bytes.push(0x9F); break;
        default:
          bytes.push(charCode & 0xFF);
          break;
      }
    }
  }
  try {
    return Buffer.from(bytes).toString('utf8');
  } catch (e) {
    return str;
  }
}

function hasCorruption(str) {
  if (!str) return false;
  return str.includes("Ã") || str.includes("Â");
}

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

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

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

    async function patchDocument(collectionName, docId, fieldsToUpdate) {
      const updateMaskParams = Object.keys(fieldsToUpdate).map(key => `updateMask.fieldPaths=${key}`).join('&');
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/${collectionName}/${docId}?${updateMaskParams}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          fields: fieldsToUpdate
        })
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to patch doc ${docId}: ${errorText}`);
      }
      return res.json();
    }

    const collections = ["vendors", "clients", "products"];
    
    for (const coll of collections) {
      console.log(`\n=== HEALING COLLECTION: ${coll} ===`);
      const docs = await getAllDocuments(coll);
      console.log(`Total documents found: ${docs.length}`);
      
      let fixedCount = 0;
      
      for (const doc of docs) {
        const id = doc.name.split('/').pop();
        const fields = doc.fields || {};
        const fieldsToUpdate = {};
        let needsUpdate = false;

        // Check and fix top-level string fields
        Object.keys(fields).forEach(key => {
          const fieldVal = fields[key];
          if (fieldVal && fieldVal.stringValue) {
            const originalVal = fieldVal.stringValue;
            if (hasCorruption(originalVal)) {
              const fixedVal = fixDoubleEncoding(originalVal);
              if (fixedVal !== originalVal) {
                fieldsToUpdate[key] = { stringValue: fixedVal };
                needsUpdate = true;
                console.log(`[${coll}] Doc: ${id} | Field: ${key} | "${originalVal}" -> "${fixedVal}"`);
              }
            }
          }
        });

        if (needsUpdate) {
          if (!DRY_RUN) {
            try {
              await patchDocument(coll, id, fieldsToUpdate);
              fixedCount++;
              // Sleep briefly to avoid rate limits
              await new Promise(resolve => setTimeout(resolve, 50));
            } catch (e) {
              console.error(`Error updating document ${id}:`, e.message);
            }
          } else {
            console.log(`[DRY RUN] Would update doc ${id} with:`, JSON.stringify(fieldsToUpdate));
            fixedCount++;
          }
        }
      }
      console.log(`Finished ${coll}. Healed ${fixedCount} documents.`);
    }

    console.log("\n=== HEALING PROCESS COMPLETED ===");

  } catch (e) {
    console.error("Global Error:", e);
  }
}

run();
