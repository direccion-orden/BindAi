const fs = require('fs');

const nuevo = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');
let idPage = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');

// 1. Remove the bad injection in idPage
const badInjectIndex = idPage.indexOf('\n\n      "use client";');
if (badInjectIndex !== -1) {
  idPage = idPage.substring(0, badInjectIndex);
} else {
  console.log('Bad injection not found via "use client"');
  // maybe just search for "use client" starting from 100?
  const secondUseClient = idPage.indexOf('"use client"', 100);
  if (secondUseClient !== -1) {
    idPage = idPage.substring(0, idPage.lastIndexOf('}', secondUseClient) + 1);
  }
}

// 2. Extract Modals correctly from nuevo/page.tsx
const modalsStart = nuevo.indexOf('      {isCategoryModalOpen && (');
if (modalsStart !== -1) {
  const modalsText = nuevo.substring(modalsStart, nuevo.lastIndexOf('    </div>\n  );\n}'));
  
  // 3. Inject correctly
  // Replace closing div tree
  idPage = idPage.replace(/      <\/div>\n    <\/div>\n  \);\n\}$/s, '      </div>\n    </div>\n\n' + modalsText + '\n    </div>\n  );\n}');
}

fs.writeFileSync('src/app/(dashboard)/productos/[id]/page.tsx', idPage, 'utf8');
console.log('Fixed syntax error and injected modals correctly!');
