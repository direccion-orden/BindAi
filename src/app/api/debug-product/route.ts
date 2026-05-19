import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    // Load config
    const envPath = path.resolve('.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envVars: any = {};
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            envVars[key] = val.replace(/^["']|["']$/g, '');
        }
    });

    const FIREBASE_PROJECT_ID = envVars['NEXT_PUBLIC_FIREBASE_PROJECT_ID'];

    if (!getApps().length) {
      // Need private key for admin, but we don't have it in env.local
      // Return the env vars to see what we have
      return NextResponse.json({ error: "Cannot use admin SDK without service account" });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message });
  }
}
