// src/helpers/notificaciones.helper.js
const db = require('../../databases');

/**
 * Inserta una notificación en la base de datos.
 * Es una función "dispara y olvida", pero con manejo de errores mejorado.
 */
exports.notificar = async (usuario_id, contenido, tipo = 'sistema') => {
    try {
        const sql = `
            INSERT INTO notificaciones (usuario_id, contenido, tipo)
            VALUES (?, ?, ?)
        `;
        await db.query(sql, [usuario_id, contenido, tipo]);
        // console.log(`Notificación enviada a usuario ${usuario_id}`); // Opcional: para debugging
    } catch (error) {
        console.error('Error al enviar notificación en el helper:', error);
    }
};