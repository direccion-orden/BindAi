const fs = require('fs');

let pageTxt = fs.readFileSync('src/app/(dashboard)/caja/page.tsx', 'utf8');

const denomCode = `
const DENOMINATIONS = [
  { value: 1000, label: "$1000" },
  { value: 500, label: "$500" },
  { value: 200, label: "$200" },
  { value: 100, label: "$100" },
  { value: 50, label: "$50" },
  { value: 20, label: "$20" },
  { value: 10, label: "$10" },
  { value: 5, label: "$5" },
  { value: 2, label: "$2" },
  { value: 1, label: "$1" },
  { value: 0.5, label: "50¢" },
];
`;

pageTxt = pageTxt.replace('export default function CajaPage() {', denomCode + '\nexport default function CajaPage() {');

const statesObj = `
  const [liveCardSales, setLiveCardSales] = useState("");
  const [liveCounts, setLiveCounts] = useState({});

  const handleLiveCountChange = (valStr, qtyStr) => {
    const qty = parseInt(qtyStr, 10) || 0;
    setLiveCounts(prev => ({ ...prev, [valStr]: Math.max(0, qty) }));
  };
`;
pageTxt = pageTxt.replace('const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);', 'const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);\n' + statesObj);

const oldCalcBlock = `  // Cálculos del turno activo
  const totalFondo = activeSession?.initialFloat || 0;
  const totalIngresos = transactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
  const totalRetiros = transactions.filter(t => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);
  const expectedCash = totalFondo + totalIngresos + erpCashSales - totalRetiros;`;

const newCalcBlock = `  // Cálculos del turno activo
  const totalFondo = activeSession?.initialFloat || 0;
  const totalIngresos = transactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
  const totalRetiros = transactions.filter(t => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);
  
  const liveCardVouchers = parseFloat(liveCardSales) || 0;
  const estimatedCashSales = Math.max(0, erpCashSales - liveCardVouchers);

  const expectedCash = totalFondo + totalIngresos + estimatedCashSales - totalRetiros;

  const countedCash = DENOMINATIONS.reduce((acc, denom) => {
    const qty = liveCounts[denom.value.toString()] || 0;
    return acc + (qty * denom.value);
  }, 0);

  const liveDiscrepancy = countedCash - expectedCash;`;

pageTxt = pageTxt.replace(oldCalcBlock, newCalcBlock);

const old4Card = `<p className="text-sm text-muted-foreground flex justify-between whitespace-nowrap">Ventas Efectivo (Bind) {isFetchingErp && <Loader2 className="w-4 h-4 animate-spin text-primary"/>}</p>
                  <p className="text-2xl font-bold text-foreground">
                   + {erpCashSales.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>`;

const new4Card = `<p className="text-sm text-muted-foreground flex justify-between whitespace-nowrap" title="El total reportado de ERP menos la resta de los vouchers manuales que ingreses.">Efectivo Mínimo x Ventas {isFetchingErp && <Loader2 className="w-4 h-4 animate-spin text-primary"/>}</p>
                  <p className="text-2xl font-bold text-foreground">
                   + {estimatedCashSales.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>`;
pageTxt = pageTxt.replace(old4Card, new4Card);

const blockUI = `
            {/* Arqueo en Caliente */}
            <div className="bg-card border rounded-lg shadow-sm p-4 animate-in fade-in">
               <h3 className="font-semibold text-lg border-b pb-2 mb-4">Arqueo Físico Simultáneo (Sin Cerrar)</h3>
               <div className="flex flex-col xl:flex-row gap-6">
                 
                 <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-4 bg-muted/50 p-3 rounded border">
                       <label className="text-sm font-semibold flex-1">Vouchers / Cobro con Tarjeta</label>
                       <Input 
                         type="number" 
                         placeholder="0.00"
                         value={liveCardSales}
                         onChange={(e) => setLiveCardSales(e.target.value)}
                         className="w-32 text-right bg-background"
                       />
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {DENOMINATIONS.map((denom) => {
                        const qty = liveCounts[denom.value.toString()] || '';
                        return (
                          <div key={denom.value} className="flex items-center gap-2 border p-2 rounded bg-muted/20">
                            <span className="text-xs font-semibold w-12 text-muted-foreground">{denom.label}</span>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              className="h-7 text-center flex-1 px-1"
                              value={qty}
                              onChange={(e) => handleLiveCountChange(denom.value.toString(), e.target.value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                 </div>

                 <div className={\`xl:w-64 p-5 rounded-lg border flex flex-col justify-center items-center shadow-sm transition-colors \${Math.abs(liveDiscrepancy) > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-green-500/10 border-green-500/30'}\`}>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1 text-center">Efectivo Físico Contado</p>
                    <p className="text-3xl font-black mb-4">{(countedCash).toLocaleString('es-MX', {style:'currency', currency:'MXN'})}</p>
                    
                    <div className="border-t border-foreground/10 pt-4 text-center w-full">
                       <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Descuadre Actual</p>
                       <p className={\`text-xl font-bold \${liveDiscrepancy === 0 ? 'text-green-600' : 'text-destructive'}\`}>
                         {liveDiscrepancy === 0 ? 'CUADRADO' : \`\${liveDiscrepancy > 0 ? '+' : ''}\${(liveDiscrepancy).toLocaleString('es-MX', {style:'currency', currency:'MXN'})}\`}
                       </p>
                    </div>
                 </div>

               </div>
            </div>
`;

pageTxt = pageTxt.replace('<div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col">', blockUI + '\n            <div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col">');

fs.writeFileSync('src/app/(dashboard)/caja/page.tsx', pageTxt);
console.log("SUCCESS!");
