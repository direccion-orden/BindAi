const API_BASE = "https://api.bind.com.mx/api";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function run() {
    let url = `${API_BASE}/AccountingJournals?$filter=Type eq 1 and ApplicationDate ge datetime'2026-04-01T00:00:00' and ApplicationDate le datetime'2026-04-30T23:59:59'&$top=5`;
    let res = await fetch(url, { headers });
    if (!res.ok) {
        console.log("Error:", await res.text());
        return;
    }
    let jData = await res.json();
    console.log("Gastos returned via ApplicationDate:", jData.value.length);
    if (jData.value.length > 0) {
        console.log("First ApplicationDate:", jData.value[0].ApplicationDate);
        console.log("First CreationDate:", jData.value[0].CreationDate);
    }
}
run();
