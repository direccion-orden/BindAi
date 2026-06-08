const BIND_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const API_BASE = "https://api.bind.com.mx/api";
const headers = { "Authorization": `Bearer ${BIND_API_KEY}` };

async function run() {
  const res = await fetch(`${API_BASE}/Products/a045009b-3722-40fb-a3b2-00002d005f59`, { headers });
  const data = await res.json();
  console.log("Prices object:");
  console.log(JSON.stringify(data.Prices, null, 2));
}
run();
