const db = require("../../databases");
const logger = require('../config/logger');

exports.solicitarFichaje = async (req, res) => {
    const dt_id = req.usuario.id;
    const equipo_id_dt = req.usuario.equipo_id;
    const { jugador_id } = req.body;

    const io = req.app.get('socketio');
    const activeUsers = req.app.get('activeUsers');

    if (!jugador_id) {
        return res.status(400).json({ error: "Falta el ID del jugador" });
    }
    if (!equipo_id_dt) {
        return res.status(400).json({ error: "No tienes un equipo asignado para realizar esta acción." });
    }

    try {
        const sqlMercado = `SELECT id FROM mercado WHERE abierto = 1 LIMIT 1`;
        const [mercado] = await db.query(sqlMercado);

        if (mercado.length === 0) {
            return res.status(403).json({ error: "No está abierto el mercado de pases" });
        }

        const [[equipoDT]] = await db.query(`SELECT nombre FROM equipos WHERE id = ?`, [equipo_id_dt]);
        if (!equipoDT) {
            return res.status(404).json({ error: "No se encontró tu equipo en la base de datos." });
        }
        const nombreEquipo = equipoDT.nombre;

        const [resultadosVal] = await db.query(
            `SELECT id FROM transferencias WHERE jugador_id = ? AND equipo_destino_id = ? AND estado = 'pendiente'`,
            [jugador_id, equipo_id_dt]
        );

        if (resultadosVal.length > 0) {
            return res.status(400).json({ error: "Ya enviaste una solicitud para este jugador" });
        }

        await db.query(
            `INSERT INTO transferencias (jugador_id, equipo_origen_id, equipo_destino_id, estado)
             VALUES (?, (SELECT equipo_id FROM usuarios WHERE id = ?), ?, 'pendiente')`,
            [jugador_id, jugador_id, equipo_id_dt]
        );

        const contenido = `Has recibido una oferta del equipo ${nombreEquipo}`;
        const [notifResult] = await db.query(
            "INSERT INTO notificaciones (usuario_id, contenido, tipo, link_url) VALUES (?, ?, 'oferta', '/jugador/mis-ofertas')",
            [jugador_id, contenido]
        );

        const socketId = activeUsers.get(jugador_id.toString());
        if (socketId) {
            const nuevaNotificacion = {
                id: notifResult.insertId,
                usuario_id: jugador_id,
                contenido,
                tipo: 'oferta',
                leida: false,
                fecha: new Date(),
                link_url: '/jugador/mis-ofertas'
            };
            io.to(socketId).emit('nueva_notificacion', nuevaNotificacion);
            logger.info(`Evento de notificación emitido al usuario ID ${jugador_id}`);
        }

        res.status(201).json({ message: "Solicitud de fichaje enviada correctamente" });

    } catch (error) {
        logger.error("Error en solicitarFichaje:", { message: error.message, error });
        res.status(500).json({ error: "Error en el servidor al solicitar el fichaje" });
    }
};

/**
 * Un jugador responde a una oferta, y ahora verifica el límite de plantilla.
 */
