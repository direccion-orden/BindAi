const API_BASE = "https://api.bind.com.mx/api";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function run() {
    const basenames = [
        "AccountsPayable", "AccountsPayables", "AccountsPayable/GetAccountPayable", "AccountsPayable/GetAccountsPayable",
        "Providers/GetAccountsPayable", "Providers/AccountPayable", "Providers/GetAccountPayables",
        "Finance/AccountsPayable", "Accounting/AccountsPayable",
        "Purchasing/GetPurchases", "Purchasing/Purchases", 
        "Purchases/GetBills", "Purchases/GetInvoices"
    ];

    for(let b of basenames) {
        let url = `${API_BASE}/${b}?$top=1`;
        let res = await fetch(url, { headers });
        console.log(`[${res.status}] ${url}`);
        if (res.ok) console.log((await res.text()).substring(0, 50));
    }
}
run();
