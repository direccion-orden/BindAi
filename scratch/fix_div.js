const fs = require('fs');
const file = 'src/app/(dashboard)/productos/[id]/page.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace('        </div>\n    </div>\n  );\n}', '        </div>\n      </div>\n    </div>\n  );\n}');

fs.writeFileSync(file, c, 'utf8');
console.log('Added missing closing div');
