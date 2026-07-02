import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { searchErpClients, getClientDocuments } from "@/app/actions/erp";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    const { message, history, companyId } = await req.json();

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
        console.error("Error reading company geminiApiKey in Tracker API:", e);
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Falta configurar la API KEY de Gemini." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.5-flash",
      tools: [
        {
          functionDeclarations: [
            {
              name: "search_clients",
              description: "Busca clientes en el ERP por nombre o razón social.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  query: { type: SchemaType.STRING, description: "El nombre o término de búsqueda del cliente." }
                },
                required: ["query"]
              }
            },
            {
              name: "get_client_documents",
              description: "Obtiene los documentos pendientes (facturas, remisiones, pedidos) de un cliente específico.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  clientId: { type: SchemaType.STRING, description: "El ID único del cliente en el ERP." }
                },
                required: ["clientId"]
              }
            }
          ]
        }
      ]
    });

    const chat = model.startChat({
      history: history || [],
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const systemPrompt = `
      Eres "Tracker", el asistente inteligente del ERP de Dirección Orden. 
      Tu objetivo es ayudar a los usuarios a consultar información, analizar datos y realizar operaciones de forma rápida.
      Eres profesional, eficiente y directo.
      
      Si el usuario te pide buscar un cliente, usa la herramienta search_clients.
      Si el usuario te pide ver lo que debe un cliente o sus documentos, usa get_client_documents.
      
      Contexto actual:
      - Empresa ID: ${companyId}
      
      Responde siempre en español. Si no puedes realizar una acción, explícalo claramente.
    `;

    // En Gemini 1.5+ (y 2.0), el system instruction se puede pasar al modelo al inicio, 
    // pero para este MVP lo incluiremos en el primer mensaje si la historia está vacía.
    const fullMessage = history && history.length > 0 ? message : `${systemPrompt}\n\nUsuario: ${message}`;

    const result = await chat.sendMessage(fullMessage);
    const response = result.response;
    
    // Manejo de Function Calls
    const calls = response.functionCalls();
    if (calls && calls.length > 0) {
      const toolResponses = [];
      for (const call of calls) {
        let toolData;
        if (call.name === "search_clients") {
          toolData = await searchErpClients((call.args as any).query as string);
        } else if (call.name === "get_client_documents") {
          toolData = await getClientDocuments((call.args as any).clientId as string);
        }
        
        toolResponses.push({
          functionResponse: {
            name: call.name,
            response: { result: toolData }
          }
        });
      }

      // Enviar las respuestas de las herramientas de vuelta al modelo para la respuesta final
      const finalResult = await chat.sendMessage(toolResponses);
      return NextResponse.json({ 
        text: finalResult.response.text(),
        history: await chat.getHistory()
      });
    }

    return NextResponse.json({ 
      text: response.text(),
      history: await chat.getHistory()
    });

  } catch (error: any) {
    console.error("Tracker API error:", error);
    return NextResponse.json({ error: error.message || "Error en el agente Tracker" }, { status: 500 });
  }
}
