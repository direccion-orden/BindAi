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
  imageUrl?: string | null;
  bindCurrentInventory: number;
  inventoryByWarehouse?: Record<string, number>;
  unit: string;
  tags?: string[];
  productType?: string;
  variants?: any[];
  images?: any[];
  isService?: boolean;
  bodyHtml?: string;
  hasMultipleVariants?: boolean;
};

export type CartItem = {
  key?: string;
  product: Product;
  quantity: number;
  discountPercentage: number;
  customPrice?: number;
  customDescription?: string;
};

import { Client } from "@/components/pos/ClientSelector";

export type POSAccount = {
  id: number;
  name: string;
  items: CartItem[];
  globalDiscountPercentage: number;
  globalDiscountType: 'percentage' | 'fixed';
  globalDiscountValue: number;
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
  removeItemFromCart: (keyOrSku: string) => void;
  updateItemQuantity: (keyOrSku: string, quantity: number) => void;
  updateItemDiscount: (keyOrSku: string, discount: number) => void;
  updateItemPrice: (keyOrSku: string, price: number) => void;
  updateItemDescription: (keyOrSku: string, description: string) => void;
  
  // Global Actions (apply to active account)
  setGlobalDiscount: (value: number, type?: 'percentage' | 'fixed') => void;
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
    { id: 1, name: "Cuenta 1", items: [], globalDiscountPercentage: 0, globalDiscountType: 'percentage', globalDiscountValue: 0, selectedClient: defaultClient, enteredPromoCode: null }
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
      const newAccount: POSAccount = { id: newId, name: `Cuenta ${newId}`, items: [], globalDiscountPercentage: 0, globalDiscountType: 'percentage', globalDiscountValue: 0, selectedClient: defaultClient, enteredPromoCode: null };
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
        ? { ...acc, items: [], globalDiscountPercentage: 0, globalDiscountType: 'percentage', globalDiscountValue: 0, selectedClient: defaultClient, enteredPromoCode: null }
        : acc
    ));
  };

  const setActiveAccount = (id: number) => setActiveAccountId(id);

  const addItemToCart = (product: Product) => {
    const isService = !!product.isService || product.sku?.startsWith("SER-");

    if (isService) {
      const newKey = crypto.randomUUID();
      updateActiveAccount({
        items: [...activeAccount.items, { key: newKey, product, quantity: 1, discountPercentage: 0 }]
      });
    } else {
      const existingItem = activeAccount.items.find(item => item.product.sku === product.sku);
      if (existingItem) {
        updateItemQuantity(existingItem.key || existingItem.product.sku, existingItem.quantity + 1);
      } else {
        const newKey = crypto.randomUUID();
        updateActiveAccount({
          items: [...activeAccount.items, { key: newKey, product, quantity: 1, discountPercentage: 0 }]
        });
      }
    }
  };

  const removeItemFromCart = (keyOrSku: string) => {
    updateActiveAccount({
      items: activeAccount.items.filter(item => !((item.key && item.key === keyOrSku) || (!item.key && item.product.sku === keyOrSku)))
    });
  };

  const updateItemQuantity = (keyOrSku: string, quantity: number) => {
    if (quantity <= 0) {
      removeItemFromCart(keyOrSku);
      return;
    }
    updateActiveAccount({
      items: activeAccount.items.map(item =>
        ((item.key && item.key === keyOrSku) || (!item.key && item.product.sku === keyOrSku))
          ? { ...item, quantity }
          : item
      )
    });
  };

  const updateItemDiscount = (keyOrSku: string, discount: number) => {
    updateActiveAccount({
      items: activeAccount.items.map(item =>
        ((item.key && item.key === keyOrSku) || (!item.key && item.product.sku === keyOrSku))
          ? { ...item, discountPercentage: discount }
          : item
      )
    });
  };

  const updateItemPrice = (keyOrSku: string, price: number) => {
    updateActiveAccount({
      items: activeAccount.items.map(item =>
        ((item.key && item.key === keyOrSku) || (!item.key && item.product.sku === keyOrSku))
          ? { ...item, customPrice: price }
          : item
      )
    });
  };

  const updateItemDescription = (keyOrSku: string, description: string) => {
    updateActiveAccount({
      items: activeAccount.items.map(item =>
        ((item.key && item.key === keyOrSku) || (!item.key && item.product.sku === keyOrSku))
          ? { ...item, customDescription: description }
          : item
      )
    });
  };

  const setGlobalDiscount = (value: number, type?: 'percentage' | 'fixed') => {
    const finalType = type || activeAccount.globalDiscountType || 'percentage';
    updateActiveAccount({
      globalDiscountValue: value,
      globalDiscountType: finalType,
      globalDiscountPercentage: finalType === 'percentage' ? value : 0
    });
  };
  const setPromoCode = (code: string | null) => updateActiveAccount({ enteredPromoCode: code });
  const setClient = (client: Client | null) => updateActiveAccount({ selectedClient: client });

  // Calculations for active account
  // Note: We need a price field on Product. Assuming product.cost is what we have for now, we should check Firestore.
  // Using cost as price temporarily until we verify.
  const getItemPrice = (item: CartItem) => item.customPrice !== undefined ? item.customPrice : (item.product.price || 0);

  // Engine Math
  const engineItems: EngineItem[] = activeAccount.items.map(i => ({
    id: i.product.id,
    quantity: i.quantity,
    unitPrice: getItemPrice(i),
    manualDiscountPercentage: i.discountPercentage,
    categoryIds: [
      ...(i.product.productType ? [i.product.productType] : []),
      ...(i.product.tags || [])
    ]
  }));

  const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;

  const totals = calculateOrderTotals(engineItems, availableDiscounts, activeAccount.enteredPromoCode);
  
  // Re-apply global manual discount (percentage or fixed amount) over engine's taxableSubtotal
  let finalTaxableSubtotal = totals.taxableSubtotal;
  let legacyGlobalDiscountValue = 0;
  
  const discountType = activeAccount.globalDiscountType || 'percentage';
  const discountVal = activeAccount.globalDiscountValue || 0;
  
  if (discountVal > 0) {
    if (discountType === 'percentage') {
      legacyGlobalDiscountValue = round2(finalTaxableSubtotal * (discountVal / 100));
    } else {
      // Fixed amount discount. Cap at taxable subtotal to prevent negative billing.
      legacyGlobalDiscountValue = round2(Math.min(discountVal, finalTaxableSubtotal));
    }
    finalTaxableSubtotal = round2(finalTaxableSubtotal - legacyGlobalDiscountValue);
  }
  
  const tax = round2(finalTaxableSubtotal * 0.16);
  const total = round2(finalTaxableSubtotal + tax);
  const totalDiscount = round2(totals.totalDiscount + legacyGlobalDiscountValue);

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
    updateItemPrice,
    updateItemDescription,
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
