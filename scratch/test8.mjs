const API_BASE = "https://api.bind.com.mx/api";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function run() {
    let id = "9bf941a4-f87b-481b-82cb-d5dbf6737ec8";
    let url = `${API_BASE}/Purchases/${id}`;
    let res = await fetch(url, { headers });
    if (!res.ok) {
        console.log("Error Purchases/:id:", res.status, await res.text());
        // Try GetPurchaseOrder
        url = `${API_BASE}/Purchases/GetPurchaseOrder?id=${id}`;
        res = await fetch(url, { headers });
        if (!res.ok) {
            console.log("Error GetPurchaseOrder:", res.status, await res.text());
        } else {
            console.dir(await res.json(), {depth:null});
        }
    } else {
        console.dir(await res.json(), {depth:null});
    }
}
run();
