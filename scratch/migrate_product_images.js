const fs = require('fs');
const path = require('path');
const os = require('os');

// Set DRY_RUN to false to write changes to Firestore, or true to preview them.
const DRY_RUN = process.argv.includes('--run') ? false : true;

async function run() {
  try {
    console.log(`=== Iniciando Migración de Fotos de Productos (DRY_RUN = ${DRY_RUN}) ===`);

    // 1. Cargar Variables de Entorno (.env.local)
    const envPath = path.resolve('.env.local');
    if (!fs.existsSync(envPath)) {
      console.error("No se encontró el archivo .env.local");
      return;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envVars = {};
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val.replace(/^["']|["']$/g, '');
      }
    });

    const BIND_API_KEY = envVars['BIND_ERP_API_KEY'];
    if (!BIND_API_KEY) {
      console.error("Falta BIND_ERP_API_KEY en .env.local");
      return;
    }

    // 2. Cargar token de Firebase
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
      console.error("No se encontró firebase-tools.json para la autenticación");
      return;
    }
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const accessToken = firebaseConfig.tokens?.access_token;
    if (!accessToken) {
      console.error("No se encontró token de acceso en firebase-tools.json");
      return;
    }

    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    // 3. Descargar productos de Bind ERP (Paginado)
    console.log("Descargando productos desde Bind ERP...");
    let bindProducts = [];
    let skip = 0;
    const top = 100;
    let keepFetching = true;

    while (keepFetching) {
      const url = `https://api.bind.com.mx/api/Products?$top=${top}&$skip=${skip}`;
      process.stdout.write(`Fetching Bind products (skip: ${skip})...\r`);
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BIND_API_KEY}`
        }
      });
      if (!res.ok) {
        console.error(`\nError fetching Bind products: ${res.status} ${res.statusText}`);
        break;
      }
      const data = await res.json();
      const items = data.value || [];
      if (items.length === 0) break;

      bindProducts = bindProducts.concat(items);
      skip += top;
      if (items.length < top) {
        keepFetching = false;
      }
    }
    console.log(`\nDescargados ${bindProducts.length} productos desde Bind ERP.`);

    // Filtrar los que sí tienen ImageUrl
    const bindWithImages = bindProducts.filter(p => p.ImageUrl && p.ImageUrl.trim());
    console.log(`De los cuales ${bindWithImages.length} tienen una URL de imagen configurada en Bind.`);

    if (bindWithImages.length === 0) {
      console.log("No hay productos con imágenes para migrar.");
      return;
    }

    // 4. Descargar productos de Firestore
    console.log("\nDescargando productos desde Firestore...");
    const queryRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}:runQuery`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{
            collectionId: "products",
            allDescendants: false
          }]
        }
      })
    });

    if (!queryRes.ok) {
      console.error("Error al descargar productos de Firestore:", await queryRes.text());
      return;
    }

    const firestoreData = await queryRes.json();
    const firestoreProducts = firestoreData.filter(p => p.document).map(p => p.document);
    console.log(`Encontrados ${firestoreProducts.length} productos en Firestore.`);

    // Crear mapa de Firestore por ID del documento (ID de Bind)
    const firestoreMap = {};
    firestoreProducts.forEach(doc => {
      const docId = doc.name.split('/').pop();
      firestoreMap[docId] = doc;
    });

    // 5. Comparar y procesar actualizaciones
    const updates = [];
    let alreadyHasImagesCount = 0;
    let notFoundCount = 0;

    for (const bindProd of bindWithImages) {
      const doc = firestoreMap[bindProd.ID];
      if (!doc) {
        notFoundCount++;
        continue;
      }

      const fields = doc.fields || {};
      const existingImages = fields.images?.arrayValue?.values || [];
      const currentImageUrl = fields.imageUrl?.stringValue || "";

      // Si ya tiene imágenes registradas en el arreglo images, lo omitimos para no pisar fotos manuales
      if (existingImages.length > 0) {
        alreadyHasImagesCount++;
        continue;
      }

      // Preparar campos actualizados
      const imageUrlVal = bindProd.ImageUrl.trim();
      const titleVal = fields.title?.stringValue || bindProd.Title || "Producto";

      const updatedFields = {
        imageUrl: { stringValue: imageUrlVal },
        images: {
          arrayValue: {
            values: [
              {
                mapValue: {
                  fields: {
                    id: { stringValue: 'bind-img' },
                    src: { stringValue: imageUrlVal },
                    altText: { stringValue: titleVal }
                  }
                }
              }
            ]
          }
        }
      };

      updates.push({
        name: doc.name,
        fields: updatedFields
      });
    }

    console.log(`\n--- Resumen de Comparación ---`);
    console.log(`- Total productos Bind con imagen: ${bindWithImages.length}`);
    console.log(`- No encontrados en Firestore: ${notFoundCount}`);
    console.log(`- Ya tienen imágenes en Firestore (omitidos): ${alreadyHasImagesCount}`);
    console.log(`- Pendientes de actualizar: ${updates.length}`);

    if (updates.length === 0) {
      console.log("\nNo hay actualizaciones por realizar.");
      return;
    }

    if (DRY_RUN) {
      console.log("\n[MODO SIMULACIÓN] Ejemplo de los primeros 3 cambios a realizar:");
      updates.slice(0, 3).forEach((up, idx) => {
        console.log(`\n${idx+1}. Documento: ${up.name}`);
        console.log(`   imageUrl: ${up.fields.imageUrl.stringValue}`);
        console.log(`   images: ${JSON.stringify(up.fields.images.arrayValue.values)}`);
      });
      console.log("\nPara ejecutar de verdad, corre el script con: node scratch/migrate_product_images.js --run");
      return;
    }

    // 6. Aplicar actualizaciones en lotes (batch) de 400
    console.log(`\nAplicando ${updates.length} actualizaciones en Firestore...`);
    const batchSize = 400;
    let batchCount = 0;
    let successCount = 0;

    for (let i = 0; i < updates.length; i += batchSize) {
      const chunk = updates.slice(i, i + batchSize);
      console.log(`Enviando lote ${++batchCount} (${chunk.length} productos)...`);

      const writes = chunk.map(up => {
        return {
          update: {
            name: up.name,
            fields: up.fields
          },
          updateMask: {
            fieldPaths: ["imageUrl", "images"]
          }
        };
      });

      const commitRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ writes })
      });

      if (!commitRes.ok) {
        console.error(`Error al aplicar lote ${batchCount}:`, await commitRes.text());
        return;
      }

      successCount += chunk.length;
      console.log(`Lote ${batchCount} completado con éxito.`);
    }

    console.log(`\n=============================================`);
    console.log(`¡MIGRACIÓN COMPLETADA CON ÉXITO!`);
    console.log(`Se actualizaron fotos para ${successCount} productos.`);
    console.log(`=============================================`);

  } catch (error) {
    console.error("Error en la ejecución:", error);
  }
}

run();
