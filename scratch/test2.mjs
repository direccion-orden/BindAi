const API_BASE = "https://api.bind.com.mx/api";
const apiKey = process.env.BIND_ERP_API_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function run() {
    // Check CostCenters
    let res = await fetch(`${API_BASE}/CostCenters?$top=100`, { headers });
    let data = await res.json();
    console.log("CostCenters:", data.value ? data.value.length : data);

    // Check Expenses
    // Let's filter expenses for current month
    // In order of OData
    res = await fetch(`${API_BASE}/Expenses?$top=5`, { headers });
    data = await res.json();
    console.log("Expenses Top 5:", data.value ? data.value.length : data);
    if(data.value && data.value.length > 0) {
        console.log("Expense Sample:", JSON.stringify(data.value[0], null, 2));
    }

    // Try AccountingJournals just in case they meant journals
    res = await fetch(`${API_BASE}/AccountingJournals?$filter=Type eq 'Gasto'&$top=5`, { headers });
    if(res.ok) {
       let jData = await res.json();
       console.log("Journals Top 5 (Type Gasto):", jData.value ? jData.value.length : jData);
       if(jData.value && jData.value.length > 0) {
          console.log("Journal Sample:", JSON.stringify(jData.value[0], null, 2));
       }
    } else {
       console.log("Journals failed", res.status, await res.text());
    }
}
run();
