const db = require('../../databases');

/**
 * GET - Muestra todas las noticias (público)
 * ✅ MEJORA: Acepta un query param 'limite' para obtener solo las N más recientes.
 */
exports.obtenerNoticias = async (req, res) => {
    try {
        const { limite } = req.query; // Obtenemos el límite desde la URL, ej: /api/noticias?limite=3

        let sql = `
            SELECT n.id, n.titulo, n.contenido, n.fecha, u.nombre_in_game AS autor
            FROM noticias n
            LEFT JOIN usuarios u ON n.autor_id = u.id
            ORDER BY fecha DESC
        `;

        if (limite && !isNaN(parseInt(limite))) {
            sql += ` LIMIT ${parseInt(limite)}`; // Añadimos el límite a la consulta SQL
        }

        const [rows] = await db.query(sql);
        res.json(rows);

    } catch (error) {
        console.error("Error en obtenerNoticias:", error);
        res.status(500).json({ error: 'Error al obtener noticias' });
    }
};

/**
 * POST - Crear noticia (solo admin)
 */
exports.crearNoticia = async (req, res) => {
  const { titulo, contenido } = req.body;
  const autor_id = req.usuario.id;

  if (!titulo || !contenido) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const sql = `
      INSERT INTO noticias (titulo, contenido, autor_id)
      VALUES (?, ?, ?)
    `;
    await db.query(sql, [titulo, contenido, autor_id]);
    res.status(201).json({ message: 'Noticia creada correctamente' });

  } catch (error) {
    console.error("Error en crearNoticia:", error);
    res.status(500).json({ error: 'Error al crear la noticia' });
  }
};