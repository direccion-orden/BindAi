const fs = require('fs');
const content = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');

let open = 0;
let close = 0;
for (let i = 0; i < content.length; i++) {
  if (content.substr(i, 4) === '<div') open++;
  if (content.substr(i, 5) === '</div') close++;
}
console.log(`open: ${open}, close: ${close}`);
console.log(`Second use client exists: ${content.indexOf('"use client"', 100) !== -1}`);
