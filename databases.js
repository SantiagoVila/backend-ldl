const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4', // <-- ✅ ESTA LÍNEA ES LA CLAVE
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verificación opcional de la conexión
pool.getConnection()
    .then(connection => {
        console.log('Conectado a MySQL correctamente a través del pool.');
        connection.release();
    })
    .catch(err => {
        console.error('Error al conectar con MySQL a través del pool:', err);
    });

module.exports = pool;