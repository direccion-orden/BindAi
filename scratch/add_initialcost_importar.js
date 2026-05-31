const fs = require('fs');
const file = 'src/app/(dashboard)/productos/importar/page.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  'cost: cost,\n                  iva: record["Tipo de IVA."]',
  'initialCost: cost,\n                  cost: existingProduct?.cost || cost,\n                  iva: record["Tipo de IVA."]'
);

fs.writeFileSync(file, c, 'utf8');
console.log('Added initialCost to importer');
