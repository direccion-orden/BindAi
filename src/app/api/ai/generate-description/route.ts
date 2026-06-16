import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    const { title, description, productType, vendor, companyId } = await req.json();

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
        console.error("Error reading company geminiApiKey in API route:", e);
      }
    }

    if (!apiKey) {
       return NextResponse.json({ error: "Falta configurar la API KEY de Gemini (GEMINI_API_KEY) en las variables de entorno o en el perfil de la empresa." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Eres un experto copywriter para e-commerce. Tu tarea es generar o mejorar la descripción de un producto.
      A continuación te proporciono el contexto:
      Título del producto: "${title}"
      Tipo: "${productType || 'No especificado'}"
      Proveedor/Marca: "${vendor || 'No especificado'}"
      Descripción actual/Borrador: "${description || 'No hay descripción, créala desde cero'}"

      Instrucciones:
      - Crea una descripción corta, persuasiva y orientada a la venta.
      - 1. Inicia con 1 o 2 líneas de introducción cautivadora.
      - 2. Agrega una lista de viñetas (bullets) con los beneficios o características principales.
      - 3. Termina con un breve llamado a la acción (Call to Action).
      - No agregues saludos ni despedidas, devuelve directamente el texto de la descripción.
      - Usa texto plano con saltos de línea (puedes usar guiones o emojis para los bullets).
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ description: text });
  } catch (error: any) {
    console.error("AI Generation error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate description" }, { status: 500 });
  }
}
