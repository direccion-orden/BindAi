"use server";

import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { distributeDiscountAndTax } from "@/lib/utils/discountEngine";

export async function createCfdi(data: any) {
  const FACTURAMA_USER = process.env.FACTURAMA_USER;
  const FACTURAMA_PASSWORD = process.env.FACTURAMA_PASSWORD;
  const FACTURAMA_ENV = process.env.FACTURAMA_ENV || 'sandbox'; // 'sandbox' or 'production'

  if (!FACTURAMA_USER || !FACTURAMA_PASSWORD) {
    return {
      success: false,
      error: 'Facturama API credentials not configured.'
    };
  }

  const baseUrl = (FACTURAMA_ENV.toLowerCase() === 'production')
    ? 'https://api.facturama.mx'
    : 'https://apisandbox.facturama.mx';
  
  console.log("========= FACTURAMA PAYLOAD =========");
  console.log("ENV:", FACTURAMA_ENV);
  console.log("URL:", baseUrl);
  console.log(JSON.stringify(data, null, 2));
  console.log("=====================================");

  const authHeader = 'Basic ' + Buffer.from(`${FACTURAMA_USER}:${FACTURAMA_PASSWORD}`).toString('base64');

  try {
    const response = await fetch(`${baseUrl}/3/cfdis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(data)
    });

    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      console.error("Facturama returned non-JSON response:", responseText);
      return {
        success: false,
        error: `Facturama retornó un error (Status ${response.status}): ${response.statusText}`,
        details: responseText
      };
    }

    if (!response.ok) {
      console.error("Facturama Error:", response.status, response.statusText, responseData);

      if (response.status === 401) {
        return {
          success: false,
          error: "Credenciales de Facturama inválidas o no autorizadas (401 Unauthorized). Por favor verifica tu usuario, contraseña y entorno (FACTURAMA_ENV) en tu archivo .env.local.",
          details: "Unauthorized"
        };
      }

      // Handle expired Sandbox CSD Certificates to allow development to continue
      // if (FACTURAMA_ENV === 'sandbox' && responseData.Message?.includes("305 - La fecha de emisión no está dentro de la vigencia del CSD")) {
      //   console.warn("⚠️ Facturama Sandbox CSD is EXPIRED. Mocking successful response so development can continue.");
      //   return {
      //     success: true,
      //     data: {
      //       Id: crypto.randomUUID(),
      //       CfdiType: "I",
      //       Status: "active",
      //       Uuid: crypto.randomUUID(),
      //       Date: new Date().toISOString()
      //     }
      //   };
      // }

      return {
        success: false,
        error: responseData.Message || `Error al generar CFDI (HTTP ${response.status} ${response.statusText})`,
        details: JSON.stringify(responseData.ModelState || responseData, null, 2)
      };
    }

    return {
      success: true,
      data: responseData
    };

  } catch (error: any) {
    console.error("Facturama Server Action Error:", error);
    return {
      success: false,
      error: error.message || 'Error de conexión con Facturama'
    };
  }
}

export async function searchSatProducts(keyword: string) {
  const FACTURAMA_USER = process.env.FACTURAMA_USER;
  const FACTURAMA_PASSWORD = process.env.FACTURAMA_PASSWORD;
  const FACTURAMA_ENV = process.env.FACTURAMA_ENV || "sandbox";
  
  if (!FACTURAMA_USER || !FACTURAMA_PASSWORD) return [];
  
  const baseUrl = FACTURAMA_ENV === "production" ? "https://api.facturama.mx" : "https://apisandbox.facturama.mx";
  const authHeader = "Basic " + Buffer.from(`${FACTURAMA_USER}:${FACTURAMA_PASSWORD}`).toString("base64");
  
  try {
    const res = await fetch(`${baseUrl}/catalogs/ProductsOrServices?keyword=${encodeURIComponent(keyword)}`, {
      headers: { Authorization: authHeader }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data;
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function searchSatUnits(keyword: string) {
  const FACTURAMA_USER = process.env.FACTURAMA_USER;
  const FACTURAMA_PASSWORD = process.env.FACTURAMA_PASSWORD;
  const FACTURAMA_ENV = process.env.FACTURAMA_ENV || "sandbox";
  
  if (!FACTURAMA_USER || !FACTURAMA_PASSWORD) return [];
  
  const baseUrl = FACTURAMA_ENV === "production" ? "https://api.facturama.mx" : "https://apisandbox.facturama.mx";
  const authHeader = "Basic " + Buffer.from(`${FACTURAMA_USER}:${FACTURAMA_PASSWORD}`).toString("base64");
  
  try {
    const res = await fetch(`${baseUrl}/catalogs/Units?keyword=${encodeURIComponent(keyword)}`, {
      headers: { Authorization: authHeader }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data;
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function cancelCfdi(facturamaId: string, motive: string, uuidReplacement?: string) {
  const FACTURAMA_USER = process.env.FACTURAMA_USER;
  const FACTURAMA_PASSWORD = process.env.FACTURAMA_PASSWORD;
  const FACTURAMA_ENV = process.env.FACTURAMA_ENV || 'sandbox';

  if (!FACTURAMA_USER || !FACTURAMA_PASSWORD) {
    return { success: false, error: 'Facturama API credentials not configured.' };
  }

  const baseUrl = (FACTURAMA_ENV.toLowerCase() === 'production')
    ? 'https://api.facturama.mx'
    : 'https://apisandbox.facturama.mx';

  const authHeader = 'Basic ' + Buffer.from(`${FACTURAMA_USER}:${FACTURAMA_PASSWORD}`).toString('base64');
  
  let url = `${baseUrl}/cfdi/${facturamaId}?type=issued&motive=${motive}`;
  if (uuidReplacement) {
    url += `&uuidReplacement=${uuidReplacement}`;
  }

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': authHeader
      }
    });

    const responseText = await response.text();
    let responseData = {};
    try {
      if (responseText) responseData = JSON.parse(responseText);
    } catch(e) {}

    if (!response.ok) {
      console.error("Facturama Cancel Error:", response.status, responseText);
      if (response.status === 401) {
        return {
          success: false,
          error: "Credenciales de Facturama inválidas o no autorizadas (401 Unauthorized). Por favor verifica tu usuario, contraseña y entorno (FACTURAMA_ENV) en tu archivo .env.local.",
          details: "Unauthorized"
        };
      }
      return {
        success: false,
        error: (responseData as any).Message || `Error al cancelar CFDI (HTTP ${response.status})`,
        details: responseText || responseData
      };
    }

    return {
      success: true,
      data: responseData
    };
  } catch (error: any) {
    console.error("Facturama Server Action Cancel Error:", error);
    return {
      success: false,
      error: error.message || 'Error de conexión con Facturama al cancelar'
    };
  }
}

export async function downloadCfdi(facturamaId: string, format: 'pdf' | 'xml') {
  const FACTURAMA_USER = process.env.FACTURAMA_USER;
  const FACTURAMA_PASSWORD = process.env.FACTURAMA_PASSWORD;
  const FACTURAMA_ENV = process.env.FACTURAMA_ENV || 'sandbox';

  if (!FACTURAMA_USER || !FACTURAMA_PASSWORD) {
    return { success: false, error: 'Facturama API credentials not configured.' };
  }

  const baseUrl = (FACTURAMA_ENV.toLowerCase() === 'production')
    ? 'https://api.facturama.mx'
    : 'https://apisandbox.facturama.mx';

  const authHeader = 'Basic ' + Buffer.from(`${FACTURAMA_USER}:${FACTURAMA_PASSWORD}`).toString('base64');
  
  const url = `${baseUrl}/cfdi/${format}/issued/${facturamaId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader
      }
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("Facturama Download Error:", response.status, responseData);
      if (response.status === 401) {
        return {
          success: false,
          error: "Credenciales de Facturama inválidas o no autorizadas (401 Unauthorized). Por favor verifica tu usuario, contraseña y entorno (FACTURAMA_ENV) en tu archivo .env.local."
        };
      }
      return {
        success: false,
        error: responseData.Message || `Error al descargar CFDI (HTTP ${response.status})`
      };
    }

    return {
      success: true,
      content: responseData.Content,
      contentType: responseData.ContentType
    };
  } catch (error: any) {
    console.error("Facturama Server Action Download Error:", error);
    return {
      success: false,
      error: error.message || 'Error de conexión con Facturama al descargar'
    };
  }
}

