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
  console.log('Testing auth modes on /status...');

  // Test 1: Basic Auth
  const basic = Buffer.from('ApiUserOne:ApiPassword1').toString('base64');
  console.log('1. Basic Auth:', await testAuth({ 'Authorization': `Basic ${basic}` }));

  // Test 2: Query params
  console.log('2. Query params:', await testAuth({}, '?user=ApiUserOne&pass=ApiPassword1'));
  console.log('3. Query params 2:', await testAuth({}, '?username=ApiUserOne&password=ApiPassword1'));

  // Test 3: Custom Headers
  console.log('4. Custom Header X-Api-User/Key:', await testAuth({ 'X-Api-User': 'ApiUserOne', 'X-Api-Key': 'ApiPassword1' }));
  console.log('5. Custom Header ApiUser/ApiPassword:', await testAuth({ 'ApiUser': 'ApiUserOne', 'ApiPassword': 'ApiPassword1' }));
  console.log('6. Custom Header Username/Password:', await testAuth({ 'Username': 'ApiUserOne', 'Password': 'ApiPassword1' }));
}

run();