exports.responderOferta = async (req, res) => {
    const jugador_id = req.usuario.id;
    const { transferencia_id, respuesta } = req.body;

    const io = req.app.get('socketio');
    const activeUsers = req.app.get('activeUsers');
    
    if (!transferencia_id || !['aceptada', 'rechazada'].includes(respuesta)) {
        return res.status(400).json({ error: "Datos inválidos" });
    }
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [[transferencia]] = await connection.query(
            `SELECT t.*, u.nombre_in_game as nombre_jugador, e.dt_id 
             FROM transferencias t
             JOIN usuarios u ON t.jugador_id = u.id
             JOIN equipos e ON t.equipo_destino_id = e.id
             WHERE t.id = ? AND t.jugador_id = ? AND t.estado = 'pendiente'`,
            [transferencia_id, jugador_id]
        );

        if (!transferencia) {
            await connection.rollback();
            return res.status(404).json({ error: "Transferencia no encontrada o ya respondida" });
        }
        
        if (respuesta === 'aceptada') {
            const equipoDestinoId = transferencia.equipo_destino_id;

            // ✅ NUEVA VERIFICACIÓN: Límite de jugadores por equipo
            const MAX_JUGADORES_POR_EQUIPO = 23; // Límite de plantilla
            const [[conteo]] = await connection.query(
                "SELECT COUNT(*) as total FROM usuarios WHERE equipo_id = ?",
                [equipoDestinoId]
            );

            if (conteo.total >= MAX_JUGADORES_POR_EQUIPO) {
                await connection.rollback();
                // Rechazamos la transferencia y notificamos al jugador
                await connection.query("UPDATE transferencias SET estado = 'rechazada' WHERE id = ?", [transferencia_id]);
                return res.status(409).json({ error: `Fichaje fallido: El equipo de destino ya ha alcanzado el límite de ${MAX_JUGADORES_POR_EQUIPO} jugadores.` });
            }

            const [[user]] = await connection.query("SELECT equipo_id FROM usuarios WHERE id = ?", [jugador_id]);
            const equipoActualId = user.equipo_id;

            await connection.query("UPDATE usuarios SET equipo_id = ? WHERE id = ?", [equipoDestinoId, jugador_id]);
            await connection.query("UPDATE transferencias SET estado = 'aceptada' WHERE id = ?", [transferencia_id]);
            await connection.query("UPDATE transferencias SET estado = 'rechazada' WHERE jugador_id = ? AND estado = 'pendiente' AND id != ?", [jugador_id, transferencia_id]);

            if (equipoActualId) {
                await connection.query("UPDATE historial_transferencias SET fecha_salida = NOW() WHERE jugador_id = ? AND equipo_id = ? AND fecha_salida IS NULL", [jugador_id, equipoActualId]);
            }
            await connection.query("INSERT INTO historial_transferencias (jugador_id, equipo_id, fecha_ingreso) VALUES (?, ?, NOW())", [jugador_id, equipoDestinoId]);
        } else { // Si la respuesta es 'rechazada'
            await connection.query("UPDATE transferencias SET estado = 'rechazada' WHERE id = ?", [transferencia_id]);
        }

        const dt_id = transferencia.dt_id;
        if (dt_id) {
            const contenido = `El jugador ${transferencia.nombre_jugador} ha ${respuesta} tu oferta.`;
            const [notifResult] = await connection.query(
                "INSERT INTO notificaciones (usuario_id, contenido, tipo, link_url) VALUES (?, ?, 'respuesta', '/dt/mercado')",
                [dt_id, contenido]
            );

            const socketId = activeUsers.get(dt_id.toString());
            if (socketId) {
                const nuevaNotificacion = {
                    id: notifResult.insertId,
                    usuario_id: dt_id,
                    contenido,
                    tipo: 'respuesta',
                    leida: false,
                    fecha: new Date(),
                    link_url: '/dt/mercado'
                };
                io.to(socketId).emit('nueva_notificacion', nuevaNotificacion);
                logger.info(`Evento de respuesta de fichaje emitido al DT ID ${dt_id}`);
            }
        }

        await connection.commit();
        res.json({ message: `Oferta ${respuesta} correctamente` });

    } catch (error) {
        if (connection) await connection.rollback();
        logger.error("Error en responderOferta:", { message: error.message, error });
        res.status(500).json({ error: "Error en el servidor al responder la oferta" });
    } finally {
        if (connection) connection.release();
    }
};

exports.verOfertasJugador = async (req, res) => {
    const jugador_id = req.usuario.id;
    try {
        const sql = `
            SELECT t.id, e.nombre AS nombre_equipo, t.estado, t.fecha_solicitud
            FROM transferencias t
            JOIN equipos e ON t.equipo_destino_id = e.id
            WHERE t.jugador_id = ? AND t.estado = 'pendiente'
        `;
        const [resultados] = await db.query(sql, [jugador_id]);
        res.json(resultados);
    } catch (error) {
        logger.error("Error en verOfertasJugador:", { message: error.message, error });
        res.status(500).json({ error: "Error al buscar ofertas" });
    }
};

exports.verSolicitudesDT = async (req, res) => {
    const dt_id = req.usuario.id;
    try {
        const sql = `
            SELECT t.id AS transferencia_id, u.nombre_in_game AS nombre_jugador, t.estado, t.fecha_solicitud
            FROM transferencias t
            JOIN usuarios u ON t.jugador_id = u.id
            JOIN equipos e ON t.equipo_destino_id = e.id
            WHERE e.dt_id = ?
            ORDER BY t.fecha_solicitud DESC
        `;
        const [resultados] = await db.query(sql, [dt_id]);
        res.json(resultados);
    } catch (error) {
        logger.error("Error en verSolicitudesDT:", { message: error.message, error });
        res.status(500).json({ error: "Error al obtener las solicitudes del DT" });
    }
};

exports.cancelarSolicitud = async (req, res) => {
    const dt_id = req.usuario.id;
    const { transferencia_id } = req.params;

    if (!transferencia_id) {
        return res.status(400).json({ error: "Falta el ID de la transferencia" });
    }
    
    try {
        const sqlValidar = `
            SELECT t.id FROM transferencias t
            JOIN equipos e ON t.equipo_destino_id = e.id
            WHERE t.id = ? AND t.estado = 'pendiente' AND e.dt_id = ?
        `;
        const [resultado] = await db.query(sqlValidar, [transferencia_id, dt_id]);

        if (resultado.length === 0) {
            return res.status(403).json({ error: "No tienes permiso para cancelar esta solicitud o ya fue respondida" });
        }

        await db.query(`UPDATE transferencias SET estado = 'cancelada' WHERE id = ?`, [transferencia_id]);
        
        res.json({ message: "Solicitud cancelada correctamente" });

    } catch (error) {
        logger.error("Error en cancelarSolicitud:", { message: error.message, error });
        res.status(500).json({ error: "Error al cancelar la solicitud" });
    }
};
