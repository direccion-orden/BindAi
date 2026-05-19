const mqtt = require('mqtt');

const brokerUrl = 'mqtt://192.168.68.54:1883';

console.log(`Intentando conectar a MQTT en ${brokerUrl}...`);

const client = mqtt.connect(brokerUrl, {
  username: 'ApiUserOne',
  password: 'ApiPassword1',
  connectTimeout: 5000
});

client.on('connect', () => {
  console.log('✅ ¡CONEXIÓN MQTT EXITOSA!');
  
  // Nos suscribimos a todo (#) para espiar qué está transmitiendo
  client.subscribe('#', (err) => {
    if (!err) {
      console.log('Suscrito a todos los tópicos. Escuchando...');
    }
  });
});

client.on('message', (topic, message) => {
  console.log(`[${topic}]: ${message.toString()}`);
});

client.on('error', (err) => {
  console.log('❌ Error de conexión MQTT:', err.message);
  client.end();
});

client.on('offline', () => {
  console.log('❌ Cliente MQTT desconectado.');
  client.end();
});
