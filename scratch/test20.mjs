const API_BASE = "https://api.bind.com.mx/api";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const headers = { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };

async function run() {
    let url = `${API_BASE}/Purchases/GetBills`;
    
    // Try POST just in case?
    let resPost = await fetch(url, { headers, method: "POST" });
    console.log("POST:", resPost.status, await resPost.text().then(t=>t.substring(0,100)));

    // Try GET with $top
    let resTop = await fetch(`${url}?$top=1`, { headers });
    console.log("GET $top:", resTop.status, await resTop.text().then(t=>t.substring(0,100)));
    
    // Try GET with $filter
    let resFilter = await fetch(`${url}?$filter=Status eq 1`, { headers });
    console.log("GET $filter:", resFilter.status, await resFilter.text().then(t=>t.substring(0,100)));
}
run();
