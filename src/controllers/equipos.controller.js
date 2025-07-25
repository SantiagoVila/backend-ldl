const db = require('../../databases');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

exports.crearEquipo = async (req, res) => {
    const dt_id = req.usuario.id;
    const { nombre, escudo, formacion } = req.body;

    if (!nombre || !formacion) {
        return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    try {
        const verificarSql = "SELECT id FROM equipos WHERE dt_id = ?";
        const [results] = await db.query(verificarSql, [dt_id]);

        if (results.length > 0) {
            return res.status(409).json({ error: "Ya tienes un equipo o una solicitud de creación pendiente." });
        }

        const insertarSql = "INSERT INTO equipos (nombre, escudo, formacion, dt_id, estado) VALUES (?, ?, ?, ?, 'pendiente')";
        const [result] = await db.query(insertarSql, [nombre, escudo, formacion, dt_id]);

        res.status(201).json({ message: "Solicitud de equipo enviada correctamente. Pendiente de aprobación.", equipoId: result.insertId });

    } catch (error) {
        logger.error("Error en crearEquipo:", { message: error.message, error });
        res.status(500).json({ error: "Error en el servidor al crear el equipo" });
    }
};

exports.obtenerMiSolicitudPendiente = async (req, res) => {
    const dt_id = req.usuario.id;
    try {
        const sql = "SELECT nombre, estado FROM equipos WHERE dt_id = ? AND estado = 'pendiente' LIMIT 1";
        const [[solicitud]] = await db.query(sql, [dt_id]);

        if (!solicitud) {
            return res.status(404).json({ error: "No se encontró una solicitud pendiente." });
        }

        res.json(solicitud);
    } catch (error) {
        logger.error("Error en obtenerMiSolicitudPendiente:", { message: error.message, error });
        res.status(500).json({ error: "Error al buscar la solicitud." });
    }
};

exports.borrarEquipo = async (req, res) => {
    const usuario = req.usuario;
    let sql;
    let valores;

    try {
        if (usuario.rol === "dt") {
            sql = "DELETE FROM equipos WHERE dt_id = ?";
            valores = [usuario.id];
        } else if (usuario.rol === "admin") {
            const equipoId = req.body.equipoId;
            if (!equipoId) {
                return res.status(400).json({ error: "Falta el ID del equipo a eliminar" });
            }
            sql = "DELETE FROM equipos WHERE id = ?";
            valores = [equipoId];
        } else {
            return res.status(403).json({ error: "No tenés permiso para realizar esta acción" });
        }

        const [result] = await db.query(sql, valores);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Equipo no encontrado o ya eliminado" });
        }

        res.json({ message: "Equipo eliminado correctamente" });

    } catch (error) {
        logger.error("Error en borrarEquipo:", { message: error.message, error });
        res.status(500).json({ error: "Error en el servidor al borrar el equipo" });
    }
};

exports.asignarLiga = async (req, res) => {
    const equipo_id = req.params.id;
    const { liga_id } = req.body;

    if (!liga_id) {
        return res.status(400).json({ error: "Falta el ID de la liga" });
    }

    try {
        const sql = `UPDATE equipos SET liga_id = ? WHERE id = ?`;
        await db.query(sql, [liga_id, equipo_id]);

        res.json({ message: 'Liga asignada correctamente al equipo' });

    } catch (error) {
        logger.error("Error en asignarLiga:", { message: error.message, error });
        res.status(500).json({ error: 'Error al asignar la liga al equipo' });
    }
};

exports.obtenerTodosLosEquipos = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const estado = req.query.estado;

        let whereClauses = [];
        const params = [];

        if (estado) {
            whereClauses.push("e.estado = ?");
            params.push(estado);
        }
        
        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const dataQueryString = `
            SELECT e.id, e.nombre, e.estado, l.nombre AS liga_nombre, u.nombre_in_game as nombre_dt
            FROM equipos e
            LEFT JOIN ligas l ON e.liga_id = l.id
            LEFT JOIN usuarios u ON e.dt_id = u.id
            ${whereSql}
            ORDER BY e.id ASC
            LIMIT ? OFFSET ?
        `;
        const dataQuery = db.query(dataQueryString, [...params, limit, offset]);
        
        const countQueryString = `SELECT COUNT(*) as total FROM equipos e ${whereSql}`;
        const countQuery = db.query(countQueryString, params);

        const [ [equipos], [[{total}]] ] = await Promise.all([dataQuery, countQuery]);

        res.json({
            total,
            page,
            limit,
            equipos
        });

    } catch (error) {
        logger.error(`Error en obtenerTodosLosEquipos: ${error.message}`, { error });
        res.status(500).json({ error: "Error al obtener los equipos" });
    }
};

