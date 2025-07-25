// En: backend/src/config/mailer.js

const nodemailer = require('nodemailer');

// Creamos el objeto 'transporter' usando la configuración de tu .env
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// ✅ LÍNEA CRÍTICA: Asegúrate de que esta línea sea 'module.exports'
// Un error común es escribir 'module.export' (sin la 's'), lo que causa el fallo.
module.exports = transporter;