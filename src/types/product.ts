export interface ShopifyProductOption {
  name: string;
  values: string[];
}

export interface ShopifyProductVariant {
  id: string; // Typically a generated ID
  title: string; // e.g. "Red / Small"
  price: number;
  sku: string;
  position: number;
  compareAtPrice: number | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  taxable: boolean;
  barcode: string;
  weight: number;
  weightUnit: 'kg' | 'g' | 'lb' | 'oz';
  cost?: number;
  inventoryByWarehouse?: Record<string, number>; // Maps warehouseId -> quantity
  inventoryQuantity?: number;
  stock?: number;
  // Firestore specific to track creation/updates
  createdAt?: any;
  updatedAt?: any;
  ddmrp?: {
    isDecoupled: boolean;
    leadTimeDays: number;
    variabilityFactor: number; // 0.2 to 0.8
    moq: number;
  };
}

export interface ShopifyProductImage {
  id: string;
  src?: string;
  alt?: string | null;
  altText?: string;
  position?: number;
}

export interface ShopifyProduct {
  id: string; // Firestore document ID
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  handle: string; // URL slug
  tags: string[];
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  options: ShopifyProductOption[];
  variants: ShopifyProductVariant[];
  images: ShopifyProductImage[];
  // Firestore specific
  inventoryRole?: 'PRODUCTO' | 'MATERIA_PRIMA' | 'AMBOS';
  satProductCode?: string;
  satProductName?: string;
  satUnitCode?: string;
  satUnitName?: string;
  categoryId?: string;
  vendorId?: string;
  initialCost?: number;
  cost?: number;
  createdAt?: any;
  updatedAt?: any;
}
