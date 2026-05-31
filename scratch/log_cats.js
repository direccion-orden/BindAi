const fs = require('fs');
let c = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');

c = c.replace('setCategories(c);', 'console.log("Categories loaded:", c.length); setCategories(c);');

fs.writeFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', c, 'utf8');
console.log('Added console.log');
