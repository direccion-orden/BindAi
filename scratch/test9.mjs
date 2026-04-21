const API_BASE = "https://api.bind.com.mx/api";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function run() {
    let id = '8fefec38-eb24-4795-af55-00a26499b164';
    let url = `${API_BASE}/Inventory/GetMerchandiseReception?id=${id}`;
    let res = await fetch(url, { headers });
    if (res.ok) {
        console.dir(await res.json(), {depth: null});
    } else {
        url = `${API_BASE}/Inventory/${id}`;
        res = await fetch(url, { headers });
        if (res.ok) console.dir(await res.json(), {depth: null});
        else console.log(res.status);
    }
}
run();
