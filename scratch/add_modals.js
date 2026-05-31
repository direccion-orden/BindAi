const fs = require('fs');

const nuevo = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');
let idPage = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');

const modalsStart = nuevo.indexOf('{/* Modals */}');
const modalsText = nuevo.substring(modalsStart, nuevo.lastIndexOf('</div>\n  );\n}'));

idPage = idPage.replace('      </div>\n    </div>\n  );\n}', '      </div>\n    </div>\n\n      ' + modalsText + '\n  );\n}');

fs.writeFileSync('src/app/(dashboard)/productos/[id]/page.tsx', idPage, 'utf8');
console.log('Appended Modals');
