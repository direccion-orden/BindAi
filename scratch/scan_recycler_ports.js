const net = require('net');

const ip = '192.168.1.69';
const ports = [80, 443, 23, 8080, 44333, 3000, 3001, 8000, 8888];

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    
    socket.on('connect', () => {
      console.log(`Port ${port} is OPEN`);
      socket.destroy();
      resolve(port);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(null);
    });
    
    socket.connect(port, ip);
  });
}

async function run() {
  console.log(`Scanning ports on device ${ip}...`);
  for (const port of ports) {
    await checkPort(port);
  }
  console.log("Scan complete.");
}

run();
