const db = require('../../databases');
const logger = require('../config/logger');
const { generarQueriesActualizacionTabla } = require('../services/ligas.service');

// =================================================================================
// SECCIÓN 1: LÓGICA DE REPORTE DUAL (v2.0)
// =================================================================================

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
                    // ✅ CORRECCIÓN: Bucle actualizado para consultas parametrizadas
                    for (const q of queries) {
                        await connection.query(q.sql, q.values);
                    }
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
 * ✅ FUNCIÓN CORREGIDA FINAL (v4.0)
 * Diseñada para la ruta '/admin/resolver/:tipo/:id'
 */
exports.resolverDisputa = async (req, res) => {
    // Leemos los parámetros correctos de la ruta que definimos
    const { tipo, id: partido_id } = req.params; 
    const { reporte_ganador_id } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const tablaPartido = tipo === 'liga' ? 'partidos' : 'partidos_copa';

        const [[partidoInfo]] = await connection.query(`SELECT * FROM ${tablaPartido} WHERE id = ?`, [partido_id]);

        if (!partidoInfo) {
            await connection.rollback();
            return res.status(404).json({ error: 'Partido no encontrado.' });
        }

        if (!['en_disputa', 'reportado_parcialmente'].includes(partidoInfo.estado_reporte)) {
            await connection.rollback();
            return res.status(409).json({ error: 'Este partido no está en un estado que permita confirmación manual.' });
        }

        let reporteGanador;

        if (partidoInfo.estado_reporte === 'reportado_parcialmente') {
            const [[reporteUnico]] = await connection.query('SELECT * FROM reportes_partidos WHERE partido_id = ? AND tipo_partido = ?', [partido_id, tipo]);
            if (!reporteUnico) {
                await connection.rollback();
                return res.status(404).json({ error: 'No se encontró el reporte único para este partido. Contacte a soporte.' });
            }
            reporteGanador = reporteUnico;

        } else if (partidoInfo.estado_reporte === 'en_disputa') {
            if (!reporte_ganador_id) {
                await connection.rollback();
                return res.status(400).json({ error: 'Para resolver una disputa, se debe especificar un reporte ganador.' });
            }
            const [[reporteSeleccionado]] = await connection.query('SELECT * FROM reportes_partidos WHERE id = ? AND partido_id = ?', [reporte_ganador_id, partido_id]);
            if (!reporteSeleccionado) {
                await connection.rollback();
                return res.status(404).json({ error: 'El reporte ganador seleccionado no es válido para este partido.' });
            }
            reporteGanador = reporteSeleccionado;
        }
        
        await connection.query(`UPDATE ${tablaPartido} SET estado = 'aprobado', goles_local = ?, goles_visitante = ?, estado_reporte = 'confirmado_admin' WHERE id = ?`, 
            [reporteGanador.goles_local_reportados, reporteGanador.goles_visitante_reportados, partido_id]);

        if (tipo === 'liga' && partidoInfo.liga_id) {
            const datosParaTabla = { 
                ...partidoInfo, 
                goles_local: reporteGanador.goles_local_reportados, 
                goles_visitante: reporteGanador.goles_visitante_reportados 
            };
            const queries = generarQueriesActualizacionTabla(datosParaTabla);
            for (const q of queries) {
                await connection.query(q.sql, q.values);
            }
        }
        
        await connection.commit();
        res.json({ message: 'Partido confirmado manualmente por el administrador.' });

    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en resolverDisputa v4.0: ${error.message}`, { error, partido_id });
        res.status(500).json({ error: 'Error en el servidor al confirmar manualmente.' });
    } finally {
        if (connection) connection.release();
    }
};

// =================================================================================
// SECCIÓN 2: FUNCIONES DE CONSULTA (GET)
// =================================================================================

/**
 * ✅ FUNCIÓN CORREGIDA v2.5
 * Obtiene los partidos que requieren atención del admin de forma más robusta.
 */
exports.obtenerPartidosParaRevision = async (req, res) => {
    try {
        const sqlLiga = `
            SELECT 
                p.id, p.fecha, p.estado_reporte, 
                el.nombre as nombre_local, ev.nombre as nombre_visitante, 
                'liga' as tipo
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.estado_reporte IN ('en_disputa', 'reportado_parcialmente')
        `;
        const [partidosLiga] = await db.query(sqlLiga);

        const sqlCopa = `
            SELECT 
                pc.id, pc.fecha, pc.estado_reporte, 
                el.nombre as nombre_local, ev.nombre as nombre_visitante, 
                'copa' as tipo
            FROM partidos_copa pc
            JOIN equipos el ON pc.equipo_local_id = el.id
            JOIN equipos ev ON pc.equipo_visitante_id = ev.id
            WHERE pc.estado_reporte IN ('en_disputa', 'reportado_parcialmente')
        `;
        const [partidosCopa] = await db.query(sqlCopa);

        const partidos = [...partidosLiga, ...partidosCopa];

        const partidosConReportes = await Promise.all(partidos.map(async (partido) => {
            const [reportes] = await db.query(
                'SELECT * FROM reportes_partidos WHERE partido_id = ? AND tipo_partido = ? ORDER BY fecha_reporte ASC', 
                [partido.id, partido.tipo]
            );
            return { ...partido, reportes };
        }));

        res.json(partidosConReportes);

    } catch (error) {
        logger.error(`Error en obtenerPartidosParaRevision: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los partidos para revisión.' });
    }
};
/**
 * ✅ FUNCIÓN CORREGIDA v2.2
 * Busca partidos pendientes de ser reportados por el DT logueado usando una consulta más robusta.
 */
