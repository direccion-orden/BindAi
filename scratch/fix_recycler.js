const axios = require("axios");

async function fix() {
  try {
    // Try sending CancelPayment
    let res = await axios.post("http://localhost:3001/api/session", { request: "CancelPayment" });
    console.log("CancelPayment:", res.data);
  } catch (e) {
    console.log("CancelPayment Error:", e.response?.data || e.message);
  }
}
fix();
