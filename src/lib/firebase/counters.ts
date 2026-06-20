import { doc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export async function getNextSequence(companyId: string, type: 'cotizaciones' | 'pedidos' | 'remisiones' | 'facturas' | 'gastos'): Promise<string> {
  const counterRef = doc(db, "companies", companyId, "counters", "sequences");
  
  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    
    let currentVal = 0;
    if (counterDoc.exists() && counterDoc.data()[type] !== undefined) {
      currentVal = counterDoc.data()[type];
    }
    
    const nextVal = currentVal + 1;
    
    transaction.set(counterRef, {
      [type]: nextVal
    }, { merge: true });
    
    let prefix = 'DOC';
    if (type === 'cotizaciones') prefix = 'COT';
    if (type === 'pedidos') prefix = 'PED';
    if (type === 'remisiones') prefix = 'REM';
    if (type === 'facturas') prefix = 'FAC';
    if (type === 'gastos') prefix = 'GAS';
    
    return `${prefix}-${nextVal.toString().padStart(5, '0')}`;
  });
}
