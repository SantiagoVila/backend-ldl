const db = require("../../databases");
const bcrypt = require("bcryptjs");
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator');
const crypto = require("crypto");
const transporter = require('../config/mailer');

exports.registrarUsuario = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, nombre_in_game, posicion, numero_remera } = req.body;

    try {
        const [usuariosExistentes] = await db.query(`SELECT id FROM usuarios WHERE email = ?`, [email]);
        if (usuariosExistentes.length > 0) {
            return res.status(409).json({ error: "El email ya está en uso." });
        }

        const [nombresExistentes] = await db.query(`SELECT id FROM usuarios WHERE nombre_in_game = ?`, [nombre_in_game]);
        if (nombresExistentes.length > 0) {
            return res.status(409).json({ error: "El nombre en el juego ya está en uso. Por favor, elige otro." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const confirmationToken = crypto.randomBytes(20).toString('hex');
        
        // ✅ ESPÍA 1: Mostramos el token que vamos a guardar
        console.log(`[REGISTRO] Token generado para ${email}: ${confirmationToken}`);

        const sqlInsertar = `
            INSERT INTO usuarios (email, password, rol, nombre_in_game, posicion, numero_remera, confirmation_token)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await db.query(sqlInsertar, [email, hashedPassword, 'jugador', nombre_in_game, posicion, numero_remera || null, confirmationToken]);
        
        const confirmationLink = `http://localhost:5173/confirmar/${confirmationToken}`;
        const mailOptions = {
            from: `"LDL SUPPORT" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Confirma tu cuenta en LDL Platform',
            html: `<p>¡Bienvenido a la Liga de Duelos! Por favor, haz clic en el siguiente enlace para activar tu cuenta:</p><a href="${confirmationLink}">${confirmationLink}</a>`
        };
        await transporter.sendMail(mailOptions);
        
        logger.info(`Email de confirmación enviado a: ${email}`);
        res.status(201).json({ message: "Registro exitoso. Por favor, revisa tu email para confirmar tu cuenta." });

    } catch (error) {
        logger.error(`Error en registrarUsuario: ${error.message}`, { error });
        res.status(500).json({ error: "Error en el servidor al registrar el usuario." });
    }
};

exports.obtenerTodosLosUsuarios = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const dataQuery = db.query(`
            SELECT u.id, u.email, u.rol, u.nombre_in_game, e.nombre AS equipo_nombre 
            FROM usuarios u
            LEFT JOIN equipos e ON u.equipo_id = e.id
            ORDER BY u.id ASC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        
        const countQuery = db.query("SELECT COUNT(*) as total FROM usuarios");

        const [ [usuarios], [[{total}]] ] = await Promise.all([dataQuery, countQuery]);

        res.json({
            total,
            page,
            limit,
            usuarios
        });
    } catch (error) {
        logger.error(`Error en obtenerTodosLosUsuarios: ${error.message}`, { error });
        res.status(500).json({ error: "Error al obtener los usuarios" });
    }
};

exports.obtenerUsuarioPorId = async (req, res) => {
    const { id } = req.params;
    const usuarioSolicitante = req.usuario;
    if (usuarioSolicitante.rol !== 'admin' && usuarioSolicitante.id != id) {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }
    try {
        const sql = `
            SELECT u.id, u.email, u.rol, u.nombre_in_game, u.posicion, u.numero_remera, u.avatar_url, e.nombre as equipo_nombre
            FROM usuarios u
            LEFT JOIN equipos e ON u.equipo_id = e.id
            WHERE u.id = ?
        `;
        const [[usuario]] = await db.query(sql, [id]);
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(usuario);
    } catch (error) {
        logger.error(`Error en obtenerUsuarioPorId: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles del usuario' });
    }
};

exports.actualizarRolUsuario = async (req, res) => {
    const { id: usuarioId } = req.params;
    const { nuevoRol } = req.body;
    const adminId = req.usuario.id;

    if (!nuevoRol || !['admin', 'dt', 'jugador'].includes(nuevoRol)) {
        return res.status(400).json({ error: 'Rol no válido.' });
    }
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [[usuarioActual]] = await connection.query('SELECT rol, equipo_id FROM usuarios WHERE id = ?', [usuarioId]);
        if (!usuarioActual) {
            await connection.rollback();
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        if (usuarioActual.rol === 'dt' && nuevoRol !== 'dt') {
            await connection.query('UPDATE equipos SET dt_id = NULL WHERE id = ?', [usuarioActual.equipo_id]);
        }
        if (nuevoRol === 'dt' && usuarioActual.equipo_id) {
            const [[equipo]] = await connection.query('SELECT dt_id FROM equipos WHERE id = ?', [usuarioActual.equipo_id]);
            if (equipo.dt_id && equipo.dt_id !== parseInt(usuarioId)) {
                await connection.rollback();
                return res.status(409).json({ error: 'El equipo ya tiene otro DT asignado.' });
            }
            await connection.query('UPDATE equipos SET dt_id = ? WHERE id = ?', [usuarioId, usuarioActual.equipo_id]);
        }
        await connection.query('UPDATE usuarios SET rol = ? WHERE id = ?', [nuevoRol, usuarioId]);
        await connection.commit();
        logger.info(`Admin (ID: ${adminId}) cambió el rol del usuario (ID: ${usuarioId}) a '${nuevoRol}'.`);
        res.json({ message: 'Rol del usuario actualizado correctamente.' });
    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en actualizarRolUsuario: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al actualizar el rol.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.actualizarEquipoUsuario = async (req, res) => {
    const { id: usuarioId } = req.params;
    const { nuevoEquipoId } = req.body;
    const adminId = req.usuario.id;
    const equipoIdParaDb = nuevoEquipoId ? parseInt(nuevoEquipoId) : null;
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [[usuario]] = await connection.query('SELECT rol, equipo_id FROM usuarios WHERE id = ?', [usuarioId]);
        if (!usuario) {
            await connection.rollback();
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const equipoAnteriorId = usuario.equipo_id;
        if(usuario.rol === 'dt' && equipoAnteriorId) {
            await connection.query('UPDATE equipos SET dt_id = NULL WHERE id = ?', [equipoAnteriorId]);
        }
        if(equipoIdParaDb && usuario.rol === 'dt') {
            const [[equipoNuevo]] = await connection.query('SELECT dt_id FROM equipos WHERE id = ?', [equipoIdParaDb]);
            if(equipoNuevo && equipoNuevo.dt_id) {
                await connection.rollback();
                return res.status(409).json({ error: 'El equipo de destino ya tiene un DT asignado.' });
            }
            await connection.query('UPDATE equipos SET dt_id = ? WHERE id = ?', [usuarioId, equipoIdParaDb]);
        }
        await connection.query('UPDATE usuarios SET equipo_id = ? WHERE id = ?', [equipoIdParaDb, usuarioId]);
        await connection.commit();
        logger.info(`Admin (ID: ${adminId}) cambió el equipo del usuario (ID: ${usuarioId}) al equipo (ID: ${equipoIdParaDb}).`);
        res.json({ message: 'Equipo del usuario actualizado correctamente.' });
    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en actualizarEquipoUsuario: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al actualizar el equipo.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.solicitarRolDT = async (req, res) => {
    const usuarioId = req.usuario.id;
    try {
        const sql = `INSERT INTO solicitud_roles (usuario_id, rol_solicitado) VALUES (?, 'dt')`;
        await db.query(sql, [usuarioId]);
        res.json({ message: "Solicitud para ser DT enviada" });
    } catch (error) {
        logger.error(`Error en solicitarRolDT: ${error.message}`, { error });
        res.status(500).json({ error: "Error al enviar la solicitud" });
    }
};

exports.verSolicitudesRol = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const dataQuery = db.query(`
            SELECT sr.id, u.email, sr.rol_solicitado, sr.estado, sr.fecha_solicitud
            FROM solicitud_roles sr JOIN usuarios u ON sr.usuario_id = u.id
            WHERE sr.estado = 'pendiente'
            ORDER BY sr.fecha_solicitud ASC LIMIT ? OFFSET ?
        `, [limit, offset]);
        const countQuery = db.query("SELECT COUNT(*) as total FROM solicitud_roles WHERE estado = 'pendiente'");
        const [ [solicitudes], [[{total}]] ] = await Promise.all([dataQuery, countQuery]);
        res.json({ total, page, limit, solicitudes });
    } catch (error) {
        logger.error(`Error en verSolicitudesRol: ${error.message}`, { error });
        res.status(500).json({ error: "Error al obtener las solicitudes" });
    }
};

exports.cambiarPassword = async (req, res) => {
    const { passwordActual, passwordNuevo } = req.body;
    const usuarioId = req.usuario.id;
    if (!passwordActual || !passwordNuevo) {
        return res.status(400).json({ error: 'Debes proporcionar la contraseña actual y la nueva.' });
    }
    if (passwordNuevo.length < 8) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }
    try {
        const [[usuario]] = await db.query('SELECT password FROM usuarios WHERE id = ?', [usuarioId]);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
        const match = await bcrypt.compare(passwordActual, usuario.password);
        if (!match) return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
        const hashedNuevoPassword = await bcrypt.hash(passwordNuevo, 10);
        await db.query('UPDATE usuarios SET password = ? WHERE id = ?', [hashedNuevoPassword, usuarioId]);
        logger.info(`El usuario (ID: ${usuarioId}) cambió su contraseña.`);
        res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (error) {
        logger.error(`Error en cambiarPassword: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al cambiar la contraseña.' });
    }
};

exports.subirAvatar = async (req, res) => {
    const usuarioId = req.usuario.id;
    if (!req.file) return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    try {
        const [[usuario]] = await db.query("SELECT avatar_url FROM usuarios WHERE id = ?", [usuarioId]);
        if (usuario && usuario.avatar_url) {
            const avatarAntiguoPath = path.join(__dirname, '../../public', usuario.avatar_url);
            fs.unlink(avatarAntiguoPath, (err) => {
                if (err) logger.warn(`No se pudo borrar el avatar antiguo: ${avatarAntiguoPath}.`);
                else logger.info(`Avatar antiguo borrado: ${avatarAntiguoPath}`);
            });
        }
        const nuevoAvatarUrl = `/uploads/${req.file.filename}`;
        await db.query("UPDATE usuarios SET avatar_url = ? WHERE id = ?", [nuevoAvatarUrl, usuarioId]);
        res.json({ message: 'Avatar actualizado con éxito.', avatar_url: nuevoAvatarUrl });
    } catch (error) {
        logger.error(`Error en subirAvatar: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al subir el avatar.' });
    }
};

exports.actualizarPerfil = async (req, res) => {
    const usuarioId = req.usuario.id;
    const { nombre_in_game, posicion, numero_remera } = req.body;
    if (!nombre_in_game || !posicion) {
        return res.status(400).json({ error: 'El nombre en el juego y la posición son obligatorios.' });
    }
    try {
        await db.query(
            "UPDATE usuarios SET nombre_in_game = ?, posicion = ?, numero_remera = ? WHERE id = ?",
            [nombre_in_game, posicion, numero_remera || null, usuarioId]
        );
        res.json({ message: 'Perfil actualizado con éxito.', usuario: { nombre_in_game, posicion, numero_remera } });
    } catch (error) {
        logger.error(`Error en actualizarPerfil: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al actualizar el perfil.' });
    }
};

/**
 * ✅ FUNCIÓN MEJORADA
 * Obtiene el perfil público de un DT, incluyendo el equipo que dirige y sus estadísticas como jugador.
 */
exports.getPublicDtProfile = async (req, res) => {
    const { id: dtId } = req.params;
    try {
        // 1. Consulta principal para los datos del DT y el equipo que dirige
        const profileQuery = db.query(`
            SELECT 
                u.id, 
                u.nombre_in_game, 
                u.avatar_url,
                e.id as equipo_id,
                e.nombre as equipo_nombre,
                e.escudo as escudo_equipo
            FROM usuarios u
            LEFT JOIN equipos e ON u.id = e.dt_id
            WHERE u.id = ? AND u.rol = 'dt'
        `, [dtId]);
        
        // 2. Consulta para las estadísticas del DT como jugador
        const statsQuery = db.query(`
            SELECT 
                SUM(goles) as goles_totales, 
                SUM(asistencias) as asistencias_totales, 
                COUNT(id) as partidos_jugados
            FROM estadisticas_jugadores_partido
            WHERE jugador_id = ?
        `, [dtId]);

        // Ejecutamos ambas en paralelo
        const [ [[dtProfile]], [[stats]] ] = await Promise.all([profileQuery, statsQuery]);

        if (!dtProfile) {
            return res.status(404).json({ error: 'Director Técnico no encontrado.' });
        }

        // Combinamos los resultados en un solo objeto
        const fullProfile = {
            ...dtProfile,
            estadisticas_carrera: {
                goles: parseInt(stats.goles_totales) || 0,
                asistencias: parseInt(stats.asistencias_totales) || 0,
                partidos: stats.partidos_jugados || 0
            }
        };

        res.json(fullProfile);

    } catch (error) {
        logger.error(`Error en getPublicDtProfile: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener el perfil del DT.' });
    }
};

