const db = require('../../databases');
const logger = require('../config/logger');
const { generarQueriesActualizacionTabla } = require('../services/ligas.service');
const fs = require('fs');
const path = require('path');

/**
 * Crea un nuevo partido (usado por el fixture o por un admin).
 */
exports.crearPartido = async (req, res) => {
    const { equipo_visitante_id, liga_id, fecha } = req.body;
    const equipo_local_id = req.usuario.equipo_id;
    const creado_por = req.usuario.id;

    if (!equipo_local_id || !equipo_visitante_id || !liga_id || !fecha) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {
        const sql = `
            INSERT INTO partidos (equipo_local_id, equipo_visitante_id, liga_id, fecha, creado_por)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [resultado] = await db.query(sql, [equipo_local_id, equipo_visitante_id, liga_id, fecha, creado_por]);
        res.status(201).json({ message: 'Partido creado correctamente', partido_id: resultado.insertId });
    } catch (error) {
        logger.error("Error en crearPartido:", { message: error.message, error });
        res.status(500).json({ error: 'Error al crear el partido' });
    }
};

/**
 * ✅ FUNCIÓN MEJORADA
 * Confirma o rechaza un partido pendiente.
 * Si se aprueba, actualiza la tabla de posiciones y CUMPLE las sanciones.
 */
exports.confirmarPartido = async (req, res) => {
    const { id: partidoId } = req.params;
    const { estado } = req.body; // 'aprobado' o 'rechazado'

    if (!['aprobado', 'rechazado'].includes(estado)) {
        return res.status(400).json({ error: 'El estado solo puede ser "aprobado" o "rechazado".' });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Obtenemos los datos del partido
        const [[partido]] = await connection.query('SELECT * FROM partidos WHERE id = ? AND estado = "pendiente"', [partidoId]);

        if (!partido) {
            await connection.rollback();
            return res.status(404).json({ error: 'Partido no encontrado o ya fue procesado.' });
        }

        // 2. Actualizamos el estado del partido
        await connection.query('UPDATE partidos SET estado = ? WHERE id = ?', [estado, partidoId]);

        // 3. Si se aprueba, ejecutamos la lógica adicional
        if (estado === 'aprobado') {
            // 3.1. Actualizar tabla de posiciones
            if (partido.liga_id && partido.goles_local != null && partido.goles_visitante != null) {
                const queries = generarQueriesActualizacionTabla(partido);
                for (const query of queries) {
                    await connection.query(query);
                }
            }

            // 3.2. ✅ LÓGICA PARA CUMPLIR SANCIONES
            const [jugadoresDelPartido] = await connection.query('SELECT DISTINCT jugador_id FROM estadisticas_jugadores_partido WHERE partido_id = ?', [partidoId]);
            const idsJugadores = jugadoresDelPartido.map(j => j.jugador_id);

            if (idsJugadores.length > 0) {
                const placeholders = idsJugadores.map(() => '?').join(',');
                const sqlSanciones = `
                    UPDATE sanciones 
                    SET partidos_cumplidos = partidos_cumplidos + 1 
                    WHERE jugador_id IN (${placeholders}) AND estado = 'activa'
                `;
                await connection.query(sqlSanciones, idsJugadores);

                // Marcamos como 'cumplida' las sanciones que ya llegaron al límite
                const sqlMarcarCumplidas = `
                    UPDATE sanciones
                    SET estado = 'cumplida'
                    WHERE estado = 'activa' AND partidos_cumplidos >= partidos_de_sancion
                `;
                await connection.query(sqlMarcarCumplidas);
                logger.info(`Sanciones actualizadas para el partido ID: ${partidoId}`);
            }
        }

        await connection.commit();
        res.json({ message: `Partido ${estado} con éxito.` });

    } catch (error) {
        await connection.rollback();
        logger.error(`Error en confirmarPartido: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al confirmar el partido.' });
    } finally {
        connection.release();
    }
};


/**
 * ✅ FUNCIÓN CORREGIDA Y FINAL
 * Un DT reporta el resultado de un partido jugado.
 */
