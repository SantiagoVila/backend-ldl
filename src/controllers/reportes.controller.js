const db = require('../../databases');

/**
 * Permite a un usuario enviar un reporte (bug, sugerencia, etc.).
 */
exports.enviarReporte = async (req, res) => { // 1. Se añade 'async'
  const { tipo, descripcion } = req.body;
  const usuario_id = req.usuario.id;

  if (!tipo || !descripcion) {
    return res.status(400).json({ error: 'Tipo y descripción son obligatorios' });
  }

  // 2. Se usa un solo bloque try...catch
  try {
    // ✅ Se corrigió el SQL para que sea un string válido
    const sql = `INSERT INTO reportes (usuario_id, tipo, descripcion) VALUES (?, ?, ?)`;

    // 3. Se usa 'await' para la consulta
    const [result] = await db.query(sql, [usuario_id, tipo, descripcion]);

    res.status(201).json({ message: 'Reporte enviado correctamente', reporte_id: result.insertId });

  } catch (error) {
    console.error("Error en enviarReporte:", error);
    res.status(500).json({ error: 'Error en el servidor al enviar el reporte' });
  }
};