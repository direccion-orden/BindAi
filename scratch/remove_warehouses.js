const fs = require('fs');

let idPage = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');

const targetEffectPart1 = `    // Warehouses
    const qW = query(collection(db, "companies", companyId, "warehouses"));
    const unsubW = onSnapshot(qW, (snap) => {
      const w = snap.docs.map((doc) => ({ id: doc.id, name: doc.data().name }));
      setWarehouses(w);
    });\n`;

idPage = idPage.replace(targetEffectPart1, '');
idPage = idPage.replace('unsubW();\n', '');

fs.writeFileSync('src/app/(dashboard)/productos/[id]/page.tsx', idPage, 'utf8');
console.log('Removed unsubW references');