/**
 * ✅ FUNCIÓN CORREGIDA Y DEFINITIVA
 * Obtiene un perfil detallado y completo de un equipo, incluyendo al DT en la plantilla.
 */
exports.obtenerPerfilEquipo = async (req, res) => {
    const { id: equipoId } = req.params;

    try {
        const infoBasicaQuery = db.query(`
            SELECT e.id, e.nombre, e.escudo, e.formacion, e.dt_id, u.nombre_in_game as nombre_dt
            FROM equipos e
            LEFT JOIN usuarios u ON e.dt_id = u.id
            WHERE e.id = ?
        `, [equipoId]);

        // ✅ CORRECCIÓN DEFINITIVA: Usamos una consulta UNION para combinar jugadores y el DT
        const plantillaQuery = db.query(`
            (
                -- 1. Selecciona a todos los JUGADORES del equipo
                SELECT id, nombre_in_game, posicion, numero_remera, rol
                FROM usuarios
                WHERE equipo_id = ? AND rol = 'jugador'
            )
            UNION
            (
                -- 2. Selecciona al DT del equipo
                SELECT u.id, u.nombre_in_game, u.posicion, u.numero_remera, u.rol
                FROM usuarios u
                JOIN equipos e ON u.id = e.dt_id
                WHERE e.id = ?
            )
            ORDER BY FIELD(rol, 'dt', 'jugador'), FIELD(posicion, 'Arquero', 'Defensor', 'Mediocampista', 'Delantero'), nombre_in_game
        `, [equipoId, equipoId]);

        const ultimosPartidosQuery = db.query(`
            SELECT p.id, p.fecha, p.goles_local, p.goles_visitante,
                   el.nombre as equipo_local, ev.nombre as equipo_visitante
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE (p.equipo_local_id = ? OR p.equipo_visitante_id = ?) AND p.estado = 'aprobado'
            ORDER BY p.fecha DESC
            LIMIT 5
        `, [equipoId, equipoId]);

        const [
            [[infoResult]],
            [plantillaResult],
            [partidosResult]
        ] = await Promise.all([
            infoBasicaQuery,
            plantillaQuery,
            ultimosPartidosQuery
        ]);
        
        if (!infoResult) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        const perfilCompleto = {
            ...infoResult,
            plantilla: plantillaResult,
            ultimos_partidos: partidosResult
        };

        res.json(perfilCompleto);

    } catch (error) {
        logger.error(`Error en obtenerPerfilEquipo: ${error.message}`, { error });
        res.status(500).json({ error: "Error en el servidor al obtener el perfil del equipo." });
    }
};

