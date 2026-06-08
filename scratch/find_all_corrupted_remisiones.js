const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

async function run() {
  try {
    const tokenPath = path.join(__dirname, 'temp_token.txt');
    if (!fs.existsSync(tokenPath)) {
      console.error("Access token file not found. Run scratch/get_firebase_token.js first.");
      return;
    }
    const accessToken = fs.readFileSync(tokenPath, 'utf8').trim();
    
    const xlsPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas (30).xls';
    if (!fs.existsSync(xlsPath)) {
      console.error("XLS file not found at " + xlsPath);
      return;
    }

    console.log("Reading XLS workbook...");
    const workbook = xlsx.readFile(xlsPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const xlsRows = xlsx.utils.sheet_to_json(sheet);
    console.log(`XLS rows count: ${xlsRows.length}`);

    // Group items by remission number (No.)
    // We clean the remission number just like in merge_ventas.js
    const getCleanNumbers = (numStr) => {
      if (!numStr) return [];
      const cleaned = String(numStr).replace(/\s+/g, '').trim().toLowerCase();
      if (!cleaned) return [];
      const parenMatch = cleaned.match(/^([^(]+)\(([^)]+)\)$/);
      if (parenMatch) return [parenMatch[1], parenMatch[2]];
      return [cleaned];
    };

    const parseNumber = (val) => {
      if (val === undefined || val === null) return 0;
      return parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 0;
    };

    const xlsDocsMap = new Map();
    xlsRows.forEach((row) => {
      const noRaw = row['No.'] || row['No'];
      const docTypeRaw = row['Tipo'];
      if (!noRaw || !docTypeRaw) return;

      const docType = String(docTypeRaw).trim().toLowerCase();
      if (!docType.includes('remis') && !docType.includes('factur')) return;

      const nums = getCleanNumbers(noRaw);
      nums.forEach(num => {
        if (!xlsDocsMap.has(num)) {
          xlsDocsMap.set(num, []);
        }
        
        // Extract product details
        const productRaw = String(row['Producto/Concepto'] || row['Grupo'] || '').trim();
        const skuMatch = productRaw.match(/^(.+?)\s*\(Cód:\s*([^)]+?)\s*\)$/);
        let productName = productRaw;
        let sku = String(row['Código Prod/Serv'] || '').trim();
        if (skuMatch) {
          productName = skuMatch[1].trim();
          if (!sku) sku = skuMatch[2].trim();
        }

        const qty = parseNumber(row['Cantidad']);
        const subtotalLine = parseNumber(row['Subtotal']);
        const unitPrice = qty > 0 ? (subtotalLine / qty) : 0;

        xlsDocsMap.get(num).push({
          productName,
          sku,
          quantity: qty,
          unitPrice
        });
      });
    });

    console.log(`Grouped ${xlsDocsMap.size} documents from XLS.`);

    // Now query Firestore for documents
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";
    
    // We will query all remisiones with migrated = true
    console.log("Querying Firestore for migrated remisiones...");
    
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
        }
      })
    });

    if (!queryRes.ok) {
      console.error("Failed to query Firestore:", await queryRes.text());
      return;
    }

    const results = await queryRes.json();
    const docs = results.filter(r => r.document).map(r => r.document);
    console.log(`Found ${docs.length} migrated remisiones in Firestore.`);

    const formatVal = (f) => {
      if (!f) return null;
      if (f.doubleValue !== undefined) return f.doubleValue;
      if (f.integerValue !== undefined) return parseInt(f.integerValue, 10);
      if (f.stringValue !== undefined) return f.stringValue;
      if (f.booleanValue !== undefined) return f.booleanValue;
      return JSON.stringify(f);
    };

    let corruptedCount = 0;
    const corruptedDocs = [];

    docs.forEach(doc => {
      const fields = doc.fields || {};
      const remissionNumber = formatVal(fields.remissionNumber);
      const items = fields.items?.arrayValue?.values || [];
      
      let isCorrupted = false;
      const issues = [];

      items.forEach((item, index) => {
        const itemFields = item.mapValue?.fields || {};
        const pName = formatVal(itemFields.productName);
        const qty = formatVal(itemFields.quantity);
        const storedPrice = formatVal(itemFields.unitPrice);

        // Check if unitPrice is unusually small (e.g. less than 1.0) while qty is > 0
        // AND there is a product that normally costs much more.
        if (qty > 0 && storedPrice < 1.0) {
          // Let's verify with XLS
          const xlsItems = xlsDocsMap.get(remissionNumber) || [];
          // Try to match XLS item by name or SKU
          const matchXls = xlsItems.find(xi => xi.productName === pName || (xi.sku && xi.sku === formatVal(itemFields.sku)));
          if (matchXls && matchXls.unitPrice >= 1.0) {
            isCorrupted = true;
            issues.push({
              productName: pName,
              quantity: qty,
              storedPrice,
              xlsPrice: matchXls.unitPrice
            });
          }
        }
      });

      if (isCorrupted) {
        corruptedCount++;
        corruptedDocs.push({
          id: doc.name.split('/').pop(),
          remissionNumber,
          clientName: formatVal(fields.clientName),
          totalAmount: formatVal(fields.totalAmount),
          issues
        });
      }
    });

    console.log(`\nFound ${corruptedCount} corrupted documents:`);
    corruptedDocs.forEach(d => {
      console.log(`- Remission ${d.remissionNumber} (${d.clientName}), Total: $${d.totalAmount}`);
      d.issues.forEach(iss => {
        console.log(`    * ${iss.productName}: Stored $${iss.storedPrice} | Expected $${iss.xlsPrice} (qty: ${iss.quantity})`);
      });
    });

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
