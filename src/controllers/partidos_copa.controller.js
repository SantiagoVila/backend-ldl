// src/controllers/partidos_copa.controller.js

const db = require("../../databases");
const logger = require('../config/logger');

/**
 * Confirma el resultado de un partido de copa.
 * Si es de grupos, actualiza la tabla de posiciones.
 * Si es de eliminatoria, calcula el global y hace avanzar al ganador.
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
        if (partido.goles_local == null || partido.goles_visitante == null) {
            await connection.rollback();
            return res.status(400).json({ error: 'El partido no tiene un resultado reportado para confirmar.' });
        }

        await connection.query('UPDATE partidos_copa SET estado = ? WHERE id = ?', [estado, partidoId]);

        // --- LÓGICA DIFERENCIAL ---
        if (partido.fase === 'Grupos') {
            // LÓGICA PARA FASE DE GRUPOS
            const { copa_id, grupo_id, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante } = partido;
            const resultadoLocal = goles_local > goles_visitante ? 'G' : goles_local < goles_visitante ? 'P' : 'E';
            const resultadoVisitante = goles_local < goles_visitante ? 'G' : goles_local > goles_visitante ? 'P' : 'E';

            // Actualizar equipo local
            await connection.query(`
                UPDATE tabla_posiciones_copa SET
                    puntos = puntos + ?, partidos_jugados = partidos_jugados + 1,
                    partidos_ganados = partidos_ganados + ?, partidos_empatados = partidos_empatados + ?,
                    partidos_perdidos = partidos_perdidos + ?, goles_a_favor = goles_a_favor + ?,
                    goles_en_contra = goles_en_contra + ?, diferencia_goles = diferencia_goles + ?
                WHERE copa_id = ? AND equipo_id = ? AND grupo_id = ?
            `, [
                resultadoLocal === 'G' ? 3 : resultadoLocal === 'E' ? 1 : 0,
                resultadoLocal === 'G' ? 1 : 0, resultadoLocal === 'E' ? 1 : 0, resultadoLocal === 'P' ? 1 : 0,
                goles_local, goles_visitante, (goles_local - goles_visitante),
                copa_id, equipo_local_id, grupo_id
            ]);

            // Actualizar equipo visitante
            await connection.query(`
                UPDATE tabla_posiciones_copa SET
                    puntos = puntos + ?, partidos_jugados = partidos_jugados + 1,
                    partidos_ganados = partidos_ganados + ?, partidos_empatados = partidos_empatados + ?,
                    partidos_perdidos = partidos_perdidos + ?, goles_a_favor = goles_a_favor + ?,
                    goles_en_contra = goles_en_contra + ?, diferencia_goles = diferencia_goles + ?
                WHERE copa_id = ? AND equipo_id = ? AND grupo_id = ?
            `, [
                resultadoVisitante === 'G' ? 3 : resultadoVisitante === 'E' ? 1 : 0,
                resultadoVisitante === 'G' ? 1 : 0, resultadoVisitante === 'E' ? 1 : 0, resultadoVisitante === 'P' ? 1 : 0,
                goles_visitante, goles_local, (goles_visitante - goles_local),
                copa_id, equipo_visitante_id, grupo_id
            ]);

        } else {
            // ✅ LÓGICA PARA FASE DE ELIMINACIÓN (IDA Y VUELTA)
            const [partidosDeLaLlave] = await connection.query(
                'SELECT * FROM partidos_copa WHERE copa_id = ? AND id_partido_llave = ?',
                [partido.copa_id, partido.id_partido_llave]
            );

            // Solo procedemos si AMBOS partidos de la llave (ida y vuelta) están aprobados
            const ambosPartidosJugados = partidosDeLaLlave.length === 2 && partidosDeLaLlave.every(p => p.estado === 'aprobado');
            const esFinal = partidosDeLaLlave.length === 1 && partido.fase === 'Final';

            if (ambosPartidosJugados) {
                const partidoIda = partidosDeLaLlave[0];
                const partidoVuelta = partidosDeLaLlave[1];

                // Calculamos el marcador global
                const golesEquipo1 = partidoIda.equipo_local_id === partidoVuelta.equipo_visitante_id ? (partidoIda.goles_local + partidoVuelta.goles_visitante) : (partidoIda.goles_local + partidoVuelta.goles_local);
                const golesEquipo2 = partidoIda.equipo_visitante_id === partidoVuelta.equipo_local_id ? (partidoIda.goles_visitante + partidoVuelta.goles_local) : (partidoIda.goles_visitante + partidoVuelta.goles_visitante);
                
                const equipo1Id = partidoIda.equipo_local_id;
                const equipo2Id = partidoIda.equipo_visitante_id;

                let idGanador;
                if (golesEquipo1 > golesEquipo2) {
                    idGanador = equipo1Id;
                } else if (golesEquipo2 > golesEquipo1) {
                    idGanador = equipo2Id;
                } else {
                    // Lógica de desempate (ej: goles de visitante, penales - por ahora gana el local del partido de vuelta)
                    idGanador = partidoVuelta.equipo_local_id; 
                }

                // Hacemos avanzar al ganador
                if (partido.id_siguiente_partido_llave) {
                    const posicion = (partido.id_partido_llave % 2 !== 0) ? 'equipo_local_id' : 'equipo_visitante_id';
                    await connection.query(`UPDATE partidos_copa SET ${posicion} = ? WHERE id_partido_llave = ? AND copa_id = ?`, [idGanador, partido.id_siguiente_partido_llave, partido.copa_id]);
                    logger.info(`Equipo ${idGanador} avanzó a la siguiente fase de la copa ${partido.copa_id} tras ganar la llave ${partido.id_partido_llave}.`);
                }

            } else if (esFinal) {
                 logger.info(`Final de la copa ${partido.copa_id} ha concluido.`);
            }
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
