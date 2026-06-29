import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, imageType, clients, bankAccounts, companyId } = await req.json();

    if (!imageBase64 || !imageType) {
      return NextResponse.json({ error: "Falta la imagen o el tipo de imagen" }, { status: 400 });
    }

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
      return NextResponse.json(
        { error: "Falta configurar la API KEY de Gemini (GEMINI_API_KEY) en las variables de entorno o en el perfil de la empresa." },
        { status: 500 }
      );
    }

    // Clean imageBase64 (remove prefix if present)
    const cleanBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const prompt = `
Analiza la imagen de este comprobante de pago o transferencia y extrae la siguiente información estructurada como un objeto JSON.

Te proporciono una lista de clientes activos en el ERP en formato JSON. Intenta buscar la mejor coincidencia para el remitente o emisor del pago (quien envía el dinero) con uno de estos clientes.

Te proporciono también una lista de nuestras cuentas bancarias receptoras en formato JSON. Analiza el comprobante para identificar cuál de estas cuentas es el *banco destino* (el banco receptor que recibe el dinero). Ten mucho cuidado de no confundirlo con el banco emisor/origen (el banco desde donde se envía el dinero, el cual no es relevante). Busca coincidencias semánticas (por ejemplo, si el banco receptor en el comprobante es "BBVA Bancomer" o "BBVA" y en nuestra lista de cuentas tenemos una llamada "BBVA Corporativa", esa es la cuenta coincidente).

Lista de Clientes:
${JSON.stringify(clients || [], null, 2)}

Lista de Nuestras Cuentas Bancarias Receptoras:
${JSON.stringify(bankAccounts || [], null, 2)}

Devuelve estrictamente un objeto JSON con los siguientes campos (y NADA más de texto, solo el JSON válido):
{
  "amount": un número flotante representando el monto total del comprobante, o null si no se detecta.
  "date": la fecha del pago en formato "YYYY-MM-DD", o null si no se detecta.
  "reference": una cadena con la referencia, clave de rastreo, número de operación, número de autorización o folio del comprobante, o null si no se detecta.
  "paymentTermId": una de las siguientes opciones según el tipo de comprobante:
    - "3" (si es una transferencia bancaria, SPEI, traspaso, etc.)
    - "4" (si es un voucher o ticket de terminal de tarjeta de crédito/débito)
    - "1" (si es un recibo de efectivo, depósito en efectivo en Oxxo/ventanilla, etc.)
    - o null si no se puede determinar.
  "matchingClient": {
    "id": el ID del cliente de la lista proporcionada que coincida mejor con el ordenante/emisor del pago, o null si no hay coincidencia clara.
    "name": el nombre del cliente de la lista que coincide, o null si no hay coincidencia clara.
  },
  "matchingBankAccount": {
    "id": el ID de la cuenta bancaria de la lista proporcionada que coincida con el banco receptor/destino en el comprobante, o null si no hay coincidencia.
    "name": el nombre de la cuenta bancaria de la lista que coincide, o null si no hay coincidencia.
  }
}

Instrucciones de coincidencia de cliente:
- Compara los nombres que aparecen en la imagen como "Emisor", "Remitente", "Ordenante", "Desde la cuenta de", "Nombre del ordenante", "PAGADO POR" o el nombre que aparece en el recibo.
- Busca coincidencias en la lista de clientes proporcionada, considerando que los nombres pueden no ser idénticos (por ejemplo, "Juan Pérez S.A." puede coincidir con "Juan Pérez").
- Si el RFC del cliente en la lista coincide con el RFC de la cuenta emisora en el comprobante, esa es la coincidencia ideal.
- Si no encuentras ninguna coincidencia que tenga sentido con un nivel de confianza razonable, pon matchingClient como null.
`;

    const imagePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: imageType
      }
    };

    const result = await model.generateContent([
      prompt,
      imagePart
    ]);

    const text = result.response.text();
    const data = JSON.parse(text);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("AI Receipt Analysis error:", error);
    return NextResponse.json({ error: error.message || "Failed to analyze receipt" }, { status: 500 });
  }
}
