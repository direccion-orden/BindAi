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
                    headers: res.headers,
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
    console.log("=== DIAGNÓSTICO Y LIMPIEZA DE SESIÓN DEL RECICLADOR ===");
    
    // 1. Obtener estado actual
    try {
        console.log("\n[1/3] Consultando estado del agente local (/api/status)...");
        const statusRes = await makeRequest('GET', '/api/status');
        console.log(`Respuesta (Código: ${statusRes.statusCode}):`);
        console.log(JSON.stringify(statusRes.body, null, 2));
    } catch (e) {
        console.error("Error al conectar con el agente local:", e.message);
        console.log("Asegúrate de que el agente local esté corriendo en el puerto 3001.");
        return;
    }

    // 2. Enviar CancelPayment para limpiar
    try {
        console.log("\n[2/3] Enviando petición 'CancelPayment' para liberar sesión...");
        const cancelRes = await makeRequest('POST', '/api/session', { request: 'CancelPayment' });
        console.log(`Respuesta (Código: ${cancelRes.statusCode}):`);
        console.log(JSON.stringify(cancelRes.body, null, 2));
    } catch (e) {
        console.error("Error al enviar CancelPayment:", e.message);
    }

    // 3. Enviar CloseSession por si acaso
    try {
        console.log("\n[3/3] Enviando petición 'CloseSession' para cerrar sesión por completo...");
        const closeRes = await makeRequest('POST', '/api/session', { request: 'CloseSession' });
        console.log(`Respuesta (Código: ${closeRes.statusCode}):`);
        console.log(JSON.stringify(closeRes.body, null, 2));
    } catch (e) {
        console.error("Error al enviar CloseSession:", e.message);
    }

    // 4. Obtener estado final
    try {
        console.log("\n[4/4] Consultando estado final (/api/status)...");
        const statusRes = await makeRequest('GET', '/api/status');
        console.log(`Estado final (Código: ${statusRes.statusCode}):`);
        console.log(JSON.stringify(statusRes.body, null, 2));
    } catch (e) {
        console.error("Error final:", e.message);
    }
}

run();
