const fs = require('fs');
const content = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');

try {
  const babel = require('@babel/parser');
  babel.parse(content, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  console.log('No syntax errors in nuevo/page.tsx');
} catch (e) {
  console.error('Syntax error in nuevo/page.tsx:', e.message);
}
