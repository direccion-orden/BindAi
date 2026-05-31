const fs = require('fs');
const file = 'src/components/pos/SatCatalogSelect.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  'useEffect(() => {\n    setQuery(nameValue || value || "");\n  }, [nameValue]);',
  'useEffect(() => {\n    setQuery(nameValue || value || "");\n  }, [nameValue, value]);'
);

fs.writeFileSync(file, c, 'utf8');
console.log('Fixed SatCatalogSelect dependency array');
