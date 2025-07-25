// En: backend/src/controllers/auth.controller.js

const db = require("../../databases");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto"); // Módulo nativo de Node.js para generar tokens seguros
const logger = require('../config/logger');
const transporter = require('../config/mailer');

// En: backend/src/controllers/auth.controller.js

exports.loginUsuario = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Faltan email o contraseña" });
    }

    try {
        const sql = "SELECT * FROM usuarios WHERE email = ?";
        const [results] = await db.query(sql, [email]);

        if (results.length === 0) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }

        const usuario = results[0];

        // ✅ VERIFICACIÓN DE CUENTA CONFIRMADA
        if (!usuario.is_confirmed) {
            return res.status(401).json({ error: "Tu cuenta no ha sido confirmada. Por favor, revisa tu email." });
        }

        const match = await bcrypt.compare(password, usuario.password);
        if (!match) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }

        const payload = { id: usuario.id, email: usuario.email, rol: usuario.rol, equipo_id: usuario.equipo_id };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "2h" });
        res.json({ message: "Login exitoso", token });

    } catch (error) {
        logger.error("Error en el login:", { message: error.message, error });
        res.status(500).json({ error: "Error en el servidor" });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const [[usuario]] = await db.query("SELECT id FROM usuarios WHERE email = ?", [email]);

        if (usuario) {
            const token = crypto.randomBytes(20).toString('hex');
            const expires = new Date(Date.now() + 3600000); // 1 hora

            await db.query(
                "UPDATE usuarios SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?",
                [token, expires, usuario.id]
            );

            const resetLink = `http://localhost:5173/reset-password/${token}`;
            
            // ✅ CONFIGURAMOS Y ENVIAMOS EL EMAIL REAL
            const mailOptions = {
                from: `"LDL SUPPORT" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Recuperación de Contraseña',
                html: `
                    <p>Has solicitado un reseteo de contraseña.</p>
                    <p>Haz clic en el siguiente enlace para establecer una nueva contraseña:</p>
                    <a href="${resetLink}">${resetLink}</a>
                    <p>Si no has sido tú, por favor ignora este email.</p>
                `
            };

            await transporter.sendMail(mailOptions);
            logger.info(`Email de reseteo de contraseña enviado a ${email}`);
        }
        
        res.json({ message: 'Si tu email está registrado, recibirás un enlace para cambiar tu contraseña.' });

    } catch (error) {
        logger.error("Error en forgotPassword:", { message: error.message, error });
        res.status(500).json({ error: "Ocurrió un error en el servidor." });
    }
};

exports.resetPassword = async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    logger.info(`Intento de reseteo de contraseña con token: ${token}`); // <-- ESPÍA

    if (!password || password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    try {
        const sql = "SELECT id FROM usuarios WHERE reset_password_token = ? AND reset_password_expires > NOW()";
        const [[usuario]] = await db.query(sql, [token]);

        if (!usuario) {
            logger.error(`Token inválido o expirado: ${token}`); // <-- ESPÍA
            return res.status(400).json({ error: 'El token de reseteo es inválido o ha expirado.' });
        }

        logger.info(`Usuario encontrado para el reseteo: ID ${usuario.id}`); // <-- ESPÍA

        const hashedNuevoPassword = await bcrypt.hash(password, 10);
        logger.info(`Nuevo hash generado para el usuario ID ${usuario.id}`); // <-- ESPÍA

        const [updateResult] = await db.query(
            "UPDATE usuarios SET password = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?",
            [hashedNuevoPassword, usuario.id]
        );

        logger.info(`Resultado del UPDATE en la base de datos:`, updateResult); // <-- ESPÍA

        res.json({ message: 'Tu contraseña ha sido actualizada con éxito.' });

    } catch (error) {
        logger.error("Error en resetPassword:", { message: error.message, error });
        res.status(500).json({ error: "Ocurrió un error en el servidor." });
    }
};

exports.confirmarCuenta = async (req, res) => {
    const { token } = req.params;

    // ✅ ESPÍA 2: Mostramos el token que recibimos desde la URL
    console.log(`[CONFIRMACIÓN] Token recibido para confirmar: ${token}`);

    try {
        const sql = "SELECT id FROM usuarios WHERE confirmation_token = ?";
        const [[usuario]] = await db.query(sql, [token]);

        if (!usuario) {
            console.log(`[CONFIRMACIÓN] Búsqueda fallida. No se encontró usuario con ese token.`);
            return res.status(400).json({ error: 'Token de confirmación inválido.' });
        }

        await db.query(
            "UPDATE usuarios SET is_confirmed = TRUE, confirmation_token = NULL WHERE id = ?",
            [usuario.id]
        );

        logger.info(`Cuenta confirmada para el usuario ID: ${usuario.id}`);
        res.json({ message: '¡Tu cuenta ha sido confirmada con éxito! Ahora puedes iniciar sesión.' });

    } catch (error) {
        logger.error("Error en confirmarCuenta:", { message: error.message, error });
        res.status(500).json({ error: "Ocurrió un error en el servidor." });
    }
};