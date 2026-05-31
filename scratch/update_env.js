const fs = require('fs');

let env = fs.readFileSync('hardware-agent/.env', 'utf8');
env = env.replace('RECYCLER_IP=192.168.68.54', 'RECYCLER_IP=192.168.68.53');

fs.writeFileSync('hardware-agent/.env', env, 'utf8');
console.log('Updated RECYCLER_IP to 192.168.68.53');
