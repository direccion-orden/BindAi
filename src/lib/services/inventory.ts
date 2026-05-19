import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type InventoryTransactionType = 
  | 'RECEIPT' // Initial stock or Purchase Order receipt
  | 'SALE' // Point of Sale
  | 'TRANSFER_OUT' 
  | 'TRANSFER_IN' 
  | 'ADJUSTMENT' // Manual adjustment
  | 'COUNT'; // Cyclic or General count adjustment

export interface InventoryTransactionInput {
  companyId: string;
  type: InventoryTransactionType;
  productId: string;
  productName: string;
  warehouseId: string;
  quantity: number; // Positive for IN, Negative for OUT
  userId: string;
  userEmail: string;
  referenceId?: string; // Order ID, Sale ID, Transfer ID, etc.
  notes?: string;
}

export const logInventoryTransaction = async (tx: InventoryTransactionInput) => {
  try {
    const transactionsRef = collection(db, "companies", tx.companyId, "inventory_transactions");
    
    await addDoc(transactionsRef, {
      ...tx,
      createdAt: serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error("Error logging inventory transaction:", error);
    throw error;
  }
};
