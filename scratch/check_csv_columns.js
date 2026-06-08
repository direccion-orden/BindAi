const fs = require('fs');

const file = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Precios (6).csv';
async function run() {
  try {
    const content = fs.readFileSync(file, 'latin1');
    const firstLine = content.split('\n')[0];
    console.log("Headers for Precios (6).csv:");
    console.log(firstLine);

    // Let's print the first 3 rows
    console.log("\nFirst 3 rows:");
    content.split('\n').slice(0, 4).forEach((line, i) => {
      console.log(`${i}: ${line}`);
    });
  } catch (e) {
    console.error(e);
  }
}
run();
