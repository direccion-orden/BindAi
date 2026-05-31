const fs = require('fs');
const file = 'src/app/(dashboard)/productos/importar/page.tsx';
let c = fs.readFileSync(file, 'utf8');

const oldLogic = `            if (isPriceList) {
              // MODO LISTA DE PRECIOS
              const q = query(collection(db, "companies", companyId, "products"));
              const snapshot = await getDocs(q);
              const productMap = new Map();
              
              snapshot.docs.forEach(d => {
                const p = { id: d.id, ...d.data() };
                if (p.variants && p.variants[0]) {
                  if (p.variants[0].barcode) productMap.set(String(p.variants[0].barcode).trim(), p);
                  if (p.variants[0].sku) productMap.set(String(p.variants[0].sku).trim(), p);
                }
              });

              for (const record of records) {
                if (!record.Código) continue;
                const code = String(record.Código).trim();
                const product = productMap.get(code);
                if (!product) continue;

                const rawPrice = record["P-A"];
                if (!rawPrice) continue;
                const parsedPrice = parseFloat(String(rawPrice).replace(/[^0-9.-]+/g, ""));
                if (isNaN(parsedPrice)) continue;

                const updatedVariants = [...(product.variants || [])];
                if (updatedVariants.length > 0) {
                  updatedVariants[0] = { ...updatedVariants[0], price: parsedPrice };
                }
                
                currentBatch.update(doc(db, "companies", companyId, "products", product.id), {
                  variants: updatedVariants,
                  updatedAt: new Date()
                });

                count++;
                success++;
                if (count === 400) {
                  batches.push(currentBatch);
                  currentBatch = writeBatch(db);
                  count = 0;
                }
              }

            } else {
              // MODO PRODUCTOS NORMAL
              for (const record of records) {
                const productId = record.ID && record.ID.length > 20 ? record.ID : (record.Codigo || record.SKU);
                if (!productId) continue;

                const ref = doc(db, "companies", companyId, "products", productId);
                
                const title = record.Titulo || record.Codigo || "Sin título";
                const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                const cost = parseFloat(record.Costo) || 0;
                
                currentBatch.set(ref, {
                  title: title,
                  handle: handle,
                  bodyHtml: record.Descripcion || "",
                  vendor: "Bind ERP",
                  productType: record["Categoria 1"] || "",
                  status: 'ACTIVE',
                  tags: [record["Categoria 2"], record["Categoria 3"]].filter(Boolean),
                  currency: record.Moneda || "MXN",
                  cost: cost,
                  iva: record["Tipo de IVA."] ? parseFloat(record["Tipo de IVA."].replace("%", "")) : 0,
                  satProductCode: record["Clave CFDI"] || "",
                  satUnitCode: record["Unidad CFDI"] || "",
                  variants: [
                    {
                      id: \`var-\${productId}\`,
                      title: "Default Title",
                      price: cost, // Temporal, se sobreescribe con lista de precios
                      sku: record.SKU || record.Codigo || "",
                      barcode: record.Codigo || "",
                      inventoryQuantity: 0,
                      weight: parseFloat(record.Peso) || 0,
                    }
                  ],
                  options: [
                    { id: "opt-1", name: "Title", values: ["Default Title"] }
                  ],
                  images: [],
                  updatedAt: new Date()
                }, { merge: true });
                
                count++;
                success++;
                if (count === 400) {
                  batches.push(currentBatch);
                  currentBatch = writeBatch(db);
                  count = 0;
                }
              }
            }`;

const newLogic = `            // ALWAYS fetch products to prevent overwriting images and prices
            const q = query(collection(db, "companies", companyId, "products"));
            const snapshot = await getDocs(q);
            const productMap = new Map();
            const productByIdMap = new Map();
            
            snapshot.docs.forEach(d => {
              const p = { id: d.id, ...d.data() };
              productByIdMap.set(d.id, p);
              if (p.variants && p.variants[0]) {
                if (p.variants[0].barcode) productMap.set(String(p.variants[0].barcode).trim(), p);
                if (p.variants[0].sku) productMap.set(String(p.variants[0].sku).trim(), p);
              }
            });

            if (isPriceList) {
              // MODO LISTA DE PRECIOS
              for (const record of records) {
                if (!record.Código) continue;
                const code = String(record.Código).trim();
                const product = productMap.get(code);
                if (!product) continue;

                const rawPrice = record["P-A"];
                if (!rawPrice) continue;
                const parsedPrice = parseFloat(String(rawPrice).replace(/[^0-9.-]+/g, ""));
                if (isNaN(parsedPrice)) continue;

                const updatedVariants = [...(product.variants || [])];
                if (updatedVariants.length > 0) {
                  updatedVariants[0] = { ...updatedVariants[0], price: parsedPrice };
                }
                
                currentBatch.update(doc(db, "companies", companyId, "products", product.id), {
                  variants: updatedVariants,
                  updatedAt: new Date()
                });

                count++;
                success++;
                if (count === 400) {
                  batches.push(currentBatch);
                  currentBatch = writeBatch(db);
                  count = 0;
                }
              }

            } else {
              // MODO PRODUCTOS NORMAL
              for (const record of records) {
                const productId = record.ID && record.ID.length > 20 ? record.ID : (record.Codigo || record.SKU);
                if (!productId) continue;

                const existingProduct = productByIdMap.get(productId);
                
                const ref = doc(db, "companies", companyId, "products", productId);
                
                const title = record.Titulo || record.Codigo || "Sin título";
                const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                const cost = parseFloat(record.Costo) || 0;
                
                // Preserve existing data if present
                const existingImages = existingProduct?.images || [];
                const existingVariants = existingProduct?.variants || [];
                let variant = existingVariants.length > 0 ? { ...existingVariants[0] } : {
                  id: \`var-\${productId}\`,
                  title: "Default Title",
                  inventoryQuantity: 0,
                };
                
                variant.sku = record.SKU || record.Codigo || variant.sku || "";
                variant.barcode = record.Codigo || variant.barcode || "";
                variant.weight = parseFloat(record.Peso) || variant.weight || 0;
                // DO NOT overwrite price if it exists (price list handles it)
                variant.price = variant.price !== undefined ? variant.price : cost;

                currentBatch.set(ref, {
                  title: title,
                  handle: handle,
                  bodyHtml: record.Descripcion || existingProduct?.bodyHtml || "",
                  vendor: "Bind ERP",
                  productType: record["Categoria 1"] || existingProduct?.productType || "",
                  status: existingProduct?.status || 'ACTIVE',
                  tags: [record["Categoria 2"], record["Categoria 3"]].filter(Boolean),
                  currency: record.Moneda || "MXN",
                  cost: cost,
                  iva: record["Tipo de IVA."] ? parseFloat(record["Tipo de IVA."].replace("%", "")) : (existingProduct?.iva || 0),
                  satProductCode: record["Clave CFDI"] || existingProduct?.satProductCode || "",
                  satUnitCode: record["Unidad CFDI"] || existingProduct?.satUnitCode || "",
                  variants: [variant],
                  options: existingProduct?.options || [{ id: "opt-1", name: "Title", values: ["Default Title"] }],
                  images: existingImages, // PRESERVE IMAGES!
                  updatedAt: new Date()
                }, { merge: true });
                
                count++;
                success++;
                if (count === 400) {
                  batches.push(currentBatch);
                  currentBatch = writeBatch(db);
                  count = 0;
                }
              }
            }`;

c = c.replace(oldLogic, newLogic);
fs.writeFileSync(file, c, 'utf8');
console.log('Fixed overwriting behavior for images and prices in product bulk import');
