const fs = require('fs');

let idPage = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');
const nuevo = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');

// 1. Get the fetch useEffect from nuevo
const effectMatch = nuevo.match(/(  \/\/ Fetch Warehouses, Categories, Tags & Vendors.*?\}, \[companyId\]\);)/s);

if (effectMatch) {
  // Insert it in idPage right before the first useEffect (which is usually fetchProduct)
  const target = '  useEffect(() => {\n    if (!companyId) return;\n    const fetchProduct';
  idPage = idPage.replace(target, effectMatch[1] + '\n\n' + target);
  fs.writeFileSync('src/app/(dashboard)/productos/[id]/page.tsx', idPage, 'utf8');
  console.log('Successfully added the fetch useEffect to idPage');
} else {
  console.log('Failed to match useEffect from nuevo');
}