exports.reportarResultado = async (req, res) => {
    const { id: partidoId } = req.params;
    // Con upload.any(), los campos de texto están en req.body
    const { goles_local, goles_visitante, jugadores } = req.body;
    // Y los archivos están en el array req.files
    const imagenPrueba = req.files && req.files.length > 0 ? req.files[0] : null;
    const equipo_id_dt = req.usuario.equipo_id;

    if (!goles_local || !goles_visitante) {
        return res.status(400).json({ error: 'Debes proporcionar los goles de ambos equipos.' });
    }
    if (!imagenPrueba) {
        return res.status(400).json({ error: 'Se requiere una imagen como prueba del resultado.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [[partido]] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [partidoId]);
        if (!partido) {
            await connection.rollback();
            return res.status(404).json({ error: 'Partido no encontrado.' });
        }
        if (partido.equipo_local_id !== equipo_id_dt) {
            await connection.rollback();
            return res.status(403).json({ error: 'Solo el DT del equipo local puede reportar el resultado.' });
        }
        if (partido.imagen_resultado_url) {
            await connection.rollback();
            return res.status(409).json({ error: 'Este partido ya tiene un resultado reportado.' });
        }

        const imageUrl = `/uploads/${imagenPrueba.filename}`;
        
        const sqlPartido = 'UPDATE partidos SET goles_local = ?, goles_visitante = ?, imagen_resultado_url = ? WHERE id = ?';
        await connection.query(sqlPartido, [goles_local, goles_visitante, imageUrl, partidoId]);
        
        if (jugadores) {
            const estadisticas = JSON.parse(jugadores);
            if (Array.isArray(estadisticas) && estadisticas.length > 0) {
                const values = estadisticas.map(j => [partidoId, j.jugador_id, j.equipo_id, j.goles || 0, j.asistencias || 0, 0, 0]);
                const sqlStats = `INSERT INTO estadisticas_jugadores_partido (partido_id, jugador_id, equipo_id, goles, asistencias, tarjetas_amarillas, tarjetas_rojas) VALUES ?`;
                await connection.query(sqlStats, [values]);
            }
        }
        
        await connection.commit();
        res.json({ message: 'Resultado y estadísticas reportados con éxito. Pendiente de aprobación.' });

    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en reportarResultado: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al reportar el resultado.' });
    } finally {
        if (connection) connection.release();
    }
};

// --- El resto de las funciones se mantienen como estaban ---

exports.obtenerPartidos = async (req, res) => {
    const { estado } = req.query;
    try {
        let sql = `
            SELECT 
                p.id, p.fecha, p.goles_local, p.goles_visitante, p.estado, p.imagen_resultado_url,
                el.nombre as nombre_local, ev.nombre as nombre_visitante
            FROM partidos p
            JOIN equipos AS el ON p.equipo_local_id = el.id
            JOIN equipos AS ev ON p.equipo_visitante_id = ev.id
        `;
        const params = [];
        if (estado) {
            sql += ' WHERE p.estado = ?';
            params.push(estado);
        }
        sql += ' ORDER BY p.fecha DESC';
        const [partidos] = await db.query(sql, params);
        res.json(partidos);
    } catch (error) {
        logger.error(`Error en obtenerPartidos: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los partidos' });
    }
};

exports.obtenerPartidosDT = async (req, res) => {
    const equipo_id = req.usuario.equipo_id;
    if (!equipo_id) return res.status(400).json({ error: 'No tienes un equipo asignado.' });
    try {
        const sql = `
            SELECT p.id, p.fecha, p.estado, p.goles_local, p.goles_visitante,
                   el.nombre as nombre_local, ev.nombre as nombre_visitante
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE (p.equipo_local_id = ? OR p.equipo_visitante_id = ?) 
            AND p.estado = 'pendiente' AND p.imagen_resultado_url IS NULL
            ORDER BY p.fecha ASC
        `;
        const [partidos] = await db.query(sql, [equipo_id, equipo_id]);
        res.json(partidos);
    } catch (error) {
        logger.error(`Error en obtenerPartidosDT: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los partidos del equipo.' });
    }
};

exports.obtenerPartidoPorId = async (req, res) => {
    const { id } = req.params;
    try {
        const sql = `
            SELECT p.id, p.fecha, p.estado, el.nombre as nombre_local, ev.nombre as nombre_visitante
            FROM partidos p
            JOIN equipos AS el ON p.equipo_local_id = el.id
            JOIN equipos AS ev ON p.equipo_visitante_id = ev.id
            WHERE p.id = ?
        `;
        const [[partido]] = await db.query(sql, [id]);
        if (!partido) {
            return res.status(404).json({ error: 'Partido no encontrado.' });
        }
        res.json(partido);
    } catch (error) {
        logger.error(`Error en obtenerPartidoPorId: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles del partido.' });
    }
};

// En: backend/src/controllers/partidos.controller.js
// Añade esta función al final del archivo

/**
 * ✅ NUEVA FUNCIÓN PÚBLICA
 * Obtiene los 5 partidos más recientes que hayan sido aprobados.
 */
exports.obtenerPartidosPublico = async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.id, p.fecha, p.goles_local, p.goles_visitante,
                el.nombre as nombre_local, ev.nombre as nombre_visitante
            FROM partidos p
            JOIN equipos AS el ON p.equipo_local_id = el.id
            JOIN equipos AS ev ON p.equipo_visitante_id = ev.id
            WHERE p.estado = 'aprobado'
            ORDER BY p.fecha DESC
            LIMIT 5
        `;
        const [partidos] = await db.query(sql);
        res.json(partidos);
    } catch (error) {
        logger.error(`Error en obtenerPartidosPublico: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los partidos recientes' });
    }
};

/**
 * ✅ NUEVA FUNCIÓN PÚBLICA
 * Obtiene los detalles completos de un partido, incluyendo goleadores y asistidores.
 */
exports.getPartidoPublico = async (req, res) => {
    const { id: partidoId } = req.params;

    try {
        // 1. Obtener información básica del partido (equipos, resultado, liga)
        const partidoQuery = db.query(`
            SELECT 
                p.id, p.fecha, p.goles_local, p.goles_visitante, p.estado,
                el.id as equipo_local_id, el.nombre as nombre_local,
                ev.id as equipo_visitante_id, ev.nombre as nombre_visitante,
                l.nombre as nombre_liga, l.id as liga_id
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            LEFT JOIN ligas l ON p.liga_id = l.id
            WHERE p.id = ? AND p.estado = 'aprobado'
        `, [partidoId]);

        // 2. Obtener las estadísticas individuales de todos los jugadores en ese partido
        const statsQuery = db.query(`
            SELECT 
                ejp.goles, ejp.asistencias,
                u.id as jugador_id, u.nombre_in_game,
                ejp.equipo_id
            FROM estadisticas_jugadores_partido ejp
            JOIN usuarios u ON ejp.jugador_id = u.id
            WHERE ejp.partido_id = ? AND (ejp.goles > 0 OR ejp.asistencias > 0)
        `, [partidoId]);

        // Ejecutamos ambas consultas en paralelo
        const [ [[partido]], [estadisticas] ] = await Promise.all([partidoQuery, statsQuery]);

        if (!partido) {
            return res.status(404).json({ error: 'Partido no encontrado o aún no ha sido aprobado.' });
        }

        // 3. Procesamos las estadísticas para separarlas por equipo
        const estadisticas_local = estadisticas.filter(stat => stat.equipo_id === partido.equipo_local_id);
        const estadisticas_visitante = estadisticas.filter(stat => stat.equipo_id === partido.equipo_visitante_id);

        // 4. Devolvemos un único objeto con toda la información
        res.json({
            ...partido,
            estadisticas_local,
            estadisticas_visitante
        });

    } catch (error) {
        logger.error(`Error en getPartidoPublico: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles del partido.' });
    }
};