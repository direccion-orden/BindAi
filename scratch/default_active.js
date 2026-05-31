const fs = require('fs');

let c = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');
c = c.replace(
  'const [status, setStatus] = useState<"ACTIVE" | "DRAFT">("DRAFT");',
  'const [status, setStatus] = useState<"ACTIVE" | "DRAFT">("ACTIVE");'
);

fs.writeFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', c, 'utf8');
console.log('Changed default status to ACTIVE');
