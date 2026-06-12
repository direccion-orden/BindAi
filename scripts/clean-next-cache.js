const fs = require('fs');
const path = require('path');

const dirsToClean = [
  path.join(__dirname, '..', '.next', 'dev'),
  path.join(__dirname, '..', '.next', 'cache'),
  path.join(__dirname, '..', '.firebase')
];

dirsToClean.forEach(dir => {
  if (fs.existsSync(dir)) {
    try {
      console.log(`Cleaning directory: ${dir}`);
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`Successfully cleaned: ${dir}`);
    } catch (err) {
      console.error(`Error cleaning directory ${dir}:`, err);
    }
  } else {
    console.log(`Directory does not exist, skipping: ${dir}`);
  }
});
