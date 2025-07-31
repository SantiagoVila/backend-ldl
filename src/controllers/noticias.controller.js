const db = require('../../databases');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

/**
 * GET - Muestra todas las noticias (público)
 */
exports.obtenerNoticias = async (req, res) => {
    try {
        const { limite } = req.query;

        // ✅ AÑADIDO: Se selecciona también la nueva columna imagen_url
        let sql = `
            SELECT n.id, n.titulo, n.contenido, n.imagen_url, n.fecha, u.nombre_in_game AS autor
            FROM noticias n
            LEFT JOIN usuarios u ON n.autor_id = u.id
            ORDER BY fecha DESC
        `;

        if (limite && !isNaN(parseInt(limite))) {
            sql += ` LIMIT ${parseInt(limite)}`;
        }

        const [rows] = await db.query(sql);
        res.json(rows);

    } catch (error) {
        logger.error("Error en obtenerNoticias:", error);
        res.status(500).json({ error: 'Error al obtener noticias' });
    }
};

/**
 * POST - Crear noticia con imagen (solo admin)
 */
exports.crearNoticia = async (req, res) => {
    const { titulo, contenido } = req.body;
    const autor_id = req.usuario.id;
    
    // La URL de la imagen viene de req.file gracias al middleware 'upload'
    const imagen_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!titulo || !contenido) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    try {
        const sql = `
            INSERT INTO noticias (titulo, contenido, autor_id, imagen_url)
            VALUES (?, ?, ?, ?)
        `;
        await db.query(sql, [titulo, contenido, autor_id, imagen_url]);
        res.status(201).json({ message: 'Noticia creada correctamente' });

    } catch (error) {
        logger.error("Error en crearNoticia:", error);
        res.status(500).json({ error: 'Error al crear la noticia' });
    }
};

/**
 * DELETE - Borrar una noticia (solo admin)
 */
exports.borrarNoticia = async (req, res) => {
    const { id } = req.params;
    const adminId = req.usuario.id;

    try {
        // 1. Buscamos la noticia para obtener la URL de la imagen y poder borrar el archivo
        const [[noticia]] = await db.query("SELECT imagen_url FROM noticias WHERE id = ?", [id]);

        if (!noticia) {
            return res.status(404).json({ error: "Noticia no encontrada." });
        }

        // 2. Borramos la noticia de la base de datos
        const [result] = await db.query("DELETE FROM noticias WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "No se pudo borrar la noticia." });
        }

        // 3. Si la noticia tenía una imagen, borramos el archivo del servidor
        if (noticia.imagen_url) {
            const imagePath = path.join(__dirname, '../../public', noticia.imagen_url);
            fs.unlink(imagePath, (err) => {
                if (err) {
                    logger.warn(`No se pudo borrar la imagen de la noticia: ${imagePath}. Puede que ya no exista.`);
                } else {
                    logger.info(`Imagen de noticia borrada: ${imagePath}`);
                }
            });
        }
        
        logger.info(`Admin (ID: ${adminId}) borró la noticia (ID: ${id}).`);
        res.json({ message: "Noticia eliminada correctamente" });

    } catch (error) {
        logger.error("Error en borrarNoticia:", error);
        res.status(500).json({ error: 'Error en el servidor al borrar la noticia.' });
    }
};
