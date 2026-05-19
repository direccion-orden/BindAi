"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { calculateOrderTotals, EngineItem, EngineDiscount } from "@/lib/utils/discountEngine";

export type Product = {
  id: string;
  title: string;
  sku: string;
  code: string;
  cost: number;
  price: number; // We need to ensure we fetch price or use cost if price isn't there (Bind has PriceList but maybe cost is base?)
  // Actually, Bind products have a Cost, but the Price comes from PriceLists. Wait! Did we migrate prices?
  // Let's check what we migrated: cost: item.Cost. We didn't migrate Price!
  imageUrl: string | null;
  bindCurrentInventory: number;
  inventoryByWarehouse?: Record<string, number>;
  unit: string;
  tags?: string[];
  productType?: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
  discountPercentage: number;
};

import { Client } from "@/components/pos/ClientSelector";

export type POSAccount = {
  id: number;
  name: string;
  items: CartItem[];
  globalDiscountPercentage: number;
  selectedClient: Client | null;
  enteredPromoCode: string | null;
};

interface POSContextType {
  branchId: string;
  setBranchId: (id: string) => void;
  accounts: POSAccount[];
  activeAccountId: number;
  activeAccount: POSAccount;
  
  // Account Management
  addAccount: () => void;
  removeAccount: (id: number) => void;
  clearAccount: (id: number) => void;
  setActiveAccount: (id: number) => void;
  
  // Cart Actions (apply to active account)
  addItemToCart: (product: Product) => void;
  removeItemFromCart: (productId: string) => void;
  updateItemQuantity: (productId: string, quantity: number) => void;
  updateItemDiscount: (productId: string, discount: number) => void;
  
  // Global Actions (apply to active account)
  setGlobalDiscount: (discount: number) => void;
  setPromoCode: (code: string | null) => void;
  setClient: (client: Client | null) => void;
  
  // Settings
  cashMode: 'manual' | 'recycler';
  setCashMode: (mode: 'manual' | 'recycler') => void;

