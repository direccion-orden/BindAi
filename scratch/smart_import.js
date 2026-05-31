const fs = require('fs');
const file = 'src/app/(dashboard)/productos/importar/page.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  'import { collection, query, doc, writeBatch } from "firebase/firestore";',
  'import { collection, query, doc, writeBatch, getDocs } from "firebase/firestore";'
);

const oldLogic = `complete: async (results: any) => {
          try {
            const records = results.data;
            const batches = [];
            let currentBatch = writeBatch(db);
            let count = 0;
            let success = 0;
            
            for (const record of records) {
              const productId = record.ID && record.ID.length > 20 ? record.ID : (record.Codigo || record.SKU);
              if (!productId) continue;

              const ref = doc(db, "companies", companyId, "products", productId);
              
              const title = record.Titulo || record.Codigo || "Sin título";
              const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
              const price = parseFloat(record.Costo) || 0; // Costo or create a rule
              
              currentBatch.set(ref, {
                title: title,
                handle: handle,
                bodyHtml: record.Descripcion || "",
                vendor: "Bind ERP",
                productType: record["Categoria 1"] || "",
                status: 'ACTIVE',
                tags: [record["Categoria 2"], record["Categoria 3"]].filter(Boolean),
                currency: record.Moneda || "MXN",
                cost: parseFloat(record.Costo) || 0,
                iva: record["Tipo de IVA."] ? parseFloat(record["Tipo de IVA."].replace("%", "")) : 0,
                variants: [
                  {
                    id: \`var-\${productId}\`,
                    title: "Default Title",
                    price: price, // Placeholder, usually selling price is different from cost
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
            if (count > 0) batches.push(currentBatch);
            
            for (const b of batches) {
              await b.commit();
            }
            
            setSuccessCount(success);
            setIsDone(true);
          } catch (error) {
            console.error(error);
            setErrorCount(1);
          } finally {
            setLoading(false);
          }`;

const newLogic = `complete: async (results: any) => {
          try {
            const records = results.data;
            if (!records || records.length === 0) throw new Error("Archivo vacío");

            const isPriceList = records[0].hasOwnProperty("P-A") && records[0].hasOwnProperty("Código");
            
            const batches = [];
            let currentBatch = writeBatch(db);
            let count = 0;
            let success = 0;

            if (isPriceList) {
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
            }

            if (count > 0) batches.push(currentBatch);
            for (const b of batches) {
              await b.commit();
            }
            
            setSuccessCount(success);
            setIsDone(true);
          } catch (error) {
            console.error(error);
            setErrorCount(1);
          } finally {
            setLoading(false);
          }`;

c = c.replace(oldLogic, newLogic);
fs.writeFileSync(file, c, 'utf8');
console.log('Fixed CSV importer to support smart price list import');
