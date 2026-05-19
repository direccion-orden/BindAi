import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No API key");
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-001',
      prompt: 'A beautiful house interior',
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9'
      }
    });
    console.log("Success! Image size:", response.generatedImages?.[0]?.image?.imageBytes?.length);
  } catch (err: any) {
    console.error("Error:", err.message || err);
    console.error(err);
  }
}

test();
