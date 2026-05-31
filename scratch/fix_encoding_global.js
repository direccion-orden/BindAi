const fs = require('fs');

const files = [
  'src/app/(dashboard)/bancos/page.tsx',
  'src/app/(dashboard)/clientes/page.tsx',
  'src/app/(dashboard)/proveedores/page.tsx'
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  if (c.includes('Ã') || c.includes('')) {
    let fixed = Buffer.from(c, 'latin1').toString('utf8');
    fs.writeFileSync(f, fixed, 'utf8');
    console.log('Fixed encoding for ' + f);
  }
});
