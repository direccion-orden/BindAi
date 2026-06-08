const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
      console.error("Config not found at:", configPath);
      return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log("Config keys:", Object.keys(config));
    
    const tokens = config.tokens || {};
    console.log("Token keys:", Object.keys(tokens));

    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      console.error("No refresh token found in config.");
      return;
    }

    console.log("Found refresh token, requesting fresh access token...");

    // Exchange refresh token for access token
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', // Firebase CLI client ID
        client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi', // Firebase CLI client secret
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!res.ok) {
      console.error("Failed to refresh token:", await res.text());
      return;
    }

    const data = await res.json();
    console.log("Successfully retrieved fresh access token!");
    console.log("Access Token:", data.access_token.slice(0, 15) + "...");
    
    // Save to temp file so other scripts can use it
    fs.writeFileSync(path.join(__dirname, 'temp_token.txt'), data.access_token, 'utf8');
    console.log("Token saved to temp_token.txt");
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