  // Calculated Totals (for active account)
  subtotal: number;
  totalDiscount: number;
  promoDiscountTotal: number;
  tax: number;
  total: number;
  appliedPromo: EngineDiscount | null;
  promoError?: string;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export function POSProvider({ children, companyId }: { children: ReactNode, companyId?: string }) {
  const [branchId, setBranchIdState] = useState<string>("");
  const [cashMode, setCashModeState] = useState<'manual' | 'recycler'>('manual');
  const [availableDiscounts, setAvailableDiscounts] = useState<EngineDiscount[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "discounts"), where("status", "==", "active"));
    const unsub = onSnapshot(q, snap => {
      setAvailableDiscounts(snap.docs.map(d => ({id: d.id, ...d.data()} as EngineDiscount)));
    });
    return () => unsub();
  }, [companyId]);

  React.useEffect(() => {
    // Cargar configuraciones desde localStorage al montar
    const savedBranch = localStorage.getItem("pos_branch_id");
    if (savedBranch) setBranchIdState(savedBranch);

    const savedCashMode = localStorage.getItem("pos_cash_mode") as 'manual' | 'recycler';
    if (savedCashMode) setCashModeState(savedCashMode);
  }, []);

  const setBranchId = (id: string) => {
    setBranchIdState(id);
    localStorage.setItem("pos_branch_id", id);
  };

  const setCashMode = (mode: 'manual' | 'recycler') => {
    setCashModeState(mode);
    localStorage.setItem("pos_cash_mode", mode);
  };

  const defaultClient: Client = {
    id: "public",
    name: "Público en General",
    rfc: "XAXX010101000",
    email: ""
  };

  const [accounts, setAccounts] = useState<POSAccount[]>([
    { id: 1, name: "Cuenta 1", items: [], globalDiscountPercentage: 0, selectedClient: defaultClient, enteredPromoCode: null }
  ]);
  const [activeAccountId, setActiveAccountId] = useState<number>(1);

  const activeAccount = accounts.find(a => a.id === activeAccountId) || accounts[0];

  const updateActiveAccount = (updates: Partial<POSAccount>) => {
    setAccounts(prev => prev.map(acc => acc.id === activeAccountId ? { ...acc, ...updates } : acc));
  };

  const addAccount = () => {
    const existingIds = accounts.map(a => a.id);
    let newId = 1;
    while (existingIds.includes(newId)) {
      newId++;
    }

    setAccounts(prev => {
      const newAccount: POSAccount = { id: newId, name: `Cuenta ${newId}`, items: [], globalDiscountPercentage: 0, selectedClient: defaultClient, enteredPromoCode: null };
      return [...prev, newAccount].sort((a, b) => a.id - b.id);
    });
    setActiveAccountId(newId);
  };

  const removeAccount = (id: number) => {
    if (accounts.length === 1) return; // Cannot remove the last account
    const newAccounts = accounts.filter(a => a.id !== id);
    setAccounts(newAccounts);
    if (activeAccountId === id) {
      setActiveAccountId(newAccounts[0].id);
    }
  };

  const clearAccount = (id: number) => {
    setAccounts(prev => prev.map(acc => 
      acc.id === id 
        ? { ...acc, items: [], globalDiscountPercentage: 0, selectedClient: defaultClient, enteredPromoCode: null }
        : acc
    ));
  };

  const setActiveAccount = (id: number) => setActiveAccountId(id);

  const addItemToCart = (product: Product) => {
    const existingItem = activeAccount.items.find(item => item.product.id === product.id);
    if (existingItem) {
      updateItemQuantity(product.id, existingItem.quantity + 1);
    } else {
      updateActiveAccount({ items: [...activeAccount.items, { product, quantity: 1, discountPercentage: 0 }] });
    }
  };

  const removeItemFromCart = (productId: string) => {
    updateActiveAccount({ items: activeAccount.items.filter(item => item.product.id !== productId) });
  };

  const updateItemQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItemFromCart(productId);
      return;
    }
    updateActiveAccount({
      items: activeAccount.items.map(item => item.product.id === productId ? { ...item, quantity } : item)
    });
  };

  const updateItemDiscount = (productId: string, discount: number) => {
    updateActiveAccount({
      items: activeAccount.items.map(item => item.product.id === productId ? { ...item, discountPercentage: discount } : item)
    });
  };

  const setGlobalDiscount = (discount: number) => updateActiveAccount({ globalDiscountPercentage: discount });
  const setPromoCode = (code: string | null) => updateActiveAccount({ enteredPromoCode: code });
  const setClient = (client: Client | null) => updateActiveAccount({ selectedClient: client });

  // Calculations for active account
  // Note: We need a price field on Product. Assuming product.cost is what we have for now, we should check Firestore.
  // Using cost as price temporarily until we verify.
  const getItemPrice = (product: Product) => product.price || 0;

  // Engine Math
  const engineItems: EngineItem[] = activeAccount.items.map(i => ({
    id: i.product.id,
    quantity: i.quantity,
    unitPrice: getItemPrice(i.product),
    manualDiscountPercentage: i.discountPercentage,
    categoryIds: [
      ...(i.product.productType ? [i.product.productType] : []),
      ...(i.product.tags || [])
    ]
  }));

  const totals = calculateOrderTotals(engineItems, availableDiscounts, activeAccount.enteredPromoCode);
  
  // Re-apply legacy global manual discount over engine's taxableSubtotal if they are still using that slider
  let finalTaxableSubtotal = totals.taxableSubtotal;
  let legacyGlobalDiscountValue = 0;
  if (activeAccount.globalDiscountPercentage > 0) {
     legacyGlobalDiscountValue = finalTaxableSubtotal * (activeAccount.globalDiscountPercentage / 100);
     finalTaxableSubtotal -= legacyGlobalDiscountValue;
  }
  
  const tax = finalTaxableSubtotal * 0.16;
  const total = finalTaxableSubtotal + tax;
  const totalDiscount = totals.totalDiscount + legacyGlobalDiscountValue;

  const value = {
    branchId,
    setBranchId,
    accounts,
    activeAccountId,
    activeAccount,
    addAccount,
    removeAccount,
    clearAccount,
    setActiveAccount,
    addItemToCart,
    removeItemFromCart,
    updateItemQuantity,
    updateItemDiscount,
    setGlobalDiscount,
    setPromoCode,
    setClient,
    cashMode,
    setCashMode,
    subtotal: totals.subtotal,
    totalDiscount: totalDiscount,
    promoDiscountTotal: totals.promoDiscountTotal,
    tax,
    total,
    appliedPromo: totals.appliedPromo || null,
    promoError: totals.error
  };

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
}

export function usePOS() {
  const context = useContext(POSContext);
  if (context === undefined) {
    throw new Error("usePOS must be used within a POSProvider");
  }
  return context;
}
