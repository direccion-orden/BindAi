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
            return NextResponse.json({ status: "rejected", message: verifyResult.getStatus().getMessage() });
        }

        if (!verifyResult.getStatusRequest().isTypeOf('Finished')) {
            const state = verifyResult.getStatusRequest().getValue();
            return NextResponse.json({ status: "pending", code: state, message: verifyResult.getCodeRequest().getMessage() });
        }

        // Descarga completada
        const packageIds = verifyResult.getPackageIds();
        let invoices = [];
        
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
                        const uuidMatch = content.match(/UUID="([^"]+)"/i);
                        const totalMatch = content.match(/Total="([^"]+)"/i);
                        const fechaMatch = content.match(/Fecha="([^"]+)"/i);
                        const emisorMatch = content.match(/<cfdi:Emisor[^>]+Rfc="([^"]+)"[^>]+Nombre="([^"]+)"/i);
                        const folioMatch = content.match(/Folio="([^"]+)"/i);
                        const serieMatch = content.match(/Serie="([^"]+)"/i);
                        
                        if (uuidMatch) {
                            const folio = folioMatch ? folioMatch[1] : "";
                            const serie = serieMatch ? serieMatch[1] : "";
                            const combinedFolio = serie ? `${serie}-${folio}` : folio;
                            invoices.push({
                                uuid: uuidMatch[1],
                                total: totalMatch ? parseFloat(totalMatch[1]) : 0,
                                date: fechaMatch ? fechaMatch[1] : "",
                                emisorRfc: emisorMatch ? emisorMatch[1] : "Desconocido",
                                emisorName: emisorMatch ? emisorMatch[2] : "Desconocido",
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
                        const total = parseFloat(item.get('monto')) || 0;
                        const date = item.get('fechaEmision') || "";
                        const emisorRfc = item.get('rfcEmisor') || "Desconocido";
                        const emisorName = item.get('nombreEmisor') || "Desconocido";
                        
                        invoices.push({
                            uuid: uuid,
                            total: total,
                            date: date,
                            emisorRfc: emisorRfc,
                            emisorName: emisorName,
                            xmlBase64: "", // Los metadatos no contienen el archivo XML completo
                            status: "pending_review",
                            createdAt: new Date().toISOString()
                        });
                    }
                }
            }
        }

        return NextResponse.json({ status: "finished", invoices });

    } catch (error: any) {
        console.error("SAT Verify Error:", error);
        return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
    }
}
