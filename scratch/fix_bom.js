const fs = require('fs'); 
['src/app/(dashboard)/configuracion/cuentas/page.tsx', 'src/app/(dashboard)/configuracion/sucursales/page.tsx'].forEach(file => { 
  let c = fs.readFileSync(file, 'utf8'); 
  let idx = c.indexOf('"use client"'); 
  if (idx !== -1) { 
    let cleaned = c.substring(idx); 
    fs.writeFileSync(file, cleaned, 'utf8'); 
    console.log('Fixed BOM hard for ' + file); 
  } 
});
