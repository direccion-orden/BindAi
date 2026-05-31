const fs = require('fs');
const file = 'src/app/(dashboard)/productos/[id]/page.tsx';
let c = fs.readFileSync(file, 'utf8');

// 1. Add state
const stateRef = 'const [cost, setCost] = useState("0");';
c = c.replace(stateRef, stateRef + '\n  const [initialCost, setInitialCost] = useState("0");');

// 2. Fetch data
const fetchRef = 'setCost(data.cost?.toString() || "0");';
if (c.includes(fetchRef)) {
  c = c.replace(fetchRef, fetchRef + '\n      setInitialCost(data.initialCost?.toString() || "0");');
} else {
  const fallbackRef = 'setInventoryQuantity(v.inventoryQuantity?.toString() || "0");';
  c = c.replace(fallbackRef, fallbackRef + '\n        setInitialCost(data.initialCost?.toString() || data.cost?.toString() || "0");');
}

// 3. Save data
const saveRef = 'const updatedProduct: Partial<ShopifyProduct> = {';
c = c.replace(saveRef, saveRef + '\n        initialCost: parseFloat(initialCost) || 0,');

// 4. UI
const uiRef = `<div className="pt-4 border-t">
              <label className="text-sm font-medium mb-1.5 block text-indigo-700">Costo Unitario Promedio</label>`;
const newUI = `<div className="pt-4 border-t grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Costo Inicial</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input 
                    type="number"
                    value={initialCost}
                    onChange={(e) => setInitialCost(e.target.value)}
                    className="pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block text-indigo-700">Costo Promedio</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input value={cost} disabled className="pl-7 bg-muted text-muted-foreground font-semibold" />
                </div>
              </div>
            </div>`;
            
const oldUIBlock = `<div className="pt-4 border-t">
              <label className="text-sm font-medium mb-1.5 block text-indigo-700">Costo Unitario Promedio</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input 
                  value={cost}
                  disabled
                  className="pl-7 bg-muted text-muted-foreground font-semibold"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Calculado automáticamente mediante Costo Promedio Ponderado en las recepciones de mercancía.
              </p>
            </div>`;
            
c = c.replace(oldUIBlock, newUI);

fs.writeFileSync(file, c, 'utf8');
console.log('Updated edit page with initialCost');
