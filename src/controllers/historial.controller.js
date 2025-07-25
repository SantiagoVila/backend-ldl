const db = require('../../databases');

/**
 * Obtiene el historial de transferencias de un jugador específico.
 */
exports.obtenerHistorialPorJugador = async (req, res) => { // 1. Se añade 'async'
  const jugadorId = req.params.id;

  // 2. Se usa un solo bloque try...catch para todos los errores
  try {
    const sql = `
      SELECT 
        ht.equipo_id,
        e.nombre AS equipo_nombre,
        ht.fecha_ingreso,
        ht.fecha_salida,
        ht.partidos,
        ht.goles,
        ht.asistencias
      FROM historial_transferencias ht
      JOIN equipos e ON ht.equipo_id = e.id
      WHERE ht.jugador_id = ?
      ORDER BY ht.fecha_ingreso ASC
    `;

    // 3. Se usa 'await' para esperar el resultado de la consulta
    const [resultados] = await db.query(sql, [jugadorId]);

    // Si la consulta es exitosa, se envían los resultados.
    // Si no encuentra nada, 'resultados' será un array vacío [], lo cual es correcto.
    res.json(resultados);

  } catch (error) {
    console.error("Error en obtenerHistorialPorJugador:", error);
    res.status(500).json({ error: "Error en el servidor al obtener el historial del jugador" });
  }
};