async function resolveCompanyId(companyId: string): Promise<string> {
  if (!companyId) return "";
  const trimmed = companyId.trim();
  if (/^\d+$/.test(trimmed)) {
    const codeNum = Number(trimmed);
    const snap = await adminDb.collection("companies").where("companyCode", "==", codeNum).limit(1).get();
    if (!snap.empty) {
      return snap.docs[0].id;
    }
  }
  return trimmed;
}

export async function getRemissionForAutofactura(companyId: string, folio: string, total: number): Promise<
  | { success: true; alreadyInvoiced: boolean; data: any }
  | { success: false; error: string }
> {
  try {
    if (!isFirebaseAdminConfigured || !adminDb) {
      return {
        success: false,
        error: "Firebase Admin credentials are not configured in your .env.local file. Please add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY, and restart your server."
      };
    }

    if (!companyId || !folio || !total) {
      return { success: false, error: "Datos incompletos para buscar el ticket." };
    }

    const resolvedCompanyId = await resolveCompanyId(companyId);
    if (!resolvedCompanyId) {
      return { success: false, error: "No se encontró la empresa con el código o ID proporcionado." };
    }
    companyId = resolvedCompanyId;

    const remissionsCol = adminDb.collection("companies").doc(companyId).collection("remisiones");

    // Clean up folio search (trim whitespaces, convert to uppercase if needed)
    const searchFolio = folio.trim();

    // Attempt 1: Search by remissionNumber (as number)
    const numFolio = parseInt(searchFolio);
    let querySnap = await remissionsCol.where("remissionNumber", "==", isNaN(numFolio) ? searchFolio : numFolio).get();

    // Attempt 2: Search by remissionNumber (as string)
    if (querySnap.empty) {
      querySnap = await remissionsCol.where("remissionNumber", "==", searchFolio).get();
    }

    // Attempt 3: Search by orderNumber
    if (querySnap.empty) {
      querySnap = await remissionsCol.where("orderNumber", "==", searchFolio).get();
    }

    // Attempt 4: Search by orderNumber with POS- prefix
    if (querySnap.empty && !searchFolio.startsWith("POS-")) {
      querySnap = await remissionsCol.where("orderNumber", "==", `POS-${searchFolio}`).get();
    }

    // Attempt 5: Search by document ID directly (if it looks like a UUID)
    if (querySnap.empty && searchFolio.length > 20) {
      const docSnap = await remissionsCol.doc(searchFolio).get();
      if (docSnap.exists) {
        const docData = docSnap.data();
        if (docData && Math.abs((docData.totalAmount || docData.financials?.total || 0) - total) < 0.05) {
          // Wrap in a mock querySnap format for uniform processing below
          return processFoundRemission(docSnap.id, docData, total);
        }
      }
    }

    if (querySnap.empty) {
      return { success: false, error: "No se encontró ningún ticket de compra con ese Folio. Verifica el número impreso." };
    }

    const docRef = querySnap.docs[0];
    return processFoundRemission(docRef.id, docRef.data(), total);

  } catch (error: any) {
    console.error("Error in getRemissionForAutofactura server action:", error);
    return { success: false, error: error.message || "Error al buscar el ticket en el servidor." };
  }
}

