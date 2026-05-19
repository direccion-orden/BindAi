const net = require('net');

const IP = '192.168.68.54';
const COMMON_PORTS = [21, 22, 23, 80, 443, 8080, 8443, 1883, 8883, 3306, 5432, 27017, 6379, 11211, 8000, 8001, 8081, 8888, 9000, 5000, 3000];

async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(2000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve({ port, status: 'open' });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, status: 'timeout' });
    });
    
    socket.on('error', (e) => {
      resolve({ port, status: 'closed', error: e.code });
    });
    
    socket.connect(port, IP);
  });
}

async function run() {
  console.log(`Buscando puertos TCP abiertos en ${IP}...`);
  const openPorts = [];
  
  for (const port of COMMON_PORTS) {
    process.stdout.write(`Escaneando puerto ${port}... `);
    const result = await checkPort(port);
    if (result.status === 'open') {
       console.log('✅ ABIERTO');
       openPorts.push(port);
    } else {
       console.log(`❌ Cerrado/Timeout`);
    }
  }
  
  console.log('\n--- RESULTADOS FINALES ---');
  if (openPorts.length > 0) {
      console.log('Puertos abiertos:', openPorts.join(', '));
  } else {
      console.log('No se encontraron puertos comunes abiertos.');
  }
}

run();
