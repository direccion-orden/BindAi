const BIND_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const API_BASE = "https://api.bind.com.mx/api";
const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${BIND_API_KEY}`
};

async function run() {
    try {
        console.log("Querying Bind ERP API in loops to count total products...");
        let skip = 0;
        const top = 100;
        let hasMore = true;
        let totalCount = 0;

        while (hasMore) {
            const url = `${API_BASE}/Products?$top=${top}&$skip=${skip}`;
            const res = await fetch(url, { headers });
            if (!res.ok) {
                console.error("Bind API error at skip " + skip + ":", await res.text());
                break;
            }
            const data = await res.json();
            const items = data.value || [];
            if (items.length === 0) {
                hasMore = false;
                break;
            }

            totalCount += items.length;
            console.log(`- Fetched ${items.length} items (Total so far: ${totalCount})...`);

            if (items.length < top) {
                hasMore = false;
            } else {
                skip += top;
            }
        }

        console.log("\n=================================");
        console.log(`TOTAL PRODUCTS IN BIND ERP: ${totalCount}`);
        console.log("=================================");

    } catch (e) {
        console.error("Error fetching from Bind ERP:", e);
    }
}
run();
