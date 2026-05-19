const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf8');
const keyLine = env.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
if (!keyLine) {
  console.log('No key found');
  process.exit(1);
}
const key = keyLine.split('=')[1].replace(/"/g, '').trim();

https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.models) {
        console.log("AVAILABLE MODELS:");
        console.log(parsed.models.map(m => m.name).join('\n'));
      } else {
        console.log("Response:", data);
      }
    } catch (e) {
      console.log("Error parsing:", data);
    }
  });
}).on('error', err => {
  console.error("HTTP Error:", err.message);
});
