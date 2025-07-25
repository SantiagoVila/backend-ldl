// En: backend/src/controllers/stats.controller.js

const db = require('../../databases');
const logger = require('../config/logger');

/**
 * Obtiene los rankings globales de goleadores y asistidores.
 */
exports.getLideresGlobales = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const goleadoresQuery = db.query(`
            SELECT 
                u.id as jugador_id, 
                u.nombre_in_game, 
                e.nombre as equipo_actual,
                SUM(es.goles) as total
            FROM estadisticas_jugadores_partido es
            JOIN usuarios u ON es.jugador_id = u.id
            LEFT JOIN equipos e ON u.equipo_id = e.id
            WHERE es.goles > 0
            GROUP BY es.jugador_id
            ORDER BY total DESC
            LIMIT ?
        `, [limit]);

        const asistidoresQuery = db.query(`
            SELECT 
                u.id as jugador_id, 
                u.nombre_in_game, 
                e.nombre as equipo_actual,
                SUM(es.asistencias) as total
            FROM estadisticas_jugadores_partido es
            JOIN usuarios u ON es.jugador_id = u.id
            LEFT JOIN equipos e ON u.equipo_id = e.id
            WHERE es.asistencias > 0
            GROUP BY es.jugador_id
            ORDER BY total DESC
            LIMIT ?
        `, [limit]);

        const [ [goleadores], [asistidores] ] = await Promise.all([goleadoresQuery, asistidoresQuery]);

        res.json({ goleadores, asistidores });

    } catch (error) {
        logger.error(`Error en getLideresGlobales: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los líderes de estadísticas.' });
    }
};

/**
 * ✅ NUEVA FUNCIÓN
 * Obtiene las últimas transferencias completadas (fichajes).
 */
exports.getUltimosFichajes = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5; // Por defecto, los últimos 5

        const sql = `
            SELECT 
                u.nombre_in_game as jugador_nombre,
                eo.nombre as equipo_origen,
                ed.nombre as equipo_destino,
                t.fecha_solicitud
            FROM transferencias t
            JOIN usuarios u ON t.jugador_id = u.id
            JOIN equipos ed ON t.equipo_destino_id = ed.id
            LEFT JOIN equipos eo ON t.equipo_origen_id = eo.id
            WHERE t.estado = 'aceptada'
            ORDER BY t.fecha_solicitud DESC
            LIMIT ?
        `;

        const [fichajes] = await db.query(sql, [limit]);
        res.json(fichajes);

    } catch (error) {
        logger.error(`Error en getUltimosFichajes: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los últimos fichajes.' });
    }
};
