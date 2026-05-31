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
  promoDiscountTotal: number; // Discount from the promo codes/automatic rules
  totalDiscount: number; // itemDiscountsTotal + promoDiscountTotal
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
 * 2. Then, the engine looks at all automatic discounts + the optional entered promo code.
 * 3. It finds the *best* applicable discount (the one that gives the most savings) and applies ONLY that one. 
 *    (Cascading the global promo over the already manual-discounted subtotal).
 * 4. Calculates IVA (16%) on the final taxable subtotal.
 */
export function calculateOrderTotals(
  items: EngineItem[],
  availableDiscounts: EngineDiscount[],
  enteredPromoCode?: string | null
): DiscountEngineResult {
  // 1. Calculate Base Subtotals & Manual Discounts
  let subtotal = 0;
  let itemDiscountsTotal = 0;

  items.forEach(item => {
    const itemGross = item.unitPrice * item.quantity;
    const itemDiscount = itemGross * ((item.manualDiscountPercentage || 0) / 100);
    subtotal += itemGross;
    itemDiscountsTotal += itemDiscount;
  });

  const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;

  // 2. Filter Candidate Promos (Automatics + Valid Code)
  let candidatePromos: EngineDiscount[] = availableDiscounts.filter(d => d.method === "automatic");
  
  let codeError: string | undefined;
  
  if (enteredPromoCode) {
    const codePromo = availableDiscounts.find(
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
    // Check minimum requirements (evaluated against subtotalAfterItemDiscounts)
    if (promo.minRequirement?.type === "min_amount" && promo.minRequirement.value) {
      if (subtotalAfterItemDiscounts < promo.minRequirement.value) {
        if (promo.code?.toUpperCase() === enteredPromoCode?.toUpperCase()) {
          codeError = `El código requiere una compra mínima de $${promo.minRequirement.value}.`;
        }
        continue;
      }
    }

    let currentSavings = 0;

    if (promo.targetType === "order") {
      if (promo.type === "percentage") {
        currentSavings = subtotalAfterItemDiscounts * (promo.value / 100);
      } else if (promo.type === "fixed_amount") {
        currentSavings = Math.min(promo.value, subtotalAfterItemDiscounts); // Cant discount more than we have
      }
    } else if (promo.targetType === "specific_categories" && promo.targetIds && promo.targetIds.length > 0) {
      // Calculate eligible subtotal
      let eligibleSubtotal = 0;
      items.forEach(item => {
        // If the item belongs to any of the target categories (case insensitive)
        const isEligible = item.categoryIds?.some(id => 
          promo.targetIds!.some(tId => tId.trim().toLowerCase() === id.trim().toLowerCase())
        );
        if (isEligible) {
          const itemNet = (item.unitPrice * item.quantity) * (1 - (item.manualDiscountPercentage || 0) / 100);
          eligibleSubtotal += itemNet;
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

  const promoDiscountTotal = maxPromoSavings;
  const totalDiscount = itemDiscountsTotal + promoDiscountTotal;
  const taxableSubtotal = Math.max(0, subtotal - totalDiscount);
  const tax = taxableSubtotal * 0.16; // 16% IVA
  const total = taxableSubtotal + tax;

  // 4. Distribute discounts to items for CFDI/Invoice generation
  const processedItems = items.map(item => {
    const itemGross = item.unitPrice * item.quantity;
    const itemManualDiscount = itemGross * ((item.manualDiscountPercentage || 0) / 100);
    const itemNetBeforePromo = itemGross - itemManualDiscount;
    
    let itemPromoDiscount = 0;
    
    if (bestPromo && promoDiscountTotal > 0) {
      if (bestPromo.targetType === "order") {
        // Distribute proportionally based on itemNetBeforePromo / subtotalAfterItemDiscounts
        const ratio = subtotalAfterItemDiscounts > 0 ? (itemNetBeforePromo / subtotalAfterItemDiscounts) : 0;
        itemPromoDiscount = promoDiscountTotal * ratio;
      } else if (bestPromo.targetType === "specific_categories" && bestPromo.targetIds) {
        const isEligible = item.categoryIds?.some(id => 
          bestPromo?.targetIds!.some(tId => tId.trim().toLowerCase() === id.trim().toLowerCase())
        );
        if (isEligible) {
          // Calculate eligible subtotal to find ratio
          let eligibleSubtotal = 0;
          items.forEach(i => {
            if (i.categoryIds?.some(id => bestPromo?.targetIds!.some(tId => tId.trim().toLowerCase() === id.trim().toLowerCase()))) {
              eligibleSubtotal += (i.unitPrice * i.quantity) * (1 - (i.manualDiscountPercentage || 0) / 100);
            }
          });
          const ratio = eligibleSubtotal > 0 ? (itemNetBeforePromo / eligibleSubtotal) : 0;
          itemPromoDiscount = promoDiscountTotal * ratio;
        }
      }
    }

    return {
      ...item,
      finalDiscountAmt: itemManualDiscount + itemPromoDiscount,
      finalSubtotal: itemGross - (itemManualDiscount + itemPromoDiscount)
    };
  });

  return {
    subtotal,
    itemDiscountsTotal,
    subtotalAfterItemDiscounts,
    promoDiscountTotal,
    totalDiscount,
    taxableSubtotal,
    tax,
    total,
    appliedPromo: bestPromo,
    error: codeError,
    processedItems
  };
}
