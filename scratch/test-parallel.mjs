const API_BASE = "https://api.bind.com.mx/api";
const headers = { "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY` };

async function run() {
    const resCost = await fetch(`${API_BASE}/Expenses?$top=5`, { headers });
    const dataCost = await resCost.json();
    console.log("Expenses count:", dataCost.value ? dataCost.value.length : 0);
    if(dataCost.value && dataCost.value.length > 0) {
       console.log("Expense #1", dataCost.value[0]);
    }
}
run();