function processFoundRemission(id: string, data: any, total: number): 
  | { success: true; alreadyInvoiced: boolean; data: any }
  | { success: false; error: string } {
  const saleTotal = data.totalAmount || data.financials?.total || 0;
  
  // Validate total amount matches (anti-scraping protection)
  if (Math.abs(saleTotal - total) > 0.05) {
    return { success: false, error: "El total del ticket no coincide con el folio ingresado. Verifica el monto." };
  }

  // Check if it is already invoiced
  if (data.status === "facturada" || data.invoiceId) {
    return { 
      success: true, 
      alreadyInvoiced: true,
      data: {
        id: id,
        remissionNumber: data.remissionNumber || "",
        orderNumber: data.orderNumber || "",
        totalAmount: saleTotal,
        invoiceId: data.invoiceId || null,
        invoiceUuid: data.invoiceUuid || null
      }
    };
  }

  return {
    success: true,
    alreadyInvoiced: false,
    data: {
      id: id,
      remissionNumber: data.remissionNumber || "",
      orderNumber: data.orderNumber || "",
      totalAmount: saleTotal,
      subtotal: data.subtotal || data.financials?.subtotal || 0,
      tax: data.tax || data.financials?.tax || 0,
      createdAt: data.createdAt,
      items: data.items || []
    }
  };
}

