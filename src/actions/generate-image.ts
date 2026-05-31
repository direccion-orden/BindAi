"use server";

import { GoogleGenAI } from '@google/genai';

export async function generateQuoteImage(promptText: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada.');
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
      throw new Error("No images were generated.");
    }

    const base64Image = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64Image}`;
  } catch (error) {
    console.error("Error generating image with Google Imagen:", error);
    throw new Error("No se pudo generar la imagen con IA.");
  }
}
