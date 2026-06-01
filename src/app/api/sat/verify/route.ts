import { NextResponse } from "next/server";
import {
    Fiel,
    FielRequestBuilder,
    HttpsWebClient,
    Service,
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
            
            const zipContent = downloadResult.getPackageContent();
            const reader = await MetadataPackageReader.createFromContents(zipContent);
            
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

        return NextResponse.json({ status: "finished", invoices });

    } catch (error: any) {
        console.error("SAT Verify Error:", error);
        return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
    }
}
