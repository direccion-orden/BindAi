/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['firebase-admin'],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'bind-ai-6f1fc.web.app',
        'bind-ai-6f1fc.firebaseapp.com',
        'ordendelascosas.com',
        '*.ordendelascosas.com',
        '*.web.app',
        '*.firebaseapp.com',
        '*.run.app',
        'localhost:3000'
      ]
    }
  }
};

module.exports = nextConfig;