exports.obtenerPartidosDT = async (req, res) => {
    const equipo_id = req.usuario.equipo_id;
    if (!equipo_id) return res.status(400).json({ error: 'No tienes un equipo asignado.' });
    
    try {
        const sql = `
            SELECT id, fecha, estado, estado_reporte, nombre_local, nombre_visitante, tipo FROM (
                SELECT 
                    p.id, p.fecha, p.estado, p.estado_reporte, 
                    el.nombre AS nombre_local, ev.nombre AS nombre_visitante, 
                    'liga' AS tipo
                FROM partidos p
                JOIN equipos el ON p.equipo_local_id = el.id
                JOIN equipos ev ON p.equipo_visitante_id = ev.id
                LEFT JOIN reportes_partidos rp ON p.id = rp.partido_id AND rp.tipo_partido = 'liga' AND rp.equipo_reportador_id = ?
                WHERE 
                    (p.equipo_local_id = ? OR p.equipo_visitante_id = ?) 
                    AND p.estado = 'pendiente' 
                    AND rp.id IS NULL
                UNION ALL
                SELECT 
                    pc.id, pc.fecha, pc.estado, pc.estado_reporte, 
                    el.nombre AS nombre_local, ev.nombre AS nombre_visitante, 
                    'copa' AS tipo
                FROM partidos_copa pc
                JOIN equipos el ON pc.equipo_local_id = el.id
                JOIN equipos ev ON pc.equipo_visitante_id = ev.id
                LEFT JOIN reportes_partidos rp ON pc.id = rp.partido_id AND rp.tipo_partido = 'copa' AND rp.equipo_reportador_id = ?
                WHERE 
                    (pc.equipo_local_id = ? OR pc.equipo_visitante_id = ?) 
                    AND pc.estado = 'pendiente' 
                    AND rp.id IS NULL
            ) AS partidos_pendientes
            ORDER BY fecha ASC;
        `;
        const [partidos] = await db.query(sql, [equipo_id, equipo_id, equipo_id, equipo_id, equipo_id, equipo_id]);
        res.json(partidos);
    } catch (error) {
        logger.error(`Error en obtenerPartidosDT v2.2: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los partidos del equipo.' });
    }
};

/**
 * ✅ FUNCIÓN CORREGIDA v2.3
 * Obtiene los 5 partidos públicos más recientes (liga y copa) que hayan sido aprobados.
 */
exports.obtenerPartidosPublico = async (req, res) => {
    try {
        const sql = `
            SELECT id, fecha, goles_local, goles_visitante, nombre_local, nombre_visitante, tipo FROM (
                (SELECT 
                    p.id, p.fecha, 
                    rp.goles_local_reportados as goles_local, 
                    rp.goles_visitante_reportados as goles_visitante,
                    el.nombre as nombre_local, 
                    ev.nombre as nombre_visitante,
                    'liga' as tipo
                FROM partidos p
                JOIN equipos AS el ON p.equipo_local_id = el.id
                JOIN equipos AS ev ON p.equipo_visitante_id = ev.id
                JOIN reportes_partidos rp ON p.id = rp.partido_id AND rp.tipo_partido = 'liga'
                WHERE p.estado = 'aprobado'
                GROUP BY p.id)
                UNION ALL
                (SELECT 
                    pc.id, pc.fecha, 
                    rp.goles_local_reportados as goles_local, 
                    rp.goles_visitante_reportados as goles_visitante,
                    el.nombre as nombre_local, 
                    ev.nombre as nombre_visitante,
                    'copa' as tipo
                FROM partidos_copa pc
                JOIN equipos AS el ON pc.equipo_local_id = el.id
                JOIN equipos AS ev ON pc.equipo_visitante_id = ev.id
                JOIN reportes_partidos rp ON pc.id = rp.partido_id AND rp.tipo_partido = 'copa'
                WHERE pc.estado = 'aprobado'
                GROUP BY pc.id)
            ) AS partidos_recientes
            ORDER BY fecha DESC
            LIMIT 5;
        `;
        const [partidos] = await db.query(sql);
        res.json(partidos);
    } catch (error) {
        logger.error(`Error en obtenerPartidosPublico: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los partidos recientes' });
    }
};

/**
 * Obtiene los detalles completos de un partido público, incluyendo goleadores y asistidores.
 */
exports.getPartidoPublico = async (req, res) => {
    const { id: partidoId } = req.params;
    try {
        const [[partido]] = await db.query(`
            SELECT 
                p.id, p.fecha, p.estado,
                rp.goles_local_reportados as goles_local,
                rp.goles_visitante_reportados as goles_visitante,
                el.id as equipo_local_id, el.nombre as nombre_local,
                ev.id as equipo_visitante_id, ev.nombre as nombre_visitante,
                l.nombre as nombre_liga, l.id as liga_id
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            LEFT JOIN ligas l ON p.liga_id = l.id
            JOIN (
                SELECT partido_id, tipo_partido, MIN(id) as first_report_id
                FROM reportes_partidos GROUP BY partido_id, tipo_partido
            ) as first_report ON first_report.partido_id = p.id AND first_report.tipo_partido = 'liga'
            JOIN reportes_partidos rp ON rp.id = first_report.first_report_id
            WHERE p.id = ? AND p.estado = 'aprobado'
        `, [partidoId]);

        if (!partido) {
            return res.status(404).json({ error: 'Partido no encontrado o aún no ha sido aprobado.' });
        }

        const [estadisticas] = await db.query(`
            SELECT ejp.goles, ejp.asistencias, u.id as jugador_id, u.nombre_in_game, ejp.equipo_id
            FROM estadisticas_jugadores_partido ejp
            JOIN usuarios u ON ejp.jugador_id = u.id
            JOIN reportes_partidos rp ON ejp.reporte_id = rp.id
            WHERE rp.partido_id = ? AND rp.tipo_partido = 'liga'
        `, [partidoId]);

        const estadisticas_local = estadisticas.filter(stat => stat.equipo_id === partido.equipo_local_id);
        const estadisticas_visitante = estadisticas.filter(stat => stat.equipo_id === partido.equipo_visitante_id);

        res.json({ ...partido, estadisticas_local, estadisticas_visitante });
    } catch (error) {
        logger.error(`Error en getPartidoPublico: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles del partido.' });
    }
};


// --- Funciones de utilidad que se mantienen ---
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

// Esta función es para el admin, la mantenemos pero la adaptamos a la nueva estructura
exports.obtenerPartidos = async (req, res) => {
    const { estado } = req.query;
    try {
        let sql = `
            SELECT 
                p.id, p.fecha, p.estado, p.estado_reporte,
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

/**
 * ✅ FUNCIÓN CORREGIDA v2.3
 * Obtiene los detalles de un partido para la página de reporte, de forma más segura.
 */
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
        const [resultados] = await db.query(sql, [id]);

        if (resultados.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado.' });
        }

        res.json(resultados[0]);
    } catch (error) {
        logger.error(`Error en getPartidoParaReportar: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles del partido.' });
    }
};

/**
 * ✅ NUEVA FUNCIÓN v2.1
 * Permite a un Admin cargar un resultado directamente, saltándose el reporte de los DTs.
 */
exports.adminCargarResultado = async (req, res) => {
    const { tipo, partido_id } = req.params;
    const { goles_local, goles_visitante } = req.body;
    const admin_id = req.usuario.id;

    if (goles_local == null || goles_visitante == null) {
        return res.status(400).json({ error: 'Debes proporcionar los goles de ambos equipos.' });
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

        // 1. Creamos un reporte "oficial" del admin. Usamos el ID del equipo local como referencia.
        const sqlInsertReporte = `
            INSERT INTO reportes_partidos (partido_id, tipo_partido, equipo_reportador_id, goles_local_reportados, goles_visitante_reportados, imagen_prueba_url)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const imagenUrlAdmin = '/uploads/admin_override.png';
        await connection.query(sqlInsertReporte, [partido_id, tipo, partidoInfo.equipo_local_id, goles_local, goles_visitante, imagenUrlAdmin]);

        // 2. Actualizamos el estado del partido directamente a "confirmado por admin"
        await connection.query(`UPDATE ${tablaPartido} SET estado = 'aprobado', estado_reporte = 'confirmado_admin' WHERE id = ?`, [partido_id]);

        // 3. Actualizamos la tabla de posiciones si es un partido de liga
        if (tipo === 'liga' && partidoInfo.liga_id) {
            const datosParaTabla = { ...partidoInfo, goles_local, goles_visitante };
            const queries = generarQueriesActualizacionTabla(datosParaTabla);
            for (const q of queries) {
                await connection.query(q.sql, q.values);
            }
        }
        // Aquí iría la lógica para copas si es necesario

        await connection.commit();
        logger.info(`Admin (ID: ${admin_id}) cargó manualmente el resultado para el partido ID ${partido_id}.`);
        res.json({ message: 'Resultado cargado y partido confirmado por el administrador.' });

    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en adminCargarResultado: ${error.message}`, { error, partido_id });
        res.status(500).json({ error: 'Error en el servidor al cargar el resultado.' });
    } finally {
        if (connection) connection.release();
    }
};