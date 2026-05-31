const fs = require('fs');
const nuevo = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');

// find modal string
const modalStr = 'isCategoryModalOpen';
console.log('Index of modal string:', nuevo.indexOf(modalStr));

// check if Modals comment exists
console.log('Index of {/* Modals */}:', nuevo.indexOf('{/* Modals */}'));

// Print the last 2000 chars of nuevo
console.log('--- Last 2000 chars of nuevo ---');
console.log(nuevo.slice(-2000));

