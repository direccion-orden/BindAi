import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { admin, adminDb } from "@/lib/firebase/admin";
import { generateClientStatementPDFAndUpload } from "@/lib/pdf/statement";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const queryCompanyId = searchParams.get("companyId");

  let companyId = queryCompanyId;
  if (!companyId && adminDb) {
    const companiesSnap = await adminDb.collection("companies").limit(1).get();
    if (!companiesSnap.empty) {
      companyId = companiesSnap.docs[0].id;
    }
  }

  let verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "bind_verify_token";

  if (companyId && adminDb) {
    try {
      const companyDoc = await adminDb.collection("companies").doc(companyId).get();
      if (companyDoc.exists) {
        const data = companyDoc.data();
        if (data?.whatsappVerifyToken) {
          verifyToken = data.whatsappVerifyToken;
        }
      }
    } catch (e) {
      console.error("Error reading whatsappVerifyToken in GET webhook:", e);
    }
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("Meta WhatsApp Webhook verified successfully!");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryCompanyId = searchParams.get("companyId");

    // 1. Resolve companyId (fallback to the first company in DB if not provided)
    let companyId = queryCompanyId;
    if (!companyId && adminDb) {
      const companiesSnap = await adminDb.collection("companies").limit(1).get();
      if (!companiesSnap.empty) {
        companyId = companiesSnap.docs[0].id;
      }
    }

    if (!companyId || !adminDb) {
      return NextResponse.json({ error: "Company database not initialized" }, { status: 500 });
    }

    // Load company specific configurations
    let whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    let whatsappDefaultBankAccountId = "";
    let whatsappBotActive = true;

    try {
      const companyDoc = await adminDb.collection("companies").doc(companyId).get();
      if (companyDoc.exists) {
        const data = companyDoc.data();
        if (data?.whatsappAccessToken) {
          whatsappAccessToken = data.whatsappAccessToken;
        }
        if (data?.whatsappDefaultBankAccountId) {
          whatsappDefaultBankAccountId = data.whatsappDefaultBankAccountId;
        }
        if (data?.whatsappBotActive !== undefined) {
          whatsappBotActive = !!data.whatsappBotActive;
        }
      }
    } catch (err) {
      console.error("Error loading company configs in webhook:", err);
    }

    if (!whatsappBotActive) {
      return NextResponse.json({ success: true, message: "Bot is disabled for this company" });
    }

    let isTwilio = false;
    let fromNumber = "";
    let mediaUrl = "";
    let mediaType = "";
    let messageBody = "";
    let phoneId = ""; // Used for Meta Cloud API responses

    const contentType = req.headers.get("content-type") || "";
    let reqJsonBody: any = null;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      isTwilio = true;
      const formData = await req.formData();
      fromNumber = (formData.get("From") as string) || "";
      mediaUrl = (formData.get("MediaUrl0") as string) || "";
      mediaType = (formData.get("MediaContentType0") as string) || "";
      messageBody = (formData.get("Body") as string) || "";
    } else {
      // Parse JSON payload (Meta Cloud API)
      reqJsonBody = await req.json();
      const entry = reqJsonBody.entry?.[0];
      const change = entry?.changes?.[0];
      const val = change?.value;
      const message = val?.messages?.[0];
      phoneId = val?.metadata?.phone_number_id || "";

      if (message) {
        fromNumber = message.from || "";
        if (message.type === "image") {
          const mediaId = message.image.id;
          mediaType = message.image.mime_type || "image/jpeg";

          // Request media download URL from Meta using API key
          if (whatsappAccessToken) {
            try {
              const metaUrlRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
                headers: { Authorization: `Bearer ${whatsappAccessToken}` }
              });
              if (metaUrlRes.ok) {
                const metaUrlData = await metaUrlRes.json();
                mediaUrl = metaUrlData.url;
              } else {
                console.error("Meta media URL fetch failed:", await metaUrlRes.text());
              }
            } catch (err) {
              console.error("Error fetching Meta media URL:", err);
            }
          }
        }
        messageBody = message.text?.body || "";
      } else if (val?.statuses) {
        // Log status updates but don't process them as messages
        console.log(`WhatsApp Status Update: ${val.statuses[0]?.status} for ${val.statuses[0]?.recipient_id}`);
        return NextResponse.json({ success: true, message: "Status update ignored" });
      }
    }

    // 2. Load or Initialize Session
    if (!fromNumber) {
      console.warn("No fromNumber found in webhook payload");
      return NextResponse.json({ error: "No fromNumber found" }, { status: 200 }); // Return 200 to Meta
    }

    const cleanedSenderPhone = fromNumber.replace(/\D/g, "").slice(-10);
    if (!cleanedSenderPhone) {
      console.warn("Invalid phone number format:", fromNumber);
      return NextResponse.json({ error: "Invalid phone number" }, { status: 200 });
    }

    const sessionRef = adminDb.collection("whatsappSessions").doc(cleanedSenderPhone);
    const sessionSnap = await sessionRef.get();
    let session: any = null;

    if (sessionSnap.exists) {
      session = sessionSnap.data();
      // Session expires in 30 minutes
      const updatedAt = session.updatedAt?.toDate() || new Date(0);
      const isExpired = Date.now() - updatedAt.getTime() > 30 * 60 * 1000;
      if (isExpired) {
        session = {
          state: "idle",
          companyId,
          data: {},
          updatedAt: new Date()
        };
      }
    } else {
      session = {
        state: "idle",
        companyId,
        data: {},
        updatedAt: new Date()
      };
    }

    // Helper to send text reply
    const sendReply = async (text: string) => {
      console.log(`Sending reply to ${fromNumber}: ${text.substring(0, 50)}...`);
      if (isTwilio) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${text}</Body></Message></Response>`;
        return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
      } else if (phoneId && whatsappAccessToken) {
        try {
          const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${whatsappAccessToken}`
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: fromNumber,
              type: "text",
              text: { body: text }
            })
          });
          
          if (!res.ok) {
            const errorData = await res.text();
            console.error("Meta API error sending message:", errorData);
          } else {
            console.log("Message sent successfully to Meta");
          }
        } catch (err) {
          console.error("Fetch error sending Meta message:", err);
        }
      } else {
        console.warn("Cannot send Meta reply: Missing phoneId or whatsappAccessToken", { phoneId, hasToken: !!whatsappAccessToken });
      }
      return NextResponse.json({ success: true, message: "Text reply handled" });
    };

    // Helper to send document reply
    const sendDocumentReply = async (pdfUrl: string, filename: string, caption: string) => {
      console.log(`Sending document reply to ${fromNumber}: ${filename}`);
      if (isTwilio) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${caption}</Body><Media>${pdfUrl}</Media></Message></Response>`;
        return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
      } else if (phoneId && whatsappAccessToken) {
        try {
          const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${whatsappAccessToken}`
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: fromNumber,
              type: "document",
              document: {
                link: pdfUrl,
                filename: filename,
                caption: caption
              }
            })
          });
          if (!res.ok) {
            const errorData = await res.text();
            console.error("Meta API error sending document:", errorData);
          }
        } catch (err) {
          console.error("Fetch error sending Meta document:", err);
        }
      }
      return NextResponse.json({ success: true, message: "Document reply handled" });
    };

    const normalizedBody = messageBody.trim().toLowerCase();

    // Reset session on cancel commands
    if (normalizedBody === "menu" || normalizedBody === "menú" || normalizedBody === "ayuda" || normalizedBody === "cancelar" || normalizedBody === "salir") {
      session.state = "idle";
      session.data = {};
      session.updatedAt = new Date();
      await sessionRef.set(session);

      const menuText = `🤖 *Menú Principal - Bind AI*\n\n` +
                       `Elige una opción respondiendo con el número o texto:\n\n` +
                       `1️⃣ *Enviar Pago/Anticipo*\n` +
                       `2️⃣ *Enviar Gasto*\n` +
                       `3️⃣ *Estado de Cuenta*\n\n` +
                       `Escribe *Menú* en cualquier momento para regresar aquí.`;
      return await sendReply(menuText);
    }

    // --- State Routing ---

    // 1. Idle state
    if (session.state === "idle") {
      if (mediaUrl) {
        return await sendReply(`⚠️ Por favor, elige una opción del menú de texto antes de enviar un comprobante.\n\nEscribe *Menú* para ver las opciones disponibles.`);
      }

      if (normalizedBody === "1" || normalizedBody.includes("pago") || normalizedBody.includes("anticipo")) {
        session.state = "awaiting_anticipo_client";
        session.updatedAt = new Date();
        await sessionRef.set(session);
        return await sendReply(`👤 *Enviar Pago/Anticipo*\n\nPor favor, escribe el nombre o razón social del cliente:`);
      } else if (normalizedBody === "2" || normalizedBody.includes("gasto")) {
        session.state = "awaiting_gasto_receipt";
        session.updatedAt = new Date();
        await sessionRef.set(session);
        return await sendReply(`📸 *Enviar Gasto*\n\nEsperando comprobante...\n\nPor favor, envía la foto del comprobante de gasto.`);
      } else if (normalizedBody === "3" || normalizedBody.includes("estado") || normalizedBody.includes("cuenta")) {
        session.state = "awaiting_estado_cuenta_client";
        session.updatedAt = new Date();
        await sessionRef.set(session);
        return await sendReply(`👤 *Estado de Cuenta*\n\nPor favor, escribe el nombre del cliente para consultar su estado de cuenta:`);
      } else {
        const menuText = `🤖 *Menú Principal - Bind AI*\n\n` +
                         `Elige una opción respondiendo con el número o texto:\n\n` +
                         `1️⃣ *Enviar Pago/Anticipo*\n` +
                         `2️⃣ *Enviar Gasto*\n` +
                         `3️⃣ *Estado de Cuenta*\n\n` +
                         `Escribe *Menú* en cualquier momento para regresar aquí.`;
        return await sendReply(menuText);
      }
    }

    // 2. Awaiting client for anticipo
    if (session.state === "awaiting_anticipo_client") {
      if (mediaUrl) {
        return await sendReply(`⚠️ Por favor, escribe primero el nombre del cliente. Escribe *Cancelar* para volver al menú.`);
      }

      const clientsSnap = await adminDb.collection("companies").doc(companyId).collection("clients").get();
      const clientsList = clientsSnap.docs.map((docSnap: any) => ({
        id: docSnap.id,
        name: docSnap.data().name || docSnap.data().LegalName || docSnap.data().CommercialName || docSnap.data().ClientName || "Cliente sin nombre"
      }));

      const queryTerm = messageBody.trim().toLowerCase();
      const matches = clientsList.filter((c: any) => c.name.toLowerCase().includes(queryTerm));

      let matchedClient = null;
      if (matches.length > 0) {
        matchedClient = matches[0];
      }

      if (matchedClient) {
        session.state = "awaiting_anticipo_receipt";
        session.data = {
          clientId: matchedClient.id,
          clientName: matchedClient.name
        };
        session.updatedAt = new Date();
        await sessionRef.set(session);
        return await sendReply(`✅ Cliente seleccionado: *${matchedClient.name}*\n\n📸 Esperando comprobante...\n\nPor favor, envía la foto del comprobante de pago.`);
      } else {
        session.state = "awaiting_anticipo_receipt";
        session.data = {
          clientId: "unassociated",
          clientName: messageBody.trim()
        };
        session.updatedAt = new Date();
        await sessionRef.set(session);
        return await sendReply(`⚠️ No encontramos un cliente con ese nombre, se registrará como: *${messageBody.trim()}*.\n\n📸 Esperando comprobante...\n\nPor favor, envía la foto del comprobante de pago.`);
      }
    }

    // 3. Awaiting receipt image for anticipo
    if (session.state === "awaiting_anticipo_receipt") {
      if (!mediaUrl) {
        return await sendReply(`⚠️ Por favor, envía la foto del comprobante de pago para el cliente *${session.data.clientName}*.\n\nEscribe *Cancelar* para anular.`);
      }

      // Download and upload to Firebase Storage
      let imageBase64 = "";
      let uploadUrl = "";
      try {
        const headers: any = {};
        if (!isTwilio && whatsappAccessToken) {
          headers.Authorization = `Bearer ${whatsappAccessToken}`;
        }
        const imgRes = await fetch(mediaUrl, { headers });
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          imageBase64 = Buffer.from(buffer).toString("base64");

          const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
          const app = admin.apps.find((a: any) => a?.name === '[DEFAULT]') || admin.apps[0];
          
          if (app && bucketName) {
            const bucket = admin.storage(app).bucket(bucketName);
            const fileName = `companies/${companyId}/anticipos_receipts/${Date.now()}_whatsapp.png`;
            const file = bucket.file(fileName);
            await file.save(Buffer.from(buffer), {
              metadata: { contentType: mediaType || "image/png" }
            });
            uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
          }
        }
      } catch (err) {
        console.error("Error processing attachment image in whatsapp flow:", err);
      }

      // Fetch active bank accounts to match destination bank
      const bankAccountsSnap = await adminDb.collection("companies").doc(companyId).collection("bankAccounts").get();
      const bankAccountsList = bankAccountsSnap.docs.map((docSnap: any) => ({
        id: docSnap.id,
        name: docSnap.data().name || docSnap.data().Name || "Cuenta sin nombre"
      }));

      // Run Gemini parsing on the receipt
      let geminiResult: any = {};
      const apiKey = process.env.GEMINI_API_KEY;

      if (imageBase64 && apiKey) {
        try {
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({
            model: "gemini-3.5-flash",
            generationConfig: { responseMimeType: "application/json" }
          });

          const prompt = `
Analiza la imagen de este comprobante de pago o transferencia bancaria y extrae la siguiente información en formato JSON.

Te proporciono una lista de nuestras cuentas bancarias receptoras en formato JSON. Analiza el comprobante para identificar cuál de estas cuentas es el *banco destino* (el banco receptor que recibe el dinero). Ten mucho cuidado de no confundirlo con el banco emisor/origen (el banco desde donde se envía el dinero, el cual no es relevante). Busca coincidencias semánticas (por ejemplo, si el banco receptor en el comprobante es "BBVA Bancomer" o "BBVA" y en nuestra lista de cuentas tenemos una llamada "BBVA Corporativa", esa es la cuenta coincidente).

Lista de Nuestras Cuentas Bancarias Receptoras:
${JSON.stringify(bankAccountsList, null, 2)}

Devuelve estrictamente un objeto JSON con los siguientes campos:
{
  "amount": un número flotante representando el monto total del comprobante, o null si no se decteta.
  "date": la fecha del pago en formato "YYYY-MM-DD", o null si no se decteta.
  "reference": una cadena con la referencia, clave de rastreo, número de autorización o folio del comprobante, o null si no se decteta.
  "paymentTermId": una de las siguientes opciones según el tipo de comprobante:
    - "3" (si es una transferencia bancaria, SPEI, traspaso, etc.)
    - "4" (si es un voucher o ticket de terminal de tarjeta de crédito/débito)
    - "1" (si es un recibo de efectivo, depósito en efectivo en Oxxo/ventanilla, etc.)
    - o null si no se puede determinar.
  "matchingBankAccount": {
    "id": el ID de la cuenta bancaria de la lista proporcionada que coincida con el banco receptor/destino en el comprobante, o null si no hay coincidencia.
    "name": el nombre de la cuenta bancaria de la lista que coincide, o null si no hay coincidencia.
  }
}
`;

          const imagePart = {
            inlineData: {
              data: imageBase64,
              mimeType: mediaType || "image/png"
            }
          };

          const result = await model.generateContent([prompt, imagePart]);
          let responseText = result.response.text();
          
          // Clean possible markdown code blocks
          if (responseText.includes("```json")) {
            responseText = responseText.split("```json")[1].split("```")[0];
          } else if (responseText.includes("```")) {
            responseText = responseText.split("```")[1].split("```")[0];
          }
          
          geminiResult = JSON.parse(responseText.trim());
        } catch (err) {
          console.error("Gemini receipt analysis error in webhook:", err);
        }
      }

      const numAmount = geminiResult.amount || 0;
      const finalDate = geminiResult.date || new Date().toISOString().split("T")[0];
      const finalReference = geminiResult.reference || "";
      const finalPaymentTerm = geminiResult.paymentTermId || "3";

      let bankAccountId = "";
      let bankAccountName = "Ninguno (Pendiente)";
      if (geminiResult.matchingBankAccount?.id) {
        bankAccountId = geminiResult.matchingBankAccount.id;
        bankAccountName = geminiResult.matchingBankAccount.name;
      } else if (whatsappDefaultBankAccountId) {
        bankAccountId = whatsappDefaultBankAccountId;
        const bankDoc = await adminDb.collection("companies").doc(companyId).collection("bankAccounts").doc(whatsappDefaultBankAccountId).get();
        bankAccountName = bankDoc.exists ? (bankDoc.data()?.name || bankDoc.data()?.Name || "Cuenta Configurada") : "Cuenta Configurada";
      }

      session.state = "awaiting_anticipo_confirm";
      session.data = {
        ...session.data,
        amount: numAmount,
        date: finalDate,
        reference: finalReference,
        paymentTermId: finalPaymentTerm,
        bankAccountId,
        bankAccountName,
        imageUrl: uploadUrl || mediaUrl
      };
      session.updatedAt = new Date();
      await sessionRef.set(session);

      const summaryText = `🤖 *Resumen de Anticipo Extraído por IA:*\n\n` +
                          `👤 *Cliente:* ${session.data.clientName}\n` +
                          `💵 *Monto:* $${numAmount.toFixed(2)} MXN\n` +
                          `🏦 *Cuenta Destino:* ${bankAccountName}\n` +
                          `📅 *Fecha:* ${finalDate}\n` +
                          `🔑 *Referencia:* ${finalReference || "N/A"}\n\n` +
                          `Escribe *Aceptar* para registrar este anticipo en el ERP, o *Cancelar* para descartarlo.`;

      return await sendReply(summaryText);
    }

    // 4. Awaiting confirmation for anticipo
    if (session.state === "awaiting_anticipo_confirm") {
      if (normalizedBody === "aceptar" || normalizedBody.includes("acep")) {
        const newDocRef = await adminDb.collection("companies").doc(companyId).collection("anticipos").add({
          amount: session.data.amount.toString(),
          balance: session.data.amount.toString(),
          clientId: session.data.clientId || "unassociated",
          clientName: session.data.clientName || "Cliente no identificado",
          reference: (session.data.reference || "").trim(),
          receivedAt: session.data.date,
          status: "pending",
          bankAccountId: session.data.bankAccountId || "",
          paymentTermId: session.data.paymentTermId || "3",
          imageUrl: session.data.imageUrl || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: "WhatsApp Bot"
        });

        session.state = "idle";
        session.data = {};
        session.updatedAt = new Date();
        await sessionRef.set(session);

        const folioText = `ANT-${newDocRef.id.substring(0, 5).toUpperCase()}`;
        return await sendReply(`✅ ¡Anticipo registrado y guardado con éxito!\n\n📄 *Folio:* ${folioText}\n\nConsulta en el ERP Móvil: https://bind-ai-6f1fc.web.app/movil`);
      } else {
        return await sendReply(`⚠️ Por favor escribe *Aceptar* para guardar el anticipo o *Cancelar* para volver al menú principal.`);
      }
    }

    // 5. Awaiting receipt for expense (no IA processing)
    if (session.state === "awaiting_gasto_receipt") {
      if (!mediaUrl) {
        return await sendReply(`⚠️ Por favor, envía la foto del comprobante de gasto.\n\nEscribe *Cancelar* para anular.`);
      }

      let uploadUrl = "";
      try {
        const headers: any = {};
        if (!isTwilio && whatsappAccessToken) {
          headers.Authorization = `Bearer ${whatsappAccessToken}`;
        }
        const imgRes = await fetch(mediaUrl, { headers });
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
          const app = admin.apps.find((a: any) => a?.name === '[DEFAULT]') || admin.apps[0];
          
          if (app && bucketName) {
            const bucket = admin.storage(app).bucket(bucketName);
            const fileName = `companies/${companyId}/gastos_receipts/${Date.now()}_whatsapp.png`;
            const file = bucket.file(fileName);
            await file.save(Buffer.from(buffer), {
              metadata: { contentType: mediaType || "image/png" }
            });
            uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
          }
        }
      } catch (err) {
        console.error("Error saving gasto receipt:", err);
      }

      await adminDb.collection("companies").doc(companyId).collection("gastosPendientes").add({
        imageUrl: uploadUrl || mediaUrl,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: "WhatsApp Bot",
        fromNumber: fromNumber
      });

      session.state = "idle";
      session.data = {};
      session.updatedAt = new Date();
      await sessionRef.set(session);

      return await sendReply(`✅ ¡Comprobante de gasto recibido y guardado en *Gastos Pendientes*!\n\nPodrás completarlo más tarde en el módulo de compras y gastos del ERP.`);
    }

    // 6. Awaiting client for account statement (PDF)
    if (session.state === "awaiting_estado_cuenta_client") {
      if (mediaUrl) {
        return await sendReply(`⚠️ Por favor, escribe primero el nombre del cliente. Escribe *Cancelar* para volver al menú.`);
      }

      const clientsSnap = await adminDb.collection("companies").doc(companyId).collection("clients").get();
      const clientsList = clientsSnap.docs.map((docSnap: any) => ({
        id: docSnap.id,
        name: docSnap.data().name || docSnap.data().LegalName || docSnap.data().CommercialName || docSnap.data().ClientName || "Cliente sin nombre"
      }));

      const queryTerm = messageBody.trim().toLowerCase();
      const matches = clientsList.filter((c: any) => c.name.toLowerCase().includes(queryTerm));

      if (matches.length === 0) {
        return await sendReply(`❌ No encontramos ningún cliente con el nombre *${messageBody.trim()}*.\n\nPor favor, escribe de nuevo el nombre del cliente, o escribe *Cancelar* para volver al menú:`);
      }

      const matchedClient = matches[0];
      
      try {
        const pdfUrl = await generateClientStatementPDFAndUpload(companyId, matchedClient, adminDb, admin);
        
        session.state = "idle";
        session.data = {};
        session.updatedAt = new Date();
        await sessionRef.set(session);

        const filename = `Estado_de_Cuenta_${matchedClient.name.replace(/\s+/g, "_")}.pdf`;
        return await sendDocumentReply(pdfUrl, filename, `Aquí tienes el Estado de Cuenta de *${matchedClient.name}*.`);
      } catch (err: any) {
        console.error("Error generating account statement PDF:", err);
        return await sendReply(`⚠️ Hubo un problema al generar el PDF del estado de cuenta: ${err.message}. Por favor intenta de nuevo más tarde.`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in whatsapp webhook:", error);
    return NextResponse.json({ error: error.message || "Failed to process message" }, { status: 500 });
  }
}
