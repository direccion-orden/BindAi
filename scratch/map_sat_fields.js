const fs = require('fs');
const file = 'src/app/(dashboard)/productos/importar/page.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  'iva: record["Tipo de IVA."] ? parseFloat(record["Tipo de IVA."].replace("%", "")) : 0,\n                  variants: [',
  'iva: record["Tipo de IVA."] ? parseFloat(record["Tipo de IVA."].replace("%", "")) : 0,\n                  satProductCode: record["Clave CFDI"] || "",\n                  satUnitCode: record["Unidad CFDI"] || "",\n                  variants: ['
);

fs.writeFileSync(file, c, 'utf8');
console.log('Successfully mapped SAT fields to product bulk importer');
