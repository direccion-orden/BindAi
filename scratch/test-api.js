const http = require('http');
const https = require('https');

const IP = '192.168.68.54';
const PORT = 44333;
const AUTH = Buffer.from('ApiUserOne:ApiPassword1').toString('base64');

async function makeRequest(protocol, module) {
  return new Promise((resolve) => {
    const options = {
      hostname: IP,
      port: PORT,
      path: '/',
      method: 'GET',
      headers: {
        'Authorization': `Basic ${AUTH}`
      },
      rejectUnauthorized: false
    };

    const req = module.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(`[${protocol}] Status: ${res.statusCode}\nHeaders: ${JSON.stringify(res.headers)}\nBody: ${data.substring(0, 500)}`);
      });
    });

    req.on('error', (e) => resolve(`[${protocol}] Error: ${e.message}`));
    req.setTimeout(2000, () => { req.destroy(); resolve(`[${protocol}] Timeout`); });
    req.end();
  });
}

async function run() {
  console.log(`Probando puerto ${PORT}...`);
  const resHttp = await makeRequest('HTTP', http);
  console.log(resHttp);
  console.log('------------------');
  const resHttps = await makeRequest('HTTPS', https);
  console.log(resHttps);
}

run();
