const fs = require('fs');

let file = fs.readFileSync('src/components/pos/POSCatalogPanel.tsx', 'utf8');

file = file.replace(
  'const q = query(collection(db, "companies", companyId, "products"), where("status", "==", "ACTIVE"), limit(50));',
  'const q = query(collection(db, "companies", companyId, "products"), where("status", "==", "ACTIVE"));'
);

fs.writeFileSync('src/components/pos/POSCatalogPanel.tsx', file, 'utf8');
console.log('Removed limit(50) from POS products query');
