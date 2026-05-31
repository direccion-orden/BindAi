const fs = require('fs');

let f = 'src/app/(dashboard)/categorias/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// 1. Remove orderBy
c = c.replace(/, orderBy\("name"\)/g, '');

// 2. Fix filter logic
c = c.replace(/c\.name\.toLowerCase\(\)\.includes/g, '(c.Description || c.Name || c.name || "").toLowerCase().includes');

// 3. Fix UI display
c = c.replace(/\{c\.name\}/g, '{(c.Description || c.Name || c.name)}');

fs.writeFileSync(f, c, 'utf8');
console.log('Fixed categorias UI mapping and Firebase constraints');
