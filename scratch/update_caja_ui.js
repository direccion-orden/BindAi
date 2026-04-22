const fs = require('fs');

let pageTxt = fs.readFileSync('src/app/(dashboard)/caja/page.tsx', 'utf8');

// 1. Add erpNonCashSales state
pageTxt = pageTxt.replace('const [erpCashSales, setErpCashSales] = useState(0);', 'const [erpCashSales, setErpCashSales] = useState(0);\n  const [erpNonCashSales, setErpNonCashSales] = useState(0);');

// 2. Fetch new API payload mapping
pageTxt = pageTxt.replace('setErpCashSales(data.totalCashSales || 0);', 'setErpCashSales(data.totalCashSales || 0);\n         setErpNonCashSales(data.totalNonCashSales || 0);');

// 3. Remove liveCardSales
pageTxt = pageTxt.replace('const [liveCardSales, setLiveCardSales] = useState("");', '');
pageTxt = pageTxt.replace('setLiveCardSales(activeSession.liveAudit.cardSales || "");', '');
pageTxt = pageTxt.replace('cardSales: liveCardSales,', '');
pageTxt = pageTxt.replace('liveCounts, liveCardSales, activeSession?.id', 'liveCounts, activeSession?.id');

// 4. Update expected cash calc
const oldCalc = `const liveCardVouchers = parseFloat(liveCardSales) || 0;
  const estimatedCashSales = Math.max(0, erpCashSales - liveCardVouchers);

  const expectedCash = totalFondo + totalIngresos + estimatedCashSales - totalRetiros;`;
const newCalc = `const expectedCash = totalFondo + totalIngresos + erpCashSales - totalRetiros;`;
pageTxt = pageTxt.replace(oldCalc, newCalc);

// 5. Update 4-cards UI to 5-cards UI
const oldCardBlock = `<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               <div className="bg-card border rounded-lg p-5 shadow-sm">
                  <p className="text-sm text-muted-foreground whitespace-nowrap">Entradas Manuales</p>
                  <p className="text-2xl font-bold text-foreground">
                   + {totalIngresos.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-card border rounded-lg p-5 shadow-sm relative">
                  <p className="text-sm text-muted-foreground flex justify-between whitespace-nowrap" title="El total reportado de ERP menos la resta de los vouchers manuales que ingreses.">Efectivo Mínimo x Ventas {isFetchingErp && <Loader2 className="w-4 h-4 animate-spin text-primary"/>}</p>
                  <p className="text-2xl font-bold text-foreground">
                   + {estimatedCashSales.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-card border rounded-lg p-5 shadow-sm">
                  <p className="text-sm text-muted-foreground whitespace-nowrap">Salidas / Retiros</p>
                  <p className="text-2xl font-bold text-destructive">
                   - {totalRetiros.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-primary/5 border border-primary/20 rounded-lg p-5 shadow-sm">
                  <p className="text-sm text-primary font-semibold whitespace-nowrap">Esperado en Caja</p>
                  <p className="text-2xl font-bold text-primary">
                   = {expectedCash.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
            </div>`;

const newCardBlock = `<div className="grid grid-cols-1 md:grid-cols-5 gap-4">
               <div className="bg-card border rounded-lg p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground whitespace-nowrap uppercase tracking-wider">Entradas Manuales</p>
                  <p className="text-xl font-bold text-foreground mt-1">
                   + {totalIngresos.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-card border rounded-lg p-4 shadow-sm relative">
                  <p className="text-xs text-muted-foreground flex justify-between whitespace-nowrap uppercase tracking-wider" title="Lo que ingresó a cuentas de caja en ERP">Cobrado Efectivo {isFetchingErp && <Loader2 className="w-3 h-3 animate-spin text-primary"/>}</p>
                  <p className="text-xl font-bold text-foreground mt-1">
                   + {erpCashSales.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-muted/50 border rounded-lg p-4 shadow-sm relative opacity-80">
                  <p className="text-xs text-muted-foreground flex justify-between whitespace-nowrap uppercase tracking-wider" title="Solo lectura. Ingresos digitales">Cobros Digitales {isFetchingErp && <Loader2 className="w-3 h-3 animate-spin"/>}</p>
                  <p className="text-xl font-bold text-muted-foreground mt-1">
                   {erpNonCashSales.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-card border rounded-lg p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground whitespace-nowrap uppercase tracking-wider">Retiros</p>
                  <p className="text-xl font-bold text-destructive mt-1">
                   - {totalRetiros.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 shadow-sm">
                  <p className="text-xs text-primary font-bold whitespace-nowrap uppercase tracking-wider">Esperado Efectivo</p>
                  <p className="text-xl font-black text-primary mt-1">
                   = {expectedCash.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
            </div>`;
pageTxt = pageTxt.replace(oldCardBlock, newCardBlock);


// 6. Delete vouchers input from HTML block
const oldVoucherInput = `<div className="flex items-center gap-4 bg-muted/50 p-3 rounded border">
                       <label className="text-sm font-semibold flex-1">Vouchers / Cobro con Tarjeta</label>
                       <Input 
                         type="number" 
                         placeholder="0.00"
                         value={liveCardSales}
                         onChange={(e) => setLiveCardSales(e.target.value)}
                         className="w-32 text-right bg-background"
                       />
                    </div>`;

pageTxt = pageTxt.replace(oldVoucherInput, '');


// IMPORTANT: Re-format `liveCardSales` state handling exactly
// Because we stripped out `setLiveCardSales` inside the useEffect logic previously let's make sure there's no syntactical errors left
fs.writeFileSync('src/app/(dashboard)/caja/page.tsx', pageTxt);
console.log("page.tsx updated");
