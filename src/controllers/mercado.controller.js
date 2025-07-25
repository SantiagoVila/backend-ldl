const db = require("../../databases");

/**
 * Abre el mercado de pases.
 */
exports.abrirMercado = async (req, res) => {
  try {
    const sql = "UPDATE mercado SET abierto = true WHERE id = 1";
    const [result] = await db.query(sql);

    // ✅ MEJORA: Verificamos si la consulta realmente cambió algo.
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "No se encontró la configuración del mercado para actualizar." });
    }

    res.json({ message: "Mercado abierto correctamente" });
  } catch (error) {
    console.error("Error en abrirMercado:", error);
    res.status(500).json({ error: "Error al abrir el mercado" });
  }
};

/**
 * Cierra el mercado de pases.
 */
exports.cerrarMercado = async (req, res) => {
  try {
    const sql = "UPDATE mercado SET abierto = false WHERE id = 1";
    const [result] = await db.query(sql);

    // ✅ MEJORA: Verificamos si la consulta realmente cambió algo.
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "No se encontró la configuración del mercado para actualizar." });
    }

    res.json({ message: "Mercado cerrado correctamente" });
  } catch (error) {
    console.error("Error en cerrarMercado:", error);
    res.status(500).json({ error: "Error al cerrar el mercado" });
  }
};

/**
 * Consulta el estado actual del mercado (abierto/cerrado).
 */
exports.estadoMercado = async (req, res) => {
  try {
    const sql = "SELECT abierto FROM mercado WHERE id = 1";
    const [results] = await db.query(sql);

    if (results.length === 0) {
      return res.status(404).json({ error: 'No se encontró la configuración del mercado' });
    }

    const estado = Boolean(results[0].abierto);
    res.json({ abierto: estado });
  } catch (error) {
    console.error("Error en estadoMercado:", error);
    res.status(500).json({ error: "Error al consultar el estado del mercado" });
  }
};