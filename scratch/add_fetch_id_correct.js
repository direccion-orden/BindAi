const fs = require('fs');

let idPage = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');
const nuevo = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');

const effectMatch = nuevo.match(/(  \/\/ Fetch Warehouses, Categories, Tags & Vendors.*?\}, \[companyId\]\);)/s);

if (effectMatch) {
  const target = '  const fetchProduct = async () => {';
  idPage = idPage.replace(target, effectMatch[1] + '\n\n' + target);
  fs.writeFileSync('src/app/(dashboard)/productos/[id]/page.tsx', idPage, 'utf8');
  console.log('Injected fetch useEffect into id/page.tsx');
}
