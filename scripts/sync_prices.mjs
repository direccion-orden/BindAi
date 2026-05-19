import fetch from 'node-fetch';
import fs from 'fs';
import admin from 'firebase-admin';

// Initialize Firebase Admin
const serviceAccountPath = 'c:\\Users\\Elitebook 840 G11\\.gemini\\antigravity\\playground\\rogue-tyson\\serviceAccountKey.json';
if (!fs.existsSync(serviceAccountPath)) {
    console.error("Error: Se necesita el archivo serviceAccountKey.json para correr este script.");
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Bind ERP Auth
const envContent = fs.readFileSync('c:\\Users\\Elitebook 840 G11\\.gemini\\antigravity\\playground\\rogue-tyson\\.env.local', 'utf-8');
const apiKeyLine = envContent.split('\n').find(l => l.startsWith('BIND_ERP_API_KEY='));
const apiKey = apiKeyLine ? apiKeyLine.split('=')[1].trim() : '';
const API_BASE = "https://api.bind.com.mx/api";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncPrices() {
    console.log("Iniciando sincronización de precios desde Bind ERP...");
    
    // Obtener todos los productos de Firebase que no tengan precio
    const snapshot = await db.collection('products').get();
    const products = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        // Sincronizar incluso si tienen precio por si acaso, o solo los que no tienen
        if (data.price === undefined || data.price === null || data.price === 0) {
            products.push({ id: doc.id, bindId: data.id });
        }
    });

    console.log(`Se encontraron ${products.length} productos en Firebase sin precio asignado.`);

    let successCount = 0;
    
    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        try {
            console.log(`[${i+1}/${products.length}] Consultando precio para Bind ID: ${product.bindId}`);
            const res = await fetch(`${API_BASE}/Products/${product.bindId}`, { headers });
            
            if (!res.ok) {
                console.error(`Error al consultar ${product.bindId}: ${res.statusText}`);
                continue;
            }

            const data = await res.json();
            
            // Extraer el precio de la primera lista de precios o la lista general
            let price = 0;
            if (data.Prices && data.Prices.Items && data.Prices.Items.length > 0) {
                // Tomar el precio de la Lista A (o el primero que exista mayor a 0)
                const validPrice = data.Prices.Items.find(p => p.Price > 0);
                price = validPrice ? validPrice.Price : data.Prices.Items[0].Price;
            }

            if (price > 0) {
                await db.collection('products').doc(product.id).update({ price: price });
                console.log(`✅ Precio actualizado: $${price}`);
                successCount++;
            } else {
                console.log(`⚠️ Producto sin precio definido en Bind ERP`);
            }

        } catch (error) {
            console.error(`Error procesando ${product.bindId}:`, error.message);
        }

        // Evitar rate limiting de Bind ERP (3 solicitudes por segundo recomendado)
        await delay(350); 
    }

    console.log(`\n¡Proceso Terminado! Se actualizaron ${successCount} precios exitosamente.`);
}

syncPrices().catch(console.error);
