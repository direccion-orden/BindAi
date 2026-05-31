const http = require('http');

function makeRequest(method, path, bodyData = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    body: data ? JSON.parse(data) : null
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (bodyData) {
            req.write(JSON.stringify(bodyData));
        }
        req.end();
    });
}

async function run() {
    console.log("=== PRUEBA DE SECUENCIA DE CANCELACIÓN Y CIERRE ===");

    // 1. Asegurar clean slate
    try {
        await makeRequest('POST', '/api/session', { request: 'CancelPayment' });
        await makeRequest('POST', '/api/session', { request: 'CloseSession' });
        console.log("Clean slate completo.");
    } catch(e) {}

    // 2. Iniciar sesión de pago
    console.log("\n[1/4] Iniciando cobro de prueba de $30.00...");
    const payRes = await makeRequest('POST', '/api/session', { request: 'PayAmount', value: 3000 });
    console.log("Cobro iniciado:", JSON.stringify(payRes.body));

    // Esperar 3 segundos con el cobro activo
    console.log("Esperando 3 segundos con la pantalla de cobro activa...");
    await new Promise(r => setTimeout(r, 3000));

    // 3. Cancelar el pago
    console.log("\n[2/4] Enviando CancelPayment...");
    const cancelTime = Date.now();
    const cancelRes = await makeRequest('POST', '/api/session', { request: 'CancelPayment' });
    console.log("CancelPayment respuesta:", JSON.stringify(cancelRes.body));

    // 4. Probar CloseSession con retraso progresivo si falla
    const delays = [0, 500, 1000, 1500, 2000];
    for (const delay of delays) {
        console.log(`\n[3/4] Esperando ${delay}ms para enviar CloseSession...`);
        await new Promise(r => setTimeout(r, delay));
        
        try {
            const closeRes = await makeRequest('POST', '/api/session', { request: 'CloseSession' });
            console.log(`CloseSession respuesta (Retraso: ${delay}ms):`, JSON.stringify(closeRes.body));
            if (closeRes.body && closeRes.body.responseData === "session closed") {
                console.log(`\n¡Éxito! El reciclador aceptó CloseSession con un retraso de ${delay}ms.`);
                break;
            }
        } catch (e) {
            console.error(`Fallo en CloseSession con retraso de ${delay}ms:`, e.message);
        }
    }

    // 5. Consultar estado final
    const finalRes = await makeRequest('GET', '/api/status');
    console.log("\n[4/4] Estado final del reciclador:", JSON.stringify(finalRes.body.events[finalRes.body.events.length - 1]));
}

run();
