const fs = require('fs');

let file = fs.readFileSync('hardware-agent/index.js', 'utf8');
file = file.replace(
  'app.post(\'/api/session\', async (req, res) => {',
  'app.post(\'/api/session\', async (req, res) => {\n    console.log("POST /api/session body:", JSON.stringify(req.body));'
);
file = file.replace(
  'const data = await makeRecyclerRequest(\'POST\', \'/session\', req.body);\n        res.json(data);',
  'const data = await makeRecyclerRequest(\'POST\', \'/session\', req.body);\n        console.log("Response from recycler:", JSON.stringify(data));\n        res.json(data);'
);

fs.writeFileSync('hardware-agent/index.js', file, 'utf8');
console.log('Added logging to hardware-agent');
