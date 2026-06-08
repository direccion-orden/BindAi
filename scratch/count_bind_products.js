const fs = require('fs');

const BIND_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const API_BASE = "https://api.bind.com.mx/api";
const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${BIND_API_KEY}`
};

async function run() {
    try {
        console.log("Querying Bind ERP API for products count...");
        const res = await fetch(`${API_BASE}/Products?$top=1`, { headers });
        if (!res.ok) {
            console.error("Bind API error:", await res.text());
            return;
        }
        const data = await res.json();
        console.log("Bind Products Response keys:", Object.keys(data));
        console.log("Bind Products Count / Value length:", data.count, data.total, data.value?.length);
        console.log("Full data structure (excluding value):", {
            ...data,
            value: undefined
        });

        // Let's do a request with no top or pagination to see if count is provided, or loop to count
        // Wait, typically OData responses include a 'count' field representing the grand total.
    } catch (e) {
        console.error(e);
    }
}
run();
