const net = require('net');

const IP = '192.168.68.54';

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000); // 1 segundo máximo para responder
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(port);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    
    socket.on('error', () => {
      resolve(null);
    });
    
    socket.connect(port, IP);
  });
}

async function run() {
  console.log(`Buscando en TODOS los puertos de la máquina (${IP})...`);
  const batchSize = 1000;
  let openPortsCount = 0;

  for (let i = 1; i <= 65000; i += batchSize) {
    const promises = [];
    for (let j = 0; j < batchSize; j++) {
      if (i + j <= 65535) {
        promises.push(checkPort(i + j));
      }
    }
    const results = await Promise.all(promises);
    const openPorts = results.filter(p => p !== null);
    
    if (openPorts.length > 0) {
      console.log(`¡Puertos abiertos encontrados!:`, openPorts);
      openPortsCount += openPorts.length;
    }
  }
  console.log(`Escaneo completo. Total de puertos abiertos: ${openPortsCount}`);
}

run();
