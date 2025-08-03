// src/controllers/partidos_copa.controller.js

const db = require("../../databases");
const logger = require('../config/logger');

/**
 * Confirma el resultado de un partido de copa y hace avanzar al ganador.
 */
exports.confirmarResultadoCopa = async (req, res) => {
    const { id: partidoId } = req.params;
    const { estado } = req.body;

    if (estado !== 'aprobado') {
        return res.status(400).json({ error: "Solo se puede aprobar el resultado." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const sqlGetPartido = `SELECT * FROM partidos_copa WHERE id = ? FOR UPDATE`;
        const [[partido]] = await connection.query(sqlGetPartido, [partidoId]);

        if (!partido) {
            await connection.rollback();
            return res.status(404).json({ error: 'Partido de copa no encontrado.' });
        }

        // Actualizamos el estado del partido actual
        await connection.query('UPDATE partidos_copa SET estado = ? WHERE id = ?', [estado, partidoId]);

        // Lógica para avanzar al ganador
        if (partido.id_siguiente_partido_llave) {
            const idGanador = partido.goles_local > partido.goles_visitante 
                ? partido.equipo_local_id 
                : partido.equipo_visitante_id;
            
            const posicionEnSiguientePartido = (partido.id_partido_llave % 2 !== 0) 
                ? 'equipo_local_id' 
                : 'equipo_visitante_id';

            const sqlUpdateSiguientePartido = `
                UPDATE partidos_copa 
                SET ${posicionEnSiguientePartido} = ? 
                WHERE id_partido_llave = ? AND copa_id = ?
            `;
            await connection.query(sqlUpdateSiguientePartido, [idGanador, partido.id_siguiente_partido_llave, partido.copa_id]);
            logger.info(`Equipo ${idGanador} avanzado a la siguiente fase de la copa ${partido.copa_id}`);
        } else {
            logger.info(`Final de la copa ${partido.copa_id} ha concluido.`);
        }

        await connection.commit();
        res.json({ message: 'Resultado de copa confirmado y procesado.' });

    } catch (error) {
        await connection.rollback();
        logger.error(`Error en confirmarResultadoCopa: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al confirmar el resultado.' });
    } finally {
        if (connection) connection.release();
    }
};
