const fs = require('fs');

const nuevo = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf8');
let idPage = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');

// 1. Extract states
const statesRegex = /(const \[categories, setCategories\].*?const \[savingVendor, setSavingVendor\] = useState\(false\);)/s;
const statesMatch = nuevo.match(statesRegex);

if (statesMatch) {
  // Insert states after const [inventoryRole...
  idPage = idPage.replace('const [inventoryRole, setInventoryRole] = useState<\'PRODUCTO\' | \'MATERIA_PRIMA\' | \'AMBOS\'>(\'PRODUCTO\');', 
    'const [inventoryRole, setInventoryRole] = useState<\'PRODUCTO\' | \'MATERIA_PRIMA\' | \'AMBOS\'>(\'PRODUCTO\');\n  ' + statesMatch[1]
  );
}

// 2. Extract useEffect
const effectRegex = /(  \/\/ Fetch Warehouses, Categories, Tags & Vendors.*?\}, \[companyId\]\);)/s;
const effectMatch = nuevo.match(effectRegex);
if (effectMatch) {
  idPage = idPage.replace('  useEffect(() => {\n    if (productId === "nuevo") {',
    effectMatch[1] + '\n\n  useEffect(() => {\n    if (productId === "nuevo") {'
  );
}

// 3. Extract JSX Card
const cardRegex = /(<div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">\s*<h3 className="font-semibold">Organización del producto<\/h3>.*?<\/div>\s*<\/div>\s*<\/div>)/s;
const cardMatch = nuevo.match(cardRegex);
if (cardMatch) {
  const targetCardRegex = /<div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">\s*<h3 className="font-semibold">Organización del producto<\/h3>.*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/s;
  idPage = idPage.replace(targetCardRegex, cardMatch[1] + '\n        </div>');
}

// 4. Extract Modals
const modalsRegex = /(      \{\/\* Modals \*\/}.*)$/s;
const modalsMatch = nuevo.match(modalsRegex);
if (modalsMatch) {
  // replace closing </div>);
  idPage = idPage.replace(/    <\/div>\n  \);\n\}\n*$/, '\n' + modalsMatch[1]);
}

// 5. Add Tags to handleSave in idPage
idPage = idPage.replace('productType: productType,', 'productType: productType,\n        tags: selectedTags,');

// 6. Handle initial tags load
idPage = idPage.replace('setSatUnitName(data.satUnitName || "");', 'setSatUnitName(data.satUnitName || "");\n      setSelectedTags(data.tags || []);');

// 7. Extract handleModal functions
const handlersRegex = /(  const handleSaveCategory.*?setSavingVendor\(false\);\n  \})/s;
const handlersMatch = nuevo.match(handlersRegex);
if (handlersMatch) {
  idPage = idPage.replace('const handleSave = async', handlersMatch[1] + '\n\n  const handleSave = async');
}


fs.writeFileSync('src/app/(dashboard)/productos/[id]/page.tsx', idPage, 'utf8');
console.log('Successfully copied Organization section and Modals to edit page');
