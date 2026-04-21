import 'dotenv/config';

const API_BASE = "https://api.bind.com.mx/api";
const apiKey = process.env.BIND_ERP_API_KEY;

async function fetchFromBind(url) {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };
  console.log("Fetching: ", url);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error("Fetch Error:", res.statusText);
    const text = await res.text();
    console.error("Error body:", text);
    throw new Error(`Bind Fetch Error: ${res.statusText}`);
  }
  const json = await res.json();
  console.log("Success. Total items:", json.value?.length);
}

async function test() {
  const startDate = new Date(2024, 3, 1).toISOString();
  const endDate = new Date(2024, 4, 0, 23, 59, 59, 999).toISOString();
  
  const oDataStart = startDate.substring(0, 19);
  const oDataEnd = endDate.substring(0, 19);

  try {
    await fetchFromBind(`${API_BASE}/Invoices?$filter=Date ge datetime'${oDataStart}' and Date le datetime'${oDataEnd}'`);
  } catch (e) {
    console.log("Invoices failed");
  }
  
  try {
    await fetchFromBind(`${API_BASE}/Expenses?$filter=Date ge datetime'${oDataStart}' and Date le datetime'${oDataEnd}'`);
  } catch (e) {
    console.log("Expenses failed");
  }
}

test();
