const fs = require('fs');
const file = 'src/components/pos/SatCatalogSelect.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  'const [query, setQuery] = useState(nameValue || "");',
  'const [query, setQuery] = useState(nameValue || value || "");'
);

c = c.replace(
  'setQuery(nameValue || "");',
  'setQuery(nameValue || value || "");'
);

fs.writeFileSync(file, c, 'utf8');
console.log('Fixed SatCatalogSelect to display code if name is empty');
