const fs = require('fs');

function fixFile(file) {
  let c = fs.readFileSync(file, 'utf8');
  const target = `const v = snap.docs.map((doc) => ({ id: doc.id, name: doc.data().name }));`;
  const replacement = `const v = snap.docs.map((doc) => {
        const d = doc.data();
        return { id: doc.id, name: d.name || d.Name || d.RazonSocial || d.NombreComercial || d.LegalName || d.ComercialName || "Sin nombre" };
      });`;
      
  c = c.replace(target, replacement);
  fs.writeFileSync(file, c, 'utf8');
  console.log(`Fixed vendors in ${file}`);
}

fixFile('src/app/(dashboard)/productos/nuevo/page.tsx');
fixFile('src/app/(dashboard)/productos/[id]/page.tsx');
