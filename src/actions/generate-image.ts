"use server";

import { adminDb } from "@/lib/firebase/admin";
import { GoogleGenAI } from '@google/genai';

export async function generateQuoteImage(promptText: string, companyId?: string): Promise<string> {
  let apiKey = process.env.GEMINI_API_KEY;

  if (companyId && adminDb) {
    try {
      const companyDoc = await adminDb.collection("companies").doc(companyId).get();
      if (companyDoc.exists) {
        const companyData = companyDoc.data();
        if (companyData?.geminiApiKey) {
          apiKey = companyData.geminiApiKey;
        }
      }
    } catch (e) {
      console.error("Error reading company geminiApiKey from Firestore:", e);
    }
  }

  if (!apiKey) {
    return "ERROR: La clave de API de Gemini (GEMINI_API_KEY) no está configurada en las variables de entorno ni en el perfil de la empresa.";
  }

  const ai = new GoogleGenAI({ apiKey });

  const fullPrompt = `A high-quality, photorealistic interior photograph of a modern, elegant ${promptText} in a luxury residential home.
The space is perfectly organized, clean, and visually balanced, featuring premium custom storage solutions and refined finishes with wood in modern tones, marble, and textured stone.
Neutral color palette with whites, soft beiges, and light grays, combined with subtle luxury materials.
Bright natural daylight fills the space, creating soft shadows and a calm, harmonious atmosphere.
The image represents an aspirational, refined lifestyle associated with high-end homes.
No people, no text, no signage, no logos, no branding.
Wide horizontal composition suitable for a banner in a professional PDF document.
Architectural interior photography style, realistic proportions, natural perspective.`;

  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: fullPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9'
      }
    });

    if (!response.generatedImages || response.generatedImages.length === 0 || !response.generatedImages[0]?.image?.imageBytes) {
      return "ERROR: No se generaron imágenes.";
    }

    const base64Image = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64Image}`;
  } catch (error: any) {
    console.error("Error generating image with Google Imagen:", error);
    const msg = error?.message || String(error);
    if (msg.includes("paid plans") || msg.includes("upgrade")) {
      return "ERROR: Imagen no está disponible en planes gratuitos de Gemini. Por favor actualiza tu cuenta de Gemini a un plan de pago.";
    }
    return `ERROR: ${msg}`;
  }
}