exports.aprobarRechazarEquipo = async (req, res) => {
    const { id: equipoId } = req.params;
    const { respuesta, liga_id } = req.body;

    if (!['aprobado', 'rechazado'].includes(respuesta)) {
        return res.status(400).json({ error: 'Respuesta inválida.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [[equipo]] = await connection.query("SELECT * FROM equipos WHERE id = ? AND estado = 'pendiente'", [equipoId]);

        if (!equipo) {
            await connection.rollback();
            return res.status(404).json({ error: 'No se encontró una solicitud de equipo pendiente con ese ID.' });
        }

        if (respuesta === 'aprobado') {
            const sqlUpdateEquipo = "UPDATE equipos SET estado = 'aprobado', liga_id = ? WHERE id = ?";
            await connection.query(sqlUpdateEquipo, [liga_id || null, equipoId]);
            
            await connection.query("UPDATE usuarios SET equipo_id = ? WHERE id = ?", [equipoId, equipo.dt_id]);
        } else {
            await connection.query("DELETE FROM equipos WHERE id = ?", [equipoId]);
        }

        await connection.commit();
        logger.info(`Admin (ID: ${req.usuario.id}) ha '${respuesta}' la solicitud para el equipo ID ${equipoId}.`);
        res.json({ message: `Solicitud de equipo ${respuesta} correctamente.` });

    } catch (error) {
        if (connection) await connection.rollback();
        logger.error("Error en aprobarRechazarEquipo:", { message: error.message, error });
        res.status(500).json({ error: 'Error en el servidor al procesar la solicitud.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.liberarJugador = async (req, res) => {
    const { jugador_id } = req.body;
    const dt_id = req.usuario.id;
    const equipo_id_dt = req.usuario.equipo_id;

    if (!jugador_id) {
        return res.status(400).json({ error: 'Se requiere el ID del jugador a liberar.' });
    }
    if (!equipo_id_dt) {
        return res.status(403).json({ error: 'No tienes un equipo asignado para realizar esta acción.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [[jugador]] = await connection.query(
            'SELECT id FROM usuarios WHERE id = ? AND equipo_id = ?', 
            [jugador_id, equipo_id_dt]
        );

        if (!jugador) {
            await connection.rollback();
            return res.status(403).json({ error: 'No puedes liberar a este jugador porque no pertenece a tu equipo.' });
        }

        await connection.query('UPDATE usuarios SET equipo_id = NULL WHERE id = ?', [jugador_id]);

        await connection.query(
            `UPDATE historial_transferencias SET fecha_salida = NOW() 
             WHERE jugador_id = ? AND equipo_id = ? AND fecha_salida IS NULL`,
            [jugador_id, equipo_id_dt]
        );

        await connection.commit();
        
        logger.info(`El DT (ID: ${dt_id}) liberó al jugador (ID: ${jugador_id}) de su equipo (ID: ${equipo_id_dt}).`);
        res.json({ message: 'Jugador liberado correctamente. Ahora es agente libre.' });

    } catch (error) {
        await connection.rollback();
        logger.error(`Error en liberarJugador: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al liberar al jugador.' });
    } finally {
        connection.release();
    }
};

exports.subirEscudo = async (req, res) => {
    const equipoId = req.usuario.equipo_id;

    if (!req.file) {
        return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    }
    if (!equipoId) {
        return res.status(403).json({ error: 'No tienes un equipo asignado para realizar esta acción.' });
    }

    try {
        const [[equipo]] = await db.query("SELECT escudo FROM equipos WHERE id = ?", [equipoId]);
        if (equipo && equipo.escudo) {
            const escudoAntiguoPath = path.join(__dirname, '../../public', equipo.escudo);
            fs.unlink(escudoAntiguoPath, (err) => {
                if (err) {
                    logger.warn(`No se pudo borrar el escudo antiguo: ${escudoAntiguoPath}.`);
                } else {
                    logger.info(`Escudo antiguo borrado: ${escudoAntiguoPath}`);
                }
            });
        }
        
        const nuevoEscudoUrl = `/uploads/${req.file.filename}`;
        await db.query("UPDATE equipos SET escudo = ? WHERE id = ?", [nuevoEscudoUrl, equipoId]);

        res.json({ message: 'Escudo actualizado con éxito.', escudo_url: nuevoEscudoUrl });

    } catch (error) {
        logger.error(`Error en subirEscudo: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al subir el escudo.' });
    }
};

exports.getDtDashboardStats = async (req, res) => {
    const equipoId = req.usuario.equipo_id;

    if (!equipoId) {
        return res.status(404).json({ error: 'No tienes un equipo asignado.' });
    }

    try {
        const playerCountQuery = db.query("SELECT COUNT(*) as count FROM usuarios WHERE equipo_id = ?", [equipoId]);
        
        const nextMatchQuery = db.query(`
            SELECT p.fecha, el.nombre as nombre_local, ev.nombre as nombre_visitante
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE (p.equipo_local_id = ? OR p.equipo_visitante_id = ?) AND p.estado = 'pendiente'
            ORDER BY p.fecha ASC
            LIMIT 1
        `, [equipoId, equipoId]);

        const leaguePositionQuery = db.query("SELECT puntos, partidos_jugados FROM tabla_posiciones WHERE equipo_id = ?", [equipoId]);

        const [
            [[{ count: playerCount }]],
            [[nextMatch]],
            [[leaguePosition]]
        ] = await Promise.all([playerCountQuery, nextMatchQuery, leaguePositionQuery]);

        res.json({
            playerCount: playerCount || 0,
            nextMatch: nextMatch || null,
            leaguePosition: leaguePosition || null
        });

    } catch (error) {
        logger.error(`Error en getDtDashboardStats: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener las estadísticas del dashboard.' });
    }
};
