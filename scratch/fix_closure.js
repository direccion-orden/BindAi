const fs = require('fs');

const nuevo = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');
let idPage = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');

const marker = '                      </span>\n                    ))}\n                  </div>\n                )}\n              </div>';

const nuevoEnding = nuevo.substring(nuevo.indexOf(marker) + marker.length);
idPage = idPage.substring(0, idPage.indexOf(marker) + marker.length) + nuevoEnding;

fs.writeFileSync('src/app/(dashboard)/productos/[id]/page.tsx', idPage, 'utf8');
console.log('Replaced the end of idPage with the exact end of nuevo/page');
