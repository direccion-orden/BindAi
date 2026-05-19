const http = require('http');

const IP = '192.168.68.54';
const PORT = 44333;
const PATH = '/status';

function testAuth(headers, query = '') {
  return new Promise((resolve) => {
    const options = {
      hostname: IP,
      port: PORT,
      path: PATH + query,
      method: 'GET',
      headers: headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data: data.substring(0, 100).replace(/\n/g, '') });
      });
    });

    req.on('error', () => resolve({ status: 'error' }));
    req.end();
  });
}

async function run() {
  console.log('Testing exact headers...');
  console.log('1.', await testAuth({ 'ApiUsername': 'ApiUserOne', 'ApiPassword': 'ApiPassword1' }));
  console.log('2.', await testAuth({ 'apiusername': 'ApiUserOne', 'apipassword': 'ApiPassword1' }));
  console.log('3.', await testAuth({}, '?ApiUsername=ApiUserOne&ApiPassword=ApiPassword1'));
  
  // Test POST to /login
  console.log('Testing POST to /login...');
  await new Promise((resolve) => {
    const req = http.request({ hostname: IP, port: PORT, path: '/login', method: 'POST', headers: {'Content-Type': 'application/json'} }, (res) => {
      let data = ''; res.on('data', chunk => data += chunk); res.on('end', () => { console.log('POST /login:', res.statusCode, data); resolve(); });
    });
    req.write(JSON.stringify({ username: 'ApiUserOne', password: 'ApiPassword1' }));
    req.end();
  });
}

run();
