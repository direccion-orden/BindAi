const fs = require('fs'); 

let f2 = 'src/app/(dashboard)/clientes/page.tsx';
let c2 = fs.readFileSync(f2, 'utf8'); 

// 1. Strip BOM if present
let idxClient = c2.indexOf('"use client"');
if (idxClient !== -1) {
  c2 = c2.substring(idxClient);
}

// 2. Remove orderBy("name")
c2 = c2.replace('orderBy("name")', ''); 
c2 = c2.replace('"clients"), );', '"clients"));'); 

// 3. Map properties
c2 = c2.replace(/c\.name/g, '(c.LegalName || c.CommercialName || c.name)');
c2 = c2.replace(/c\.email/g, '(c.Email || c.email)');
c2 = c2.replace(/c\.phone/g, '(c.Phone || c.phone)');
c2 = c2.replace(/c\.rfc/g, '(c.RFC || c.rfc)');

fs.writeFileSync(f2, c2, 'utf8');

console.log('Fixed clientes UI');
