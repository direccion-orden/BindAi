const fs = require('fs');

const nuevo = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');
let idPage = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');

// Modals from nuevo
const modalsStart = nuevo.indexOf('      {isCategoryModalOpen && (');
const modalsText = nuevo.substring(modalsStart, nuevo.lastIndexOf('    </div>\n  );\n}'));

// Append modals and the closing tags
idPage = idPage.trimEnd() + '\n\n' + modalsText + '\n    </div>\n  );\n}\n';

fs.writeFileSync('src/app/(dashboard)/productos/[id]/page.tsx', idPage, 'utf8');
console.log('Appended Modals and closing tags correctly');
