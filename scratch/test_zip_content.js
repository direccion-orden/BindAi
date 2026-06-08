const fs = require('fs');
const path = require('path');

const agentDir = path.join(process.cwd(), "hardware-agent");
const filesToInclude = ["index.js", "package.json", "package-lock.json", ".env"];

console.log("process.cwd():", process.cwd());
console.log("agentDir     :", agentDir);

filesToInclude.forEach(fileName => {
  const filePath = path.join(agentDir, fileName);
  const exists = fs.existsSync(filePath);
  console.log(`File: ${fileName} | Exists: ${exists} | Path: ${filePath}`);
});

if (fs.existsSync(agentDir)) {
  console.log("\nFiles actually present in hardware-agent dir:");
  console.log(fs.readdirSync(agentDir));
} else {
  console.log("\nhardware-agent directory does not exist!");
}
