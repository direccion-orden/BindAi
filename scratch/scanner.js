const http = require('http');

const IP = '192.168.68.54';
const PORTS = [80, 8080, 443, 3000, 5000, 8000, 8081, 8888, 9000];

async function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://${IP}:${port}/`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ port, status: res.statusCode, data: data.substring(0, 200) });
      });
    });
    
    req.on('error', (e) => {
      resolve({ port, error: e.code });
    });
    
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ port, error: 'timeout' });
    });
  });
}

async function run() {
  console.log(`Buscando puertos abiertos en ${IP}...`);
  for (const port of PORTS) {
    const result = await checkPort(port);
    if (result.status) {
       console.log(`✅ PUERTO ABIERTO: ${port} (Status: ${result.status})`);
       console.log(`Respuesta parcial: ${result.data}`);
    } else {
       console.log(`❌ Puerto ${port}: ${result.error}`);
    }
  }
}

run();
