const API_BASE = "https://api.bind.com.mx/api";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function run() {
    let urls = [
        `${API_BASE}/PurchaseOrders`,
        `${API_BASE}/Purchases`,
        `${API_BASE}/Orders/Purchases`,
        `${API_BASE}/Providers/Orders`
    ];
    for (let u of urls) {
        let res = await fetch(u, { headers });
        let text = await res.text();
        console.log(u, res.status, text.substring(0, 100));
    }
}
run();
