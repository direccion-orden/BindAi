process.env.FUNCTIONS_DISCOVERY_TIMEOUT = '120';
require('./clean-next-cache.js');
const { spawnSync } = require('child_process');

const result = spawnSync('npx', ['firebase', 'deploy', '--only', 'hosting:main-site', '--non-interactive'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: '120' }
});

process.exit(result.status || 0);
