const fs = require('fs');
let file = fs.readFileSync('src/components/pos/CheckoutModal.tsx', 'utf8');

file = file.replace(
  '                  if (data.transaction && data.transaction.payinReceived !== undefined) {\n                      setRecyclerInserted(data.transaction.payinReceived / 100);\n                  }',
  '                  if (data.transaction && data.transaction.payinReceived !== undefined) {\n                      setRecyclerInserted(data.transaction.payinReceived / 100);\n                  } else {\n                      const latestEvent = currentTxEvents[currentTxEvents.length - 1];\n                      if (latestEvent && latestEvent.transaction && latestEvent.transaction.cash_in !== undefined) {\n                          setRecyclerInserted(latestEvent.transaction.cash_in / 100);\n                      }\n                  }'
);

fs.writeFileSync('src/components/pos/CheckoutModal.tsx', file, 'utf8');
console.log('Fixed cash_in parsing');
