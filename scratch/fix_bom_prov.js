const fs = require('fs');
let f = 'src/app/(dashboard)/proveedores/page.tsx';
let c = fs.readFileSync(f, 'utf8');
let idx = c.indexOf('"use client"');
if (idx !== -1) {
  let cleaned = c.substring(idx);
  fs.writeFileSync(f, cleaned, 'utf8');
  console.log('Fixed BOM hard for ' + f);
}
