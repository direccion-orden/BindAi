const API_BASE = "https://api.bind.com.mx/api";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function run() {
    let url = `${API_BASE}/AccountingJournals?$filter=year(ApplicationDate) eq 2026 and month(ApplicationDate) eq 4 and day(ApplicationDate) eq 20&$top=1`;
    let res = await fetch(url, { headers });
    let text = await res.text();
    console.log("Filter 1:", res.status, text.substring(0, 100));

    let url2 = `${API_BASE}/AccountingJournals?$filter=ApplicationDate ge datetime'2026-04-20T00:00:00'&$top=1`;
    let res2 = await fetch(url2, { headers });
    let text2 = await res2.text();
    console.log("Filter 2:", res2.status, text2.substring(0, 100));
}
run();
