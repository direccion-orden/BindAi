const fs = require('fs');

async function run() {
    let res = await fetch("https://developers.bind.com.mx/api-details");
    let text = await res.text();
    // Use regex to extract all endpoint paths
    // Usually swagger definitions are in a JSON or loaded dynamically.
    // Let's just output the whole HTML to read it carefully.
    fs.writeFileSync('scratch/bind_api_docs.html', text);
    console.log("HTML length:", text.length);
}
run();
