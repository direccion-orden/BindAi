const fs = require('fs');
const file = 'src/app/(dashboard)/productos/nuevo/page.tsx';
let c = fs.readFileSync(file, 'utf8');

// 1. Add state
const stateRef = 'const [cost, setCost] = useState("");';
if (c.includes(stateRef)) {
  c = c.replace(stateRef, stateRef + '\n  const [initialCost, setInitialCost] = useState("");');
}

// 2. Save data
const saveRef = 'cost: parseFloat(cost) || 0,';
if (c.includes(saveRef)) {
  c = c.replace(saveRef, saveRef + '\n        initialCost: parseFloat(initialCost) || 0,');
}

// 3. UI
const oldUIBlock = `<div className="pt-4 border-t">
              <label className="text-sm font-medium mb-1.5 block">Costo Unitario Promedio</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="pl-7"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Utilizado para cálculos de margen y rentabilidad
              </p>
            </div>`;

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
                  <Input value={cost} disabled className="pl-7 bg-muted text-muted-foreground font-semibold" placeholder="Calculado" />
                </div>
              </div>
            </div>`;
            
if (c.includes(oldUIBlock)) {
  c = c.replace(oldUIBlock, newUI);
}

fs.writeFileSync(file, c, 'utf8');
console.log('Updated nuevo page with initialCost');
