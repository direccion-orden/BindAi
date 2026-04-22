const fs = require('fs');

let code = fs.readFileSync('src/components/caja/CerrarTurnoModal.tsx', 'utf8');

// 1. Add props
code = code.replace('transactions: any[];', 'transactions: any[];\n  erpCashSales?: number;\n  erpNonCashSales?: number;');
code = code.replace('transactions,\n  onClosed', 'transactions,\n  erpCashSales = 0,\n  erpNonCashSales = 0,\n  onClosed');

// 2. Erase UI logic
code = code.replace('  const [cardSales, setCardSales] = useState("");', '');
code = code.replace('const cardVouchers = parseFloat(cardSales) || 0;', '');

// 3. Remove native API fetch
const fetchRegex = /\/\/ Bind Sales[\s\S]*?fetchBindSales\(\);\n  \}, \[isOpen, session\]\);/m;
code = code.replace(fetchRegex, '// Bind Sales handled via props now');

// 4. Update expected logic
code = code.replace('const estimatedCashSales = Math.max(0, bindSales - cardVouchers);', 'const estimatedCashSales = erpCashSales;');

// 5. Update Firebase save params
code = code.replace('bindTotalSales: bindSales,', 'bindTotalSales: erpCashSales + erpNonCashSales,');
code = code.replace('cardTotalSales: cardVouchers,', 'cardTotalSales: erpNonCashSales,');

// 6. Update UI blocks replacing the Voucher input
const oldUIRegex = /<div className="bg-muted\/50 p-4 rounded-lg flex flex-col sm:flex-row gap-4 items-center justify-between border">[\s\S]*?<\/div>/m;
const newUI = `<div className="bg-muted/50 p-4 rounded-lg flex flex-col sm:flex-row gap-4 items-center justify-between border">
  <div>
    <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Cobrado en Efectivo (Bind)</p>
    <p className="text-2xl font-bold text-foreground">{fmt(erpCashSales)}</p>
  </div>
  <div className="text-right">
    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Cobros Digitales / Bancos</p>
    <p className="text-xl font-bold text-muted-foreground">{fmt(erpNonCashSales)}</p>
  </div>
</div>`;
code = code.replace(oldUIRegex, newUI);

fs.writeFileSync('src/components/caja/CerrarTurnoModal.tsx', code);
console.log('Update Complete Modal');
