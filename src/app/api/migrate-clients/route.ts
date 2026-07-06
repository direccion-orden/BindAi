
import { adminDb } from "../../../lib/firebase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    if (!adminDb) {
      throw new Error("Firebase Admin SDK no está configurado correctamente.");
    }

    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";
    const clientsRef = adminDb.collection("companies").doc(companyId).collection("clients");
    const snapshot = await clientsRef.get();
    
    console.log(`Encontrados ${snapshot.size} clientes para migrar con Admin SDK.`);
    
    const batches: any[] = [];
    let currentBatch = adminDb.batch();
    let count = 0;
    let totalUpdated = 0;

    snapshot.docs.forEach((clientDoc) => {
      const data = clientDoc.data();
      const updates: any = {};
      let changed = false;

      // Fields to uppercase
      const fields = ['name', 'firstName', 'paternalLastName', 'maternalLastName', 'razonSocial', 'commercialName', 'LegalName', 'CommercialName'];
      
      fields.forEach(field => {
        if (data[field] && typeof data[field] === 'string') {
          const upper = data[field].trim().toUpperCase();
          if (data[field] !== upper) {
            updates[field] = upper;
            changed = true;
          }
        }
      });

      if (changed) {
        currentBatch.update(clientDoc.ref, updates);
        count++;
        totalUpdated++;
        
        if (count === 450) {
          batches.push(currentBatch);
          currentBatch = adminDb.batch();
          count = 0;
        }
      }
    });

    if (count > 0) batches.push(currentBatch);

    for (const batch of batches) {
      await batch.commit();
    }

    return NextResponse.json({ 
      success: true, 
      message: `Migración completada exitosamente con Admin SDK. Se actualizaron ${totalUpdated} clientes de un total de ${snapshot.size}.` 
    });

  } catch (error: any) {
    console.error("Error en migración Admin:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
