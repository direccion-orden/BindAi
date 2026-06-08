const BIND_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const API_BASE = "https://api.bind.com.mx/api";
const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${BIND_API_KEY}`
};

async function run() {
    try {
        console.log("Querying a single product from Bind ERP...");
        const res = await fetch(`${API_BASE}/Products?$top=1`, { headers });
        const data = await res.json();
        const product = data.value?.[0];
        console.log("Product fields from Bind ERP:");
        console.log(JSON.stringify(product, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
