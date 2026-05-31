const fs = require('fs');
let c = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');

c = c.replace('console.log("Categories loaded:", c.length); setCategories(c);', 'setCategories(c);');

fs.writeFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', c, 'utf8');
console.log('Removed console.log');
