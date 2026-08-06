import { NextResponse } from "next/server";
import JSZip from "jszip";
import {
    Fiel,
    FielRequestBuilder,
    HttpsWebClient,
    Service,
    CfdiPackageReader,
    MetadataPackageReader
} from '@nodecfdi/sat-ws-descarga-masiva';

export async function POST(req: Request) {
    try {
        const { cerBase64, keyBase64, password, requestId } = await req.json();
        if (!cerBase64 || !keyBase64 || !password || !requestId) {
            return NextResponse.json({ error: "Faltan credenciales o requestId" }, { status: 400 });
        }

        const cerContent = `-----BEGIN CERTIFICATE-----\n${cerBase64.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`;
        const keyContent = `-----BEGIN ENCRYPTED PRIVATE KEY-----\n${keyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END ENCRYPTED PRIVATE KEY-----\n`;

        const fiel = Fiel.create(cerContent, keyContent, password);
        const webClient = new HttpsWebClient();
        const requestBuilder = new FielRequestBuilder(fiel);
        const service = new Service(requestBuilder, webClient);

        // Verificar el estatus
        const verifyResult = await service.verify(requestId);
        
        if (!verifyResult.getStatus().isAccepted()) {
            const msg = verifyResult.getStatus().getMessage() || verifyResult.getCodeRequest().getMessage() || "El SAT rechazó la comunicación.";
            return NextResponse.json({ status: "rejected", message: msg });
        }

        const statusRequest = verifyResult.getStatusRequest();

        if (statusRequest.isTypeOf('Failure') || statusRequest.isTypeOf('Rejected') || statusRequest.isTypeOf('Expired')) {
            const code = statusRequest.getValue();
            const msg = verifyResult.getCodeRequest().getMessage() || `Solicitud ${statusRequest.getValue()}`;
            return NextResponse.json({ status: "rejected", code, message: msg });
        }

        if (!statusRequest.isTypeOf('Finished')) {
            const state = statusRequest.getValue();
            return NextResponse.json({ status: "pending", code: state, message: verifyResult.getCodeRequest().getMessage() });
        }

        // Descarga completada
        const packageIds = verifyResult.getPackageIds();
        const invoicesMap = new Map<string, any>();
        
        for (const packageId of packageIds) {
            const downloadResult = await service.download(packageId);
            if (!downloadResult.getStatus().isAccepted()) continue;
            
            const zipContentBase64 = downloadResult.getPackageContent();
            const zipBuffer = Buffer.from(zipContentBase64, 'base64');
            
            // Detectar dinámicamente si el paquete es de XMLs o de Metadatos inspeccionando en memoria las extensiones
            let isXmlPackage = false;
            try {
                const zip = await JSZip.loadAsync(zipBuffer);
                const filenames = Object.keys(zip.files);
                isXmlPackage = filenames.some(name => name.toLowerCase().endsWith('.xml'));
            } catch (e) {
                console.error("Error al descomprimir y validar las extensiones del paquete:", e);
                isXmlPackage = false;
            }
            
            if (isXmlPackage) {
                console.log(`[SAT Sync] Detectado paquete de XMLs (${packageId}). Procesando...`);
                const reader = await CfdiPackageReader.createFromContents(zipBuffer as any);
                for await (const map of reader.cfdis()) {
                    for (const [uuid, content] of map) {
                        const normalizedUuid = uuid.toUpperCase();
                        const uuidMatch = content.match(/\bUUID="([^"]+)"/i);
                        const totalMatch = content.match(/\bTotal="([^"]+)"/i);
                        const subtotalMatch = content.match(/\bSubTotal="([^"]+)"/i);
                        const fechaMatch = content.match(/\bFecha="([^"]+)"/i);
                        const emisorNodeMatch = content.match(/<cfdi:Emisor([^>]+?)\/?>/i) || content.match(/<Emisor([^>]+?)\/?>/i);
                        const folioMatch = content.match(/\bFolio="([^"]+)"/i);
                        const serieMatch = content.match(/\bSerie="([^"]+)"/i);
                        
                        if (uuidMatch) {
                            const folio = folioMatch ? folioMatch[1] : "";
                            const serie = serieMatch ? serieMatch[1] : "";
                            const combinedFolio = serie ? `${serie}-${folio}` : folio;
                            
                            let emisorRfc = "Desconocido";
                            let emisorName = "Desconocido";
                            if (emisorNodeMatch) {
                                const emisorAttrs = emisorNodeMatch[1];
                                const rfcM = emisorAttrs.match(/Rfc="([^"]+)"/i);
                                const nombreM = emisorAttrs.match(/Nombre="([^"]+)"/i);
                                if (rfcM) emisorRfc = rfcM[1];
                                if (nombreM) emisorName = nombreM[1];
                            }

                            invoicesMap.set(normalizedUuid, {
                                uuid: normalizedUuid,
                                total: totalMatch ? parseFloat(totalMatch[1]) : 0,
                                date: fechaMatch ? fechaMatch[1] : "",
                                emisorRfc,
                                emisorName,
                                folio: combinedFolio,
                                xmlBase64: Buffer.from(content).toString('base64'),
                                status: "pending_review",
                                createdAt: new Date().toISOString()
                            });
                        }
                    }
                }
            } else {
                console.log(`[SAT Sync] Detectado paquete de Metadatos (${packageId}). Procesando...`);
                const reader = await MetadataPackageReader.createFromContents(zipBuffer as any);
                for await (const item of reader.metadata()) {
                    const uuid = item.get('uuid');
                    if (uuid) {
                        const normalizedUuid = uuid.toUpperCase();
                        // Solo agregamos si no existe ya un registro (preferimos el XML si ya se procesó)
                        // O si el registro existente no tiene XML (preferimos los metadatos más frescos si no hay XML)
                        if (!invoicesMap.has(normalizedUuid) || !invoicesMap.get(normalizedUuid).xmlBase64) {
                            const total = parseFloat(item.get('monto')) || 0;
                            const date = item.get('fechaEmision') || "";
                            const emisorRfc = item.get('rfcEmisor') || "Desconocido";
                            const emisorName = item.get('nombreEmisor') || "Desconocido";
                            
                            invoicesMap.set(normalizedUuid, {
                                uuid: normalizedUuid,
                                total: total,
                                date: date,
                                emisorRfc: emisorRfc,
                                emisorName: emisorName,
                                xmlBase64: invoicesMap.get(normalizedUuid)?.xmlBase64 || "", 
                                status: "pending_review",
                                createdAt: new Date().toISOString()
                            });
                        }
                    }
                }
            }
        }

        return NextResponse.json({ status: "finished", invoices: Array.from(invoicesMap.values()) });

    } catch (error: any) {
        console.error("SAT Verify Error:", error);
        return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
    }
}
