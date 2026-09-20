import { NextResponse } from "next/server";
import {
    Fiel,
    FielRequestBuilder,
    HttpsWebClient,
    Service,
    QueryParameters,
    DateTimePeriod,
    DownloadType,
    RequestType,
    DocumentType,
    DocumentStatus
} from '@nodecfdi/sat-ws-descarga-masiva';

export async function POST(req: Request) {
    try {
        const { cerBase64, keyBase64, password, startDate } = await req.json();
        if (!cerBase64 || !keyBase64 || !password) {
            return NextResponse.json({ error: "Faltan credenciales FIEL" }, { status: 400 });
        }

        const cerContent = `-----BEGIN CERTIFICATE-----\n${cerBase64.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`;
        const keyContent = `-----BEGIN ENCRYPTED PRIVATE KEY-----\n${keyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END ENCRYPTED PRIVATE KEY-----\n`;

        const fiel = Fiel.create(cerContent, keyContent, password);

        // Validar vigencia y tipo de e.firma (FIEL)
        if (!fiel.isValid()) {
            const cert = (fiel as any)._credential?.certificate?.();
            const isFiel = cert?.satType?.()?.isFiel?.() ?? true;
            const rfc = fiel.getRfc() || cert?.rfc?.() || "";
            const legalName = cert?.legalName?.() || "";
            const validTo = cert?.validTo?.();

            if (!isFiel) {
                return NextResponse.json({ 
                    error: `El certificado proporcionado (${rfc}) es un CSD (Certificado de Sello Digital) y no una e.firma (FIEL). Para descargar facturas del SAT se requiere la e.firma.` 
                }, { status: 400 });
            }

            const expDateStr = validTo 
                ? new Date(validTo).toLocaleDateString("es-MX", { 
                    day: "numeric", 
                    month: "long", 
                    year: "numeric", 
                    hour: "2-digit", 
                    minute: "2-digit",
                    timeZone: "America/Mexico_City"
                  }) 
                : "fecha no disponible";

            return NextResponse.json({ 
                error: `La e.firma (FIEL) de ${legalName ? `${legalName} ` : ""}(${rfc}) se encuentra vencida desde el ${expDateStr} (hora CDMX). Por favor renueva tu e.firma ante el SAT y actualiza los archivos en Configuración.` 
            }, { status: 400 });
        }

        const webClient = new HttpsWebClient();
        const requestBuilder = new FielRequestBuilder(fiel);
        const service = new Service(requestBuilder, webClient);

        // Obtener la hora actual exacta en la Ciudad de México
        const now = new Date();
        const mxTimeStr = now.toLocaleString("en-US", { timeZone: "America/Mexico_City" });
        const mxDate = new Date(mxTimeStr);
        // Restar 15 minutos para evitar problemas de desfase horario (Clock Drift) con los servidores del SAT
        mxDate.setMinutes(mxDate.getMinutes() - 15);
        
        const year = mxDate.getFullYear();
        const month = String(mxDate.getMonth() + 1).padStart(2, '0');
        const day = String(mxDate.getDate()).padStart(2, '0');
        const hours = String(mxDate.getHours()).padStart(2, '0');
        const minutes = String(mxDate.getMinutes()).padStart(2, '0');
        const seconds = String(mxDate.getSeconds()).padStart(2, '0');

        const end = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        const start = startDate ? `${startDate} 00:00:00` : `${year}-${month}-01 00:00:00`;

        const period = DateTimePeriod.createFromValues(start, end);
        
        const parameters = QueryParameters.create(
            period,
            new DownloadType('received'),
            new RequestType('xml')
        ).withDocumentStatus(new DocumentStatus('active'));

        const queryResult = await service.query(parameters);
        
        if (!queryResult.getStatus().isAccepted()) {
            const code = queryResult.getStatus().getCode();
            const message = queryResult.getStatus().getMessage();
            return NextResponse.json({ 
                error: `El SAT no aceptó la solicitud (${code}: ${message}).` 
            }, { status: 400 });
        }

        return NextResponse.json({ 
            requestId: queryResult.getRequestId(), 
            status: "accepted",
            start,
            end
        });

    } catch (error: any) {
        console.error("SAT Request Error:", error);
        return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
    }
}
