// src/controllers/ligas.controller.js

const db = require("../../databases");
const logger = require('../config/logger');

/**
 * Permite a un administrador crear una nueva liga.
 */
exports.crearLiga = async (req, res) => {
    const { nombre, temporada, categoria } = req.body;
    const admin_id = req.usuario.id;
    
    if (!nombre || !categoria) {
        return res.status(400).json({ msg: 'El nombre y la categoría de la liga son obligatorios' });
    }

    try {
        const sqlVerificar = `SELECT id FROM ligas WHERE nombre = ? AND temporada = ?`;
        const [ligasExistentes] = await db.query(sqlVerificar, [nombre, temporada || null]);

        if (ligasExistentes.length > 0) {
            return res.status(409).json({ error: 'Ya existe una liga con ese nombre para esa temporada.' });
        }

        const sqlInsertar = `INSERT INTO ligas (nombre, temporada, categoria, creada_por_admin_id) VALUES (?, ?, ?, ?)`;
        const [resultado] = await db.query(sqlInsertar, [nombre, temporada || null, categoria, admin_id]);

        const [[nuevaLiga]] = await db.query('SELECT * FROM ligas WHERE id = ?', [resultado.insertId]);
        res.status(201).json(nuevaLiga);

    } catch (error) {
        logger.error(`Error en crearLiga: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al crear la liga' });
    }
};

/**
 * Obtiene una lista de todas las ligas.
 */
exports.obtenerLigas = async (req, res) => {
    try {
        const [ligas] = await db.query('SELECT * FROM ligas ORDER BY fecha_creacion DESC');
        res.json(ligas);
    } catch (error) {
        logger.error(`Error en obtenerLigas: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener las ligas' });
    }
};

/**
 * Obtiene los detalles de una liga específica, incluyendo sus equipos (vista de admin).
 */
exports.obtenerLigaPorId = async (req, res) => {
    const { id } = req.params;
    try {
        const ligaQuery = db.query('SELECT * FROM ligas WHERE id = ?', [id]);
        const equiposQuery = db.query('SELECT id, nombre FROM equipos WHERE liga_id = ?', [id]);

        const [
            [[liga]],
            [equipos]
        ] = await Promise.all([ligaQuery, equiposQuery]);

        if (!liga) {
            return res.status(404).json({ error: 'Liga no encontrada' });
        }

        const resultado = { ...liga, equipos: equipos };
        res.json(resultado);

    } catch (error) {
        logger.error(`Error en obtenerLigaPorId: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles de la liga' });
    }
};

/**
 * Obtiene las estadísticas clave de una liga.
 */
exports.obtenerEstadisticasLiga = async (req, res) => {
    // ... (Esta función no necesita cambios)
    const { id } = req.params;
    try {
        const goleadoresQuery = db.query(`SELECT u.nombre_in_game, SUM(es.goles) as total FROM estadisticas_jugadores_partido es JOIN usuarios u ON es.jugador_id = u.id JOIN partidos p ON es.partido_id = p.id WHERE p.liga_id = ? AND es.goles > 0 GROUP BY es.jugador_id ORDER BY total DESC LIMIT 10`, [id]);
        const asistidoresQuery = db.query(`SELECT u.nombre_in_game, SUM(es.asistencias) as total FROM estadisticas_jugadores_partido es JOIN usuarios u ON es.jugador_id = u.id JOIN partidos p ON es.partido_id = p.id WHERE p.liga_id = ? AND es.asistencias > 0 GROUP BY es.jugador_id ORDER BY total DESC LIMIT 10`, [id]);
        const vallasInvictasQuery = db.query(`SELECT u.nombre_in_game, COUNT(p.id) as total FROM estadisticas_jugadores_partido es JOIN usuarios u ON es.jugador_id = u.id JOIN partidos p ON es.partido_id = p.id WHERE u.posicion = 'Arquero' AND p.liga_id = ? AND ((p.equipo_local_id = es.equipo_id AND p.goles_visitante = 0) OR (p.equipo_visitante_id = es.equipo_id AND p.goles_local = 0)) GROUP BY u.id ORDER BY total DESC LIMIT 5`, [id]);

        const [ [goleadores], [asistidores], [vallas_invictas] ] = await Promise.all([goleadoresQuery, asistidoresQuery, vallasInvictasQuery]);
        
        res.json({ goleadores, asistidores, vallas_invictas });
    } catch (error) {
        logger.error(`Error en obtenerEstadisticasLiga: ${error.message}`, { error });
        res.status(500).json({ error: "Error en el servidor al obtener las estadísticas de la liga." });
    }
};

exports.obtenerLigasPublico = async (req, res) => {
    try {
        const [ligas] = await db.query("SELECT id, nombre, temporada FROM ligas WHERE estado_temporada = 'activa' ORDER BY fecha_creacion DESC");
        res.json(ligas);
    } catch (error) {
        logger.error(`Error en obtenerLigasPublico: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener las ligas' });
    }
};

/**
 * ✅ FUNCIÓN CORREGIDA
 * Obtiene todos los detalles públicos de una liga para su página de perfil.
 */
exports.obtenerDetallesPublicosLiga = async (req, res) => {
    const { id } = req.params;
    try {
        const ligaQuery = db.query(`SELECT * FROM ligas WHERE id = ?`, [id]);
        
        // ✅ CORRECCIÓN: La consulta ahora se basa en la tabla 'equipos' y une las estadísticas
        // de 'tabla_posiciones'. Esto asegura que solo se muestren los equipos que REALMENTE
        // pertenecen a la liga. COALESCE se usa para mostrar 0 si un equipo aún no tiene estadísticas.
        const tablaQuery = db.query(`
            SELECT 
                e.id as equipo_id,
                e.nombre as equipo_nombre,
                COALESCE(tp.puntos, 0) as puntos,
                COALESCE(tp.partidos_jugados, 0) as partidos_jugados,
                COALESCE(tp.partidos_ganados, 0) as partidos_ganados,
                COALESCE(tp.partidos_empatados, 0) as partidos_empatados,
                COALESCE(tp.partidos_perdidos, 0) as partidos_perdidos,
                COALESCE(tp.goles_a_favor, 0) as goles_a_favor,
                COALESCE(tp.goles_en_contra, 0) as goles_en_contra,
                COALESCE(tp.diferencia_goles, 0) as diferencia_goles
            FROM equipos e
            LEFT JOIN tabla_posiciones tp ON e.id = tp.equipo_id AND e.liga_id = tp.liga_id
            WHERE e.liga_id = ?
            ORDER BY puntos DESC, diferencia_goles DESC, goles_a_favor DESC
        `, [id]);

        const fixtureQuery = db.query(`
            SELECT 
                p.id, p.jornada, p.fecha, p.estado,
                p.goles_local, p.goles_visitante,
                el.nombre as nombre_local,
                ev.nombre as nombre_visitante
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.liga_id = ?
            ORDER BY p.jornada ASC, p.fecha ASC
        `, [id]);

        const [
            [[liga]],
            [tabla],
            [fixture]
        ] = await Promise.all([ligaQuery, tablaQuery, fixtureQuery]);

        if (!liga) {
            return res.status(404).json({ error: 'Liga no encontrada' });
        }

        res.json({
            ...liga,
            tabla_posiciones: tabla,
            fixture: fixture
        });

    } catch (error) {
        logger.error(`Error en obtenerDetallesPublicosLiga: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles de la liga.' });
    }
};
