const fs = require("fs");
process.env.FUNCTIONS_DISCOVERY_TIMEOUT = "120";
require("./clean-next-cache.js");
const { spawnSync } = require("child_process");

async function main() {
  const env = { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: "120" };

  if (!env.FIREBASE_TOKEN && fs.existsSync(".env.local")) {
    try {
      const envText = fs.readFileSync(".env.local", "utf8");
      for (const line of envText.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
        if (m) {
          let val = m[2] || "";
          if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[m[1]]) process.env[m[1]] = val;
        }
      }

      const admin = require("firebase-admin");
      if (!admin.apps.length && process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          })
        });
      }

      if (admin.apps.length) {
        const tokenObj = await admin.app().options.credential.getAccessToken();
        if (tokenObj && tokenObj.access_token) {
          env.FIREBASE_TOKEN = tokenObj.access_token;
        }
      }
    } catch (e) {
      console.warn("Could not auto-generate FIREBASE_TOKEN from service account:", e.message);
    }
  }

  const result = spawnSync("npx", ["firebase", "deploy", "--only", "hosting:main-site", "--non-interactive"], {
    stdio: "inherit",
    shell: true,
    env
  });

  process.exit(result.status || 0);
}

main();