export async function createAutofactura(companyId: string, remissionId: string, clientData: {
  rfc: string;
  razonSocial: string;
  taxRegime: string;
  zipCode: string;
  cfdiUse: string;
  email: string;
}): Promise<
  | { success: true; invoiceUuid: string; invoiceId: string }
  | { success: false; error: string; details?: any }
> {
  try {
    if (!isFirebaseAdminConfigured || !adminDb) {
      return {
        success: false,
        error: "Firebase Admin credentials are not configured in your .env.local file. Please add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY, and restart your server."
      };
    }

    const resolvedCompanyId = await resolveCompanyId(companyId);
    if (!resolvedCompanyId) {
      return { success: false, error: "No se encontró la empresa con el código o ID proporcionado." };
    }
    companyId = resolvedCompanyId;

    const remissionRef = adminDb.collection("companies").doc(companyId).collection("remisiones").doc(remissionId);
    const remissionSnap = await remissionRef.get();
    if (!remissionSnap.exists) {
      return { success: false, error: "La venta especificada no existe." };
    }
    
    const remission = remissionSnap.data();
    if (!remission) {
      return { success: false, error: "Datos de venta vacíos." };
    }

    if (remission.status === "facturada" || remission.invoiceId) {
      return { success: false, error: "Esta venta ya fue facturada anteriormente." };
    }

    // Load company zip code for ExpeditionPlace
    const companySnap = await adminDb.collection("companies").doc(companyId).get();
    if (!companySnap.exists) {
      return { success: false, error: "La empresa no existe." };
    }
    const companyData = companySnap.data() || {};
    const companyZipCode = companyData.zipCode || "64000";

    // Payment details mapping
    let paymentForm = "01"; // Efectivo default
    let paymentMethod = "PUE";
    
    if (remission.payments && remission.payments.length > 0) {
      const mainPayment = remission.payments[0];
      const method = mainPayment.method?.toLowerCase();
      if (method === "tarjeta") paymentForm = "04"; // Tarjeta de crédito
      else if (method === "transferencia") paymentForm = "03"; // Transferencia
      else if (method === "efectivo") paymentForm = "01";
      else if (method === "puntos" || method === "saldofavor") paymentForm = "99"; // Por definir / Otros
    }

    const totalDocDiscount = Number(remission.totalDiscount) || 0;
    const targetTax = Number(remission.tax) || 0;
    const targetTotal = Number(remission.totalAmount) || 0;

    const distributedItems = distributeDiscountAndTax(
      remission.items || [],
      totalDocDiscount,
      targetTax,
      targetTotal
    );

    const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;

    // Transform products and look up SAT codes if missing on remission
    const items = await Promise.all(distributedItems.map(async (item: any) => {
      let satProductCode = item.satProductCode || "01010101";
      let satUnitCode = item.satUnitCode || "H87";
      let satUnitName = item.satUnitName || "PIEZA";
      
      if ((satProductCode === "01010101" || !item.satProductCode) && item.productId) {
        try {
          const prodSnap = await adminDb.collection("companies").doc(companyId).collection("products").doc(item.productId).get();
          if (prodSnap.exists) {
            const prodData = prodSnap.data();
            if (prodData) {
              if (prodData.satProductCode) satProductCode = prodData.satProductCode;
              if (prodData.satUnitCode) satUnitCode = prodData.satUnitCode;
              if (prodData.satUnitName) satUnitName = prodData.satUnitName;
            }
          }
        } catch (e) {
          console.error("Error loading product SAT codes:", e);
        }
      }

      const unitPriceRounded = round2(item.unitPrice);
      const subtotalItem = round2(item.quantity * unitPriceRounded);
      const discountVal = round2(item.finalDiscountAmt);
      const baseVal = round2(subtotalItem - discountVal);
      const taxTotalVal = round2(item.tax);
      const totalVal = round2(baseVal + taxTotalVal);
      
      return {
        ProductCode: satProductCode,
        IdentificationNumber: item.variantId || item.productId || "SKU",
        Description: item.isService && item.description ? item.description : (item.productName || item.title || ""),
        Unit: satUnitName,
        UnitCode: satUnitCode,
        UnitPrice: unitPriceRounded,
        Quantity: item.quantity,
        Subtotal: subtotalItem,
        Discount: discountVal,
        TaxObject: "02",
        Taxes: [
          {
            Total: taxTotalVal,
            Name: "IVA",
            Base: baseVal,
            Rate: 0.16,
            IsRetention: false
          }
        ],
        Total: totalVal
      };
    }));

    // Build CFDI 4.0 Payload
    const facturamaPayload: any = {
      Receiver: {
        Name: clientData.razonSocial.toUpperCase(),
        CfdiUse: clientData.cfdiUse,
        Rfc: clientData.rfc.toUpperCase(),
        TaxZipCode: (clientData.rfc.toUpperCase() === "XAXX010101000" || clientData.rfc.toUpperCase() === "XEXX010101000") ? companyZipCode : clientData.zipCode,
        FiscalRegime: clientData.taxRegime
      },
      CfdiType: "I",
      Exportation: "01",
      PaymentForm: paymentForm,
      PaymentMethod: paymentMethod,
      Currency: "MXN",
      ExpeditionPlace: companyZipCode,
      Items: items
    };

    // Public in general constraints
    if (facturamaPayload.Receiver.Rfc === "XAXX010101000" && facturamaPayload.Receiver.Name === "PUBLICO EN GENERAL") {
      facturamaPayload.GlobalInformation = {
        Periodicity: "01",
        Months: new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`,
        Year: new Date().getFullYear()
      };
    }

    const result = await createCfdi(facturamaPayload);

    if (result.success) {
      const invoiceId = result.data?.Id || result.data?.id || "";
      const invoiceUuid = result.data?.Complement?.TaxStamp?.Uuid || result.data?.Uuid || result.data?.uuid || "";
      const invoiceDate = result.data?.Date || result.data?.date || new Date().toISOString();
      const remissionNumber = remission.remissionNumber || "";

      // Update remission
      await remissionRef.update({
        status: "facturada",
        invoiceId: invoiceId,
        invoiceUuid: invoiceUuid,
        invoiceDate: invoiceDate
      });

      // Update order if reference exists
      if (remission.orderId) {
        try {
          await adminDb.collection("companies").doc(companyId).collection("pedidos").doc(remission.orderId).update({
            status: "facturado"
          });
        } catch (e) {
          console.warn("Failed to update related order status:", e);
        }
      }

      // Create new invoice document
      const invoiceData = {
        id: invoiceId,
        invoiceNumber: result.data.Folio || remissionNumber || "",
        facturamaId: invoiceId,
        facturamaUuid: invoiceUuid,
        clientName: clientData.razonSocial.toUpperCase(),
        clientId: remission.clientId || "public",
        totalAmount: remission.totalAmount || 0,
        subtotal: remission.subtotal || 0,
        tax: remission.tax || 0,
        status: "pagada",
        createdAt: new Date().toISOString(),
        createdBy: `Autofactura Cliente (${clientData.email})`,
        cfdiPayload: facturamaPayload,
        isPosSale: true,
        posSaleId: remissionId
      };
      
      await adminDb.collection("companies").doc(companyId).collection("facturas").doc(invoiceId).set(invoiceData);

      return { 
        success: true, 
        invoiceUuid: invoiceUuid,
        invoiceId: invoiceId
      };
    } else {
      return { 
        success: false, 
        error: result.error, 
        details: result.details 
      };
    }

  } catch (error: any) {
    console.error("Error in createAutofactura server action:", error);
    return { success: false, error: error.message || "Error al procesar la autofacturación." };
  }
}
