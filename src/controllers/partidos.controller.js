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
 * ✅ v2.0
 * Recibe y procesa el reporte de un partido por parte de un DT.
 */
exports.crearReporte = async (req, res) => {
    const { tipo, partido_id } = req.params;
    const { goles_local_reportados, goles_visitante_reportados, jugadores } = req.body;
    const imagenPrueba = req.files && req.files.length > 0 ? req.files[0] : null;
    const equipo_reportador_id = req.usuario.equipo_id;

    if (!imagenPrueba || goles_local_reportados == null || goles_visitante_reportados == null) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (resultado, imagen de prueba).' });
    }

    const tablaPartido = tipo === 'liga' ? 'partidos' : 'partidos_copa';
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [[partidoInfo]] = await connection.query(`SELECT * FROM ${tablaPartido} WHERE id = ?`, [partido_id]);
        if (!partidoInfo) {
            await connection.rollback();
            return res.status(404).json({ error: 'Partido no encontrado.' });
        }
        if (partidoInfo.estado !== 'pendiente' || !['pendiente_reportes', 'reportado_parcialmente'].includes(partidoInfo.estado_reporte)) {
            await connection.rollback();
            return res.status(409).json({ error: 'Este partido no está pendiente de reporte.' });
        }
        if (partidoInfo.equipo_local_id !== equipo_reportador_id && partidoInfo.equipo_visitante_id !== equipo_reportador_id) {
            await connection.rollback();
            return res.status(403).json({ error: 'No tienes permiso para reportar este partido.' });
        }
        const [[reportePrevio]] = await connection.query('SELECT id FROM reportes_partidos WHERE partido_id = ? AND tipo_partido = ? AND equipo_reportador_id = ?', [partido_id, tipo, equipo_reportador_id]);
        if (reportePrevio) {
            await connection.rollback();
            return res.status(409).json({ error: 'Ya has enviado un reporte para este partido.' });
        }

        const imageUrl = `/uploads/${imagenPrueba.filename}`;
        const sqlInsertReporte = `
            INSERT INTO reportes_partidos (partido_id, tipo_partido, equipo_reportador_id, goles_local_reportados, goles_visitante_reportados, imagen_prueba_url)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [resultReporte] = await connection.query(sqlInsertReporte, [partido_id, tipo, equipo_reportador_id, goles_local_reportados, goles_visitante_reportados, imageUrl]);
        const nuevoReporteId = resultReporte.insertId;

        if (jugadores && jugadores.trim() !== '' && jugadores.trim() !== '[]') {
            const estadisticas = JSON.parse(jugadores);
            if (Array.isArray(estadisticas) && estadisticas.length > 0) {
                const values = estadisticas.map(j => [
                    tipo === 'liga' ? partido_id : null,
                    tipo === 'copa' ? partido_id : null,
                    j.jugador_id,
                    equipo_reportador_id,
                    j.goles || 0,
                    j.asistencias || 0,
                    0, 0, // tarjetas
                    nuevoReporteId
                ]);
                const sqlStats = `INSERT INTO estadisticas_jugadores_partido (partido_id, partido_copa_id, jugador_id, equipo_id, goles, asistencias, tarjetas_amarillas, tarjetas_rojas, reporte_id) VALUES ?`;
                await connection.query(sqlStats, [values]);
            }
        }

        const [reportesDelPartido] = await connection.query('SELECT * FROM reportes_partidos WHERE partido_id = ? AND tipo_partido = ?', [partido_id, tipo]);

        if (reportesDelPartido.length === 1) {
            await connection.query(`UPDATE ${tablaPartido} SET estado_reporte = 'reportado_parcialmente' WHERE id = ?`, [partido_id]);
        } else if (reportesDelPartido.length === 2) {
            const [reporteA, reporteB] = reportesDelPartido;
            if (reporteA.goles_local_reportados == reporteB.goles_local_reportados && reporteA.goles_visitante_reportados == reporteB.goles_visitante_reportados) {
                await connection.query(`UPDATE ${tablaPartido} SET estado = 'aprobado', estado_reporte = 'confirmado_auto' WHERE id = ?`, [partido_id]);
                if (tipo === 'liga' && partidoInfo.liga_id) {
                    const datosParaTabla = { ...partidoInfo, goles_local: reporteA.goles_local_reportados, goles_visitante: reporteA.goles_visitante_reportados };
                    const queries = generarQueriesActualizacionTabla(datosParaTabla);
                    for (const query of queries) await connection.query(query);
                }
            } else {
                await connection.query(`UPDATE ${tablaPartido} SET estado_reporte = 'en_disputa' WHERE id = ?`, [partido_id]);
            }
        }

        await connection.commit();
        res.status(201).json({ message: 'Reporte enviado con éxito.' });
    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en crearReporte: ${error.message}`, { error, partido_id });
        res.status(500).json({ error: 'Error en el servidor al procesar el reporte.' });
    } finally {
        if (connection) connection.release();
    }
};


