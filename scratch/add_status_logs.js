const fs = require('fs');

let file = fs.readFileSync('hardware-agent/index.js', 'utf8');

file = file.replace(
  'app.get(\'/api/status\', async (req, res) => {\n    try {\n        const data = await makeRecyclerRequest(\'GET\', \'/status\');\n        res.json(data);\n    }',
  'app.get(\'/api/status\', async (req, res) => {\n    try {\n        const data = await makeRecyclerRequest(\'GET\', \'/status\');\n        console.log("GET /api/status response:", JSON.stringify(data));\n        res.json(data);\n    }'
);

fs.writeFileSync('hardware-agent/index.js', file, 'utf8');
console.log('Added logging for /api/status');
