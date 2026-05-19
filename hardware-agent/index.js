require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();

// Permitir solicitudes CORS desde cualquier origen (ya que es un agente local)
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const RECYCLER_IP = process.env.RECYCLER_IP || '192.168.1.109';
const RECYCLER_PORT = process.env.RECYCLER_PORT || '44333';
const RECYCLER_PROTOCOL = process.env.RECYCLER_PROTOCOL || 'http';
const RECYCLER_USERNAME = process.env.RECYCLER_USERNAME || 'admin';
const RECYCLER_PASSWORD = process.env.RECYCLER_PASSWORD || 'password';

const BASE_URL = `${RECYCLER_PROTOCOL}://${RECYCLER_IP}:${RECYCLER_PORT}`;

// Agente HTTPS configurado para ignorar errores de certificados auto-firmados
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

let currentToken = null;

// Función para obtener el token del hardware
async function getToken() {
    console.log("[Hardware Agent] Authenticating with recycler...");
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'password');
        params.append('username', RECYCLER_USERNAME);
        params.append('password', RECYCLER_PASSWORD);

        const response = await axios.post(`${BASE_URL}/token`, params, {
            httpsAgent,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        if (response.data && response.data.access_token) {
            currentToken = response.data.access_token;
            console.log("[Hardware Agent] Authentication successful.");
            return currentToken;
        }
        throw new Error("No token in response");
    } catch (error) {
        console.error("[Hardware Agent] Error authenticating:", error.message);
        throw error;
    }
}

// Función middleware para envolver peticiones y reintentar si el token expira
async function makeRecyclerRequest(method, endpoint, data = null) {
    if (!currentToken) {
        await getToken();
    }
    
    const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers: {
            'Authorization': `Bearer ${currentToken}`
        }
    };
    
    if (BASE_URL.startsWith('https')) {
        config.httpsAgent = httpsAgent;
    }
    
    if (data && method !== 'GET') {
        config.data = data;
        config.headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log("[Hardware Agent] Token expired, refreshing...");
            await getToken();
            config.headers['Authorization'] = `Bearer ${currentToken}`;
            const retryResponse = await axios(config);
            return retryResponse.data;
        }
        throw error;
    }
}

// --- Endpoints del Agente Local ---

// GET /api/system - Devuelve la información del sistema del hardware
app.get('/api/system', async (req, res) => {
    try {
        const data = await makeRecyclerRequest('GET', '/system');
        res.json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message, details: error.response?.data });
    }
});

// GET /api/status - Devuelve el estado actual de los dispositivos y eventos
app.get('/api/status', async (req, res) => {
    try {
        const data = await makeRecyclerRequest('GET', '/status');
        res.json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message, details: error.response?.data });
    }
});

// POST /api/session - Inicia o detiene una sesión (ej. cobrar, cancelar, vaciar)
app.post('/api/session', async (req, res) => {
    try {
        const data = await makeRecyclerRequest('POST', '/session', req.body);
        res.json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message, details: error.response?.data });
    }
});

// GET /api/denomination - Obtener opciones de denominación (incluye floatLevel)
app.get('/api/denomination', async (req, res) => {
    try {
        const data = await makeRecyclerRequest('GET', '/denomination');
        res.json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message, details: error.response?.data });
    }
});

// POST /api/denomination - Modificar opciones de denominación
app.post('/api/denomination', async (req, res) => {
    try {
        const data = await makeRecyclerRequest('POST', '/denomination', req.body);
        res.json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message, details: error.response?.data });
    }
});

// Iniciar Servidor
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`[Hardware Agent] Started Successfully!`);
    console.log(`[Hardware Agent] Listening on http://localhost:${PORT}`);
    console.log(`[Hardware Agent] Bridging to Cash Recycler at ${BASE_URL}`);
    console.log(`========================================`);
});
