export interface EngineItem {
  id: string; // Product or variant ID
  quantity: number;
  unitPrice: number;
  manualDiscountPercentage: number; // The manual discount per line item (0-100)
  categoryIds?: string[]; // IDs of categories this product belongs to
}

export interface EngineDiscount {
  id: string;
  method: "code" | "automatic";
  code?: string | null;
  title?: string | null;
  type: "percentage" | "fixed_amount";
  value: number;
  targetType: "order" | "specific_categories";
  targetIds?: string[];
  minRequirement?: {
    type: "none" | "min_amount";
    value: number | null;
  };
}

export interface DiscountEngineResult {
  subtotal: number; // Sum of price * quantity
  itemDiscountsTotal: number; // Sum of manual line item discounts
  subtotalAfterItemDiscounts: number; // subtotal - itemDiscountsTotal
  globalDiscountTotal: number; // Manual global discount amount
  promoDiscountTotal: number; // Discount from the promo codes/automatic rules
  totalDiscount: number; // itemDiscountsTotal + globalDiscountTotal + promoDiscountTotal
  taxableSubtotal: number; // subtotal - totalDiscount
  tax: number; // 16% of taxableSubtotal
  total: number; // taxableSubtotal + tax
  appliedPromo?: EngineDiscount | null; // The promo that was effectively applied
  error?: string; // If a code was provided but invalid
  processedItems?: (EngineItem & { finalDiscountAmt: number, finalSubtotal: number })[];
}

/**
 * Core function to calculate totals and apply discounts.
 * 
 * Rules:
 * 1. Manual line item discounts are applied FIRST.
 * 2. Then, the manual global discount is applied.
 * 3. Then, the engine looks at all automatic discounts + the optional entered promo code.
 * 4. It finds the *best* applicable discount (the one that gives the most savings) and applies ONLY that one. 
 *    (Cascading the global promo over the already manual-discounted subtotal).
 * 5. Calculates IVA (16%) on the final taxable subtotal.
 */
