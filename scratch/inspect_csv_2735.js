const fs = require('fs');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Pedidos (7).csv';

async function check() {
  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found at " + csvPath);
    return;
  }
  const fileContent = fs.readFileSync(csvPath, { encoding: 'binary' });
  const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
  const parsed = Papa.parse(latin1Content, { header: true });
  
  console.log("Total rows in CSV:", parsed.data.length);
  if (parsed.data.length > 0) {
    console.log("Headers available:", Object.keys(parsed.data[0]));
  }
  
  const matches = [];
  parsed.data.forEach((r, idx) => {
    let match = false;
    Object.keys(r).forEach(k => {
      if (String(r[k]).includes("2735")) {
        match = true;
      }
    });
    if (match) {
      matches.push({ row: idx + 2, data: r });
    }
  });

  console.log(`Found ${matches.length} matching rows containing '2735':`);
  matches.forEach(m => {
    console.log(`\nRow ${m.row}:`);
    Object.keys(m.data).forEach(k => {
      if (m.data[k]) console.log(`  ${k}: ${m.data[k]}`);
    });
  });
}

check();