/**
 * ✅ v2.0 - ANTES LLAMADA 'confirmarManualmente'
 * Permite a un Admin resolver una disputa o confirmar un reporte único.
 */
exports.resolverDisputa = async (req, res) => {
    const { partido_id } = req.params;
    const { reporte_ganador_id } = req.body;

    if (!reporte_ganador_id) {
        return res.status(400).json({ error: 'Se debe especificar un reporte ganador.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [[reporteGanador]] = await connection.query('SELECT * FROM reportes_partidos WHERE id = ? AND partido_id = ?', [reporte_ganador_id, partido_id]);
        if (!reporteGanador) {
            await connection.rollback();
            return res.status(404).json({ error: 'El reporte ganador seleccionado no es válido para este partido.' });
        }

        const tablaPartido = reporteGanador.tipo_partido === 'liga' ? 'partidos' : 'partidos_copa';
        const [[partidoInfo]] = await connection.query(`SELECT * FROM ${tablaPartido} WHERE id = ?`, [partido_id]);

        // LÓGICA MEJORADA: Acepta ambos casos
        if (!['en_disputa', 'reportado_parcialmente'].includes(partidoInfo.estado_reporte)) {
            await connection.rollback();
            return res.status(409).json({ error: 'Este partido no se puede confirmar manualmente.' });
        }

        await connection.query(`UPDATE ${tablaPartido} SET estado = 'aprobado', estado_reporte = 'confirmado_admin' WHERE id = ?`, [partido_id]);

        if (reporteGanador.tipo_partido === 'liga' && partidoInfo.liga_id) {
            const datosParaTabla = { ...partidoInfo, goles_local: reporteGanador.goles_local_reportados, goles_visitante: reporteGanador.goles_visitante_reportados };
            const queries = generarQueriesActualizacionTabla(datosParaTabla);
            for (const query of queries) await connection.query(query);
        }
        
        await connection.commit();
        res.json({ message: 'Partido confirmado manualmente por el administrador.' });
    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en resolverDisputa: ${error.message}`, { error, partido_id });
        res.status(500).json({ error: 'Error en el servidor al confirmar manualmente.' });
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

/**
 * 🟡 FUNCIÓN MODIFICADA v2.0
 * Busca partidos pendientes de ser reportados por el DT logueado.
 */
exports.obtenerPartidosDT = async (req, res) => {
    const equipo_id = req.usuario.equipo_id;
    if (!equipo_id) return res.status(400).json({ error: 'No tienes un equipo asignado.' });
    
    try {
        const sql = `
            (SELECT p.id, p.fecha, p.estado, p.estado_reporte, el.nombre as nombre_local, ev.nombre as nombre_visitante, 'liga' as tipo
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE 
                (p.equipo_local_id = ? OR p.equipo_visitante_id = ?) 
                AND p.estado = 'pendiente' 
                AND NOT EXISTS (
                    SELECT 1 FROM reportes_partidos rp 
                    WHERE rp.partido_id = p.id AND rp.tipo_partido = 'liga' AND rp.equipo_reportador_id = ?
                ))
            UNION
            (SELECT pc.id, pc.fecha, pc.estado, pc.estado_reporte, el.nombre as nombre_local, ev.nombre as nombre_visitante, 'copa' as tipo
            FROM partidos_copa pc
            JOIN equipos el ON pc.equipo_local_id = el.id
            JOIN equipos ev ON pc.equipo_visitante_id = ev.id
            WHERE 
                (pc.equipo_local_id = ? OR pc.equipo_visitante_id = ?) 
                AND pc.estado = 'pendiente'
                AND NOT EXISTS (
                    SELECT 1 FROM reportes_partidos rp 
                    WHERE rp.partido_id = pc.id AND rp.tipo_partido = 'copa' AND rp.equipo_reportador_id = ?
                ))
        `;
        const [partidos] = await db.query(sql, [equipo_id, equipo_id, equipo_id, equipo_id, equipo_id, equipo_id]);
        res.json(partidos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)));
    } catch (error) {
        logger.error(`Error en obtenerPartidosDT v2.0: ${error.message}`, { error });
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

exports.getPartidoParaReportar = async (req, res) => {
    const { tipo, id } = req.params;

    if (!['liga', 'copa'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo de partido inválido.' });
    }

    const tabla = tipo === 'liga' ? 'partidos' : 'partidos_copa';

    try {
        const sql = `
            SELECT p.id, p.fecha, p.estado, el.nombre as nombre_local, ev.nombre as nombre_visitante, '${tipo}' as tipo
            FROM ${tabla} p
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
        logger.error(`Error en getPartidoParaReportar: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles del partido.' });
    }
};