export function calculateOrderTotals(
  items: EngineItem[],
  availableDiscounts: EngineDiscount[],
  enteredPromoCode?: string | null,
  globalDiscountType: "percentage" | "fixed_amount" | "none" = "none",
  globalDiscountValue: number = 0
): DiscountEngineResult {
  const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;

  // Convert items input to ex-VAT
  const itemsExVAT = items.map(item => ({
    ...item,
    unitPrice: item.unitPrice / 1.16
  }));

  // Convert fixed manual global discount to ex-VAT
  const globalDiscountValueExVAT = globalDiscountType === "fixed_amount"
    ? globalDiscountValue / 1.16
    : globalDiscountValue;

  // Convert fixed promo discounts and requirements to ex-VAT
  const availableDiscountsExVAT = availableDiscounts.map(d => {
    const minReq = d.minRequirement?.type === "min_amount" && d.minRequirement.value != null
      ? { ...d.minRequirement, value: d.minRequirement.value / 1.16 }
      : d.minRequirement;

    return {
      ...d,
      value: d.type === "fixed_amount" ? d.value / 1.16 : d.value,
      minRequirement: minReq
    };
  });

  // 1. Calculate Base Subtotals & Manual Discounts
  let subtotal = 0;
  let itemDiscountsTotal = 0;

  itemsExVAT.forEach(item => {
    const itemGross = item.unitPrice * item.quantity;
    const itemDiscount = itemGross * ((item.manualDiscountPercentage || 0) / 100);
    subtotal += itemGross;
    itemDiscountsTotal += itemDiscount;
  });

  subtotal = round2(subtotal);
  itemDiscountsTotal = round2(itemDiscountsTotal);
  const subtotalAfterItemDiscounts = round2(subtotal - itemDiscountsTotal);

  // Apply Manual Global Discount
  let globalDiscountTotal = 0;
  if (globalDiscountType === "percentage") {
    globalDiscountTotal = subtotalAfterItemDiscounts * (globalDiscountValueExVAT / 100);
  } else if (globalDiscountType === "fixed_amount") {
    globalDiscountTotal = Math.min(globalDiscountValueExVAT, subtotalAfterItemDiscounts);
  }
  globalDiscountTotal = round2(globalDiscountTotal);

  const subtotalAfterGlobal = round2(subtotalAfterItemDiscounts - globalDiscountTotal);

  // 2. Filter Candidate Promos (Automatics + Valid Code)
  let candidatePromos: EngineDiscount[] = availableDiscountsExVAT.filter(d => d.method === "automatic");
  
  let codeError: string | undefined;
  
  if (enteredPromoCode) {
    const codePromo = availableDiscountsExVAT.find(
      d => d.method === "code" && d.code?.toUpperCase() === enteredPromoCode.toUpperCase()
    );
    if (codePromo) {
      candidatePromos.push(codePromo);
    } else {
      codeError = "El código ingresado no existe o no está vigente.";
    }
  }

  // 3. Evaluate Promos and Find Best
  let bestPromo: EngineDiscount | null = null;
  let maxPromoSavings = 0;

  for (const promo of candidatePromos) {
    // Check minimum requirements (evaluated against subtotalAfterGlobal)
    if (promo.minRequirement?.type === "min_amount" && promo.minRequirement.value) {
      if (subtotalAfterGlobal < promo.minRequirement.value) {
        if (promo.code?.toUpperCase() === enteredPromoCode?.toUpperCase()) {
          const originalPromo = availableDiscounts.find(d => d.id === promo.id);
          const reqValue = originalPromo?.minRequirement?.value || (promo.minRequirement.value * 1.16);
          codeError = `El código requiere una compra mínima de $${round2(reqValue)}.`;
        }
        continue;
      }
    }

    let currentSavings = 0;

    if (promo.targetType === "order") {
      if (promo.type === "percentage") {
        currentSavings = subtotalAfterGlobal * (promo.value / 100);
      } else if (promo.type === "fixed_amount") {
        currentSavings = Math.min(promo.value, subtotalAfterGlobal); // Cant discount more than we have
      }
    } else if (promo.targetType === "specific_categories" && promo.targetIds && promo.targetIds.length > 0) {
      // Calculate eligible subtotal
      let eligibleSubtotal = 0;
      itemsExVAT.forEach(item => {
        // If the item belongs to any of the target categories (case insensitive)
        const isEligible = item.categoryIds?.some(id => 
          promo.targetIds!.some(tId => tId.trim().toLowerCase() === id.trim().toLowerCase())
        );
        if (isEligible) {
          const itemNetBeforeGlobal = (item.unitPrice * item.quantity) * (1 - (item.manualDiscountPercentage || 0) / 100);
          const itemGlobal = subtotalAfterItemDiscounts > 0 ? globalDiscountTotal * (itemNetBeforeGlobal / subtotalAfterItemDiscounts) : 0;
          eligibleSubtotal += (itemNetBeforeGlobal - itemGlobal);
        }
      });

      if (eligibleSubtotal > 0) {
        if (promo.type === "percentage") {
          currentSavings = eligibleSubtotal * (promo.value / 100);
        } else if (promo.type === "fixed_amount") {
          currentSavings = Math.min(promo.value, eligibleSubtotal);
        }
      } else {
         if (promo.code?.toUpperCase() === enteredPromoCode?.toUpperCase()) {
          codeError = `El código no aplica a los productos seleccionados.`;
        }
      }
    }

    if (currentSavings > maxPromoSavings) {
      maxPromoSavings = currentSavings;
      bestPromo = promo;
      // Clear error if the code was actually the best promo and applied successfully
      if (promo.code?.toUpperCase() === enteredPromoCode?.toUpperCase()) {
         codeError = undefined;
      }
    }
  }

  const promoDiscountTotal = round2(maxPromoSavings);
  const totalDiscount = round2(itemDiscountsTotal + globalDiscountTotal + promoDiscountTotal);
  const taxableSubtotal = round2(Math.max(0, subtotal - totalDiscount));
  const tax = round2(taxableSubtotal * 0.16); // 16% IVA
  const total = round2(taxableSubtotal + tax);

  // 4. Distribute discounts to items for CFDI/Invoice generation
  const processedItems = itemsExVAT.map(item => {
    const itemGross = item.unitPrice * item.quantity;
    const itemManualDiscount = itemGross * ((item.manualDiscountPercentage || 0) / 100);
    const itemNetBeforeGlobal = itemGross - itemManualDiscount;
    const itemGlobalDiscount = subtotalAfterItemDiscounts > 0 ? globalDiscountTotal * (itemNetBeforeGlobal / subtotalAfterItemDiscounts) : 0;
    const itemNetAfterGlobal = itemNetBeforeGlobal - itemGlobalDiscount;
    
    let itemPromoDiscount = 0;
    
    if (bestPromo && promoDiscountTotal > 0) {
      if (bestPromo.targetType === "order") {
        // Distribute proportionally based on itemNetAfterGlobal / subtotalAfterGlobal
        const ratio = subtotalAfterGlobal > 0 ? (itemNetAfterGlobal / subtotalAfterGlobal) : 0;
        itemPromoDiscount = promoDiscountTotal * ratio;
      } else if (bestPromo.targetType === "specific_categories" && bestPromo.targetIds) {
        const isEligible = item.categoryIds?.some(id => 
          bestPromo?.targetIds!.some(tId => tId.trim().toLowerCase() === id.trim().toLowerCase())
        );
        if (isEligible) {
          // Calculate eligible subtotal to find ratio
          let eligibleSubtotal = 0;
          itemsExVAT.forEach(i => {
            if (i.categoryIds?.some(id => bestPromo?.targetIds!.some(tId => tId.trim().toLowerCase() === id.trim().toLowerCase()))) {
              const iGross = i.unitPrice * i.quantity;
              const iManual = iGross * ((i.manualDiscountPercentage || 0) / 100);
              const iNetBeforeGlobal = iGross - iManual;
              const iGlobal = subtotalAfterItemDiscounts > 0 ? globalDiscountTotal * (iNetBeforeGlobal / subtotalAfterItemDiscounts) : 0;
              eligibleSubtotal += (iNetBeforeGlobal - iGlobal);
            }
          });
          const ratio = eligibleSubtotal > 0 ? (itemNetAfterGlobal / eligibleSubtotal) : 0;
          itemPromoDiscount = promoDiscountTotal * ratio;
        }
      }
    }

    return {
      ...item,
      finalDiscountAmt: round2(itemManualDiscount + itemGlobalDiscount + itemPromoDiscount),
      finalSubtotal: round2(itemGross - (itemManualDiscount + itemGlobalDiscount + itemPromoDiscount))
    };
  });

  const originalAppliedPromo = bestPromo
    ? availableDiscounts.find(d => d.id === bestPromo.id)
    : null;

  return {
    subtotal,
    itemDiscountsTotal,
    subtotalAfterItemDiscounts,
    globalDiscountTotal,
    promoDiscountTotal,
    totalDiscount,
    taxableSubtotal,
    tax,
    total,
    appliedPromo: originalAppliedPromo,
    error: codeError,
    processedItems
  };
}
