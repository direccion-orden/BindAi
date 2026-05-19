const http = require('http');

const IP = '192.168.68.54';
const PORT = 44333;
const AUTH = Buffer.from('ApiUserOne:ApiPassword1').toString('base64');

const ENDPOINTS = [
  '/api', '/api/v1', '/api-docs', '/swagger-ui.html', '/openapi.json', '/swagger.json',
  '/status', '/api/status', '/api/device/status', '/api/machine/status',
  '/payment', '/api/payment', '/api/pay', '/api/transaction',
  '/dispense', '/api/dispense', '/api/cash/dispense',
  '/print', '/api/print', '/api/printer',
  '/barcode', '/api/barcode', '/api/scanner'
];

async function checkEndpoint(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: IP,
      port: PORT,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ path, status: res.statusCode, data: data.substring(0, 100) });
      });
    });

    req.on('error', (e) => resolve({ path, status: 'error', error: e.message }));
    req.setTimeout(2000, () => { req.destroy(); resolve({ path, status: 'timeout' }); });
    req.end();
  });
}

async function run() {
  console.log(`Fuzzing endpoints en http://${IP}:${PORT}...`);
  for (const path of ENDPOINTS) {
    const res = await checkEndpoint(path);
    if (res.status !== 404 && res.status !== 'error' && res.status !== 'timeout') {
      console.log(`✅ [${res.status}] ${path} -> ${res.data.replace(/\n/g, '')}`);
    } else {
      console.log(`❌ [${res.status}] ${path}`);
    }
  }
}

run();
