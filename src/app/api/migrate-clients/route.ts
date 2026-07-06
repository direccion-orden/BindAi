
import { db } from "../../../lib/firebase/client";
import { collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";
    const clientsRef = collection(db, "companies", companyId, "clients");
    const snapshot = await getDocs(clientsRef);
    
    console.log(`Encontrados ${snapshot.size} clientes para migrar.`);
    
    const batches: any[] = [];
    let currentBatch = writeBatch(db);
    let count = 0;
    let totalUpdated = 0;

    snapshot.forEach((clientDoc) => {
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
        currentBatch.update(doc(db, "companies", companyId, "clients", clientDoc.id), updates);
        count++;
        totalUpdated++;
        
        if (count === 450) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
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
      message: `Migración completada. Se actualizaron ${totalUpdated} clientes de un total de ${snapshot.size}.` 
    });

  } catch (error: any) {
    console.error("Error en migración:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
