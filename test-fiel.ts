import { adminDb } from "@/lib/firebase/admin";
import { Fiel } from "@nodecfdi/sat-ws-descarga-masiva";

async function test() {
    const satDoc = await adminDb.collection("companies").doc("test").collection("credentials").doc("sat").get();
    if (!satDoc.exists) {
        console.log("No sat doc");
        return;
    }
    const { cerBase64, keyBase64, password } = satDoc.data() as any;

    console.log("Password:", password);

    const cerContent = `-----BEGIN CERTIFICATE-----\n${cerBase64.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`;
    const keyContent = `-----BEGIN ENCRYPTED PRIVATE KEY-----\n${keyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END ENCRYPTED PRIVATE KEY-----\n`;

    try {
        const fiel = Fiel.create(cerContent, keyContent, password);
        console.log("Fiel created successfully!");
    } catch (e) {
        console.error("Fiel.create Error:", e.message);
    }
}

test();
