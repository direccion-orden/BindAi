const net = require('net');
const { exec } = require('child_process');

async function checkHost(ip) {
  // We check ports 80, 443, and 44333. If any port connection finishes (succeeds or gets REFUSED),
  // it means the host is active!
  const ports = [80, 443, 44333];
  
  for (const port of ports) {
    const active = await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(800);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', (err) => {
        socket.destroy();
        // If it's connection refused, the host is active!
        if (err.code === 'ECONNREFUSED') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(port, ip);
    });
    
    if (active) return true;
  }
  return false;
}

async function run() {
  console.log("Scanning all active hosts in 192.168.1.X...");
  const subnet = "192.168.1";
  const activeIPs = [];
  const promises = [];
  
  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}.${i}`;
    promises.push((async () => {
      const active = await checkHost(ip);
      if (active) {
        console.log(`[ACTIVE] ${ip}`);
        activeIPs.push(ip);
      }
    })());
  }
  
  await Promise.all(promises);
  console.log("\nActive IPs found:", activeIPs);
  
  console.log("\nRunning 'arp -a' to display MAC addresses...");
  exec('arp -a', (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(stdout);
  });
}

run();
