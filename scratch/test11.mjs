const API_BASE = "https://api.bind.com.mx/api";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function run() {
    // try different filters
    const filters = [
        `CreationDate ge datetime'2026-04-01T00:00:00'`,
        `CreationDate ge datetime'2026-03-01T00:00:00'`,
        `DocumentDate ge datetime'2026-04-01T00:00:00'`
    ];
    for(let f of filters) {
        let url = `${API_BASE}/Purchases/GetPurchaseOrders?$filter=${f}&$top=1`;
        let res = await fetch(url, { headers });
        let txt = await res.text();
        console.log("Filter:", f, "->", res.status, txt.length > 200 ? "Valid Array" : txt);
    }
}
run();
