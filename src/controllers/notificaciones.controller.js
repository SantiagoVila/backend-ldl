const db = require('../../databases');

/**
 * GET - Trae las notificaciones del usuario que está logueado.
 */
exports.obtenerNotificaciones = async (req, res) => {
  const usuario_id = req.usuario.id;

  try {
    const sql = `SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY fecha DESC`;
    const [rows] = await db.query(sql, [usuario_id]);
    res.json(rows);
  } catch (error) {
    console.error("Error en obtenerNotificaciones:", error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

/**
 * POST - Crea una nueva notificación para un usuario.
 * Esta ruta probablemente debería ser solo para Admins o para el sistema internamente.
 */
exports.enviarNotificacion = async (req, res) => {
  const { usuario_id, contenido, tipo } = req.body;

  if (!usuario_id || !contenido) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const sql = `
      INSERT INTO notificaciones (usuario_id, contenido, tipo)
      VALUES (?, ?, ?)
    `;
    await db.query(sql, [usuario_id, contenido, tipo || 'sistema']);
    res.status(201).json({ message: 'Notificación enviada correctamente' });
  } catch (error) {
    console.error("Error en enviarNotificacion:", error);
    res.status(500).json({ error: 'Error al enviar notificación' });
  }
};

/**
 * PUT - Marca una notificación como leída.
 */
exports.marcarComoLeida = async (req, res) => {
  const notificacion_id = req.params.id;
  const usuario_id = req.usuario.id; // Obtenemos el ID del usuario logueado para seguridad

  try {
    // MEJORA DE SEGURIDAD: Nos aseguramos de que un usuario solo pueda marcar SUS propias notificaciones.
    const sql = `
      UPDATE notificaciones SET leida = true 
      WHERE id = ? AND usuario_id = ?
    `;
    const [result] = await db.query(sql, [notificacion_id, usuario_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada o no te pertenece' });
    }

    res.json({ message: 'Notificación marcada como leída' });
  } catch (error) {
    console.error("Error en marcarComoLeida:", error);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
};