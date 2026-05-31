const fs = require('fs');

function fixFile(file) {
  let c = fs.readFileSync(file, 'utf8');
  const target = `const c = snap.docs.map((doc) => ({ id: doc.id, name: doc.data().name }));`;
  const replacement = `const c = snap.docs.map((doc) => {
        const d = doc.data();
        return { id: doc.id, name: d.name || d.Name || d.description || d.Description || "Sin nombre" };
      });`;
      
  c = c.replace(target, replacement);
  fs.writeFileSync(file, c, 'utf8');
  console.log(`Fixed categories in ${file}`);
}

fixFile('src/app/(dashboard)/productos/nuevo/page.tsx');
fixFile('src/app/(dashboard)/productos/[id]/page.tsx');
