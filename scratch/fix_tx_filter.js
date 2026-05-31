const fs = require('fs');

let file = fs.readFileSync('src/components/pos/CheckoutModal.tsx', 'utf8');

file = file.replace(
  'const currentTxEvents = txId ? events.filter((e: any) => e.transaction?.transaction_id === txId) : events;',
  'const currentTxEvents = txId ? events.filter((e: any) => e.transaction?.transaction_id === txId || e.transaction?.transaction_id === "") : events;'
);

fs.writeFileSync('src/components/pos/CheckoutModal.tsx', file, 'utf8');
console.log('Fixed currentTxEvents filter');
