// src/middleware/auth.middleware.js  (Recomiendo renombrar la carpeta a 'middleware')
const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Token no proporcionado o con formato incorrecto" });
    }

    const token = authHeader.split(' ')[1]; // O .substring(7)

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = decoded; // Adjuntamos el payload decodificado
        next(); // El token es válido, continuamos
    } catch (error) {
        // El token es inválido (expirado, malformado, etc.)
        return res.status(403).json({ error: "Token inválido o expirado" });
    }
};

module.exports = verificarToken;