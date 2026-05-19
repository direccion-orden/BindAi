const fs = require('fs');
const nodemailer = require('nodemailer');

async function testMail() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            env[parts[0].trim()] = parts.slice(1).join('=').trim();
        }
    });

    console.log("Host:", env.SMTP_HOST);
    console.log("Port:", env.SMTP_PORT);
    console.log("User:", env.SMTP_USER);
    console.log("Pass length:", env.SMTP_PASS ? env.SMTP_PASS.length : 0);

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(env.SMTP_PORT || '465'),
      secure: true,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    try {
        await transporter.verify();
        console.log("Connection Verified successfully!");
    } catch(e) {
        console.error("Verification failed:", e);
    }
}

testMail();
