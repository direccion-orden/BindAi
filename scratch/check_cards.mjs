import "dotenv/config";
const API_BASE = 'https://api.bind.com.mx/api';
async function run() {
    const res = await fetch(`${API_BASE}/AccountingJournals?$filter=Type eq 'Pago de Venta'&$top=50&$orderby=ApplicationDate desc`, {
        headers: { 'Authorization': 'Bearer ' + process.env.BIND_ERP_API_KEY }
    });
    const data = await res.json();
    const categories = {};
    for (const j of data.value || []) {
        for (const item of j.Items || []) {
            if (item.Charge > 0) {
                categories[item.AccountName] = (categories[item.AccountName] || 0) + item.Charge;
            }
        }
    }
    console.log('--- Resumen de Cuentas Receptores de Ventas Recientes ---');
    console.table(categories);
}
run().catch(console.error);
