"use server";

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
