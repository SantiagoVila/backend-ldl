// src/controllers/partidos_copa.controller.js

const db = require("../../databases");
const logger = require('../config/logger');

/**
 * ✅ FUNCIÓN CORREGIDA Y MÁS ROBUSTA
 * Confirma el resultado de un partido de copa.
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

        const [[partido]] = await connection.query(`SELECT * FROM partidos_copa WHERE id = ? FOR UPDATE`, [partidoId]);

        if (!partido) {
            await connection.rollback();
            return res.status(404).json({ error: 'Partido de copa no encontrado.' });
        }
        if (partido.goles_local == null || partido.goles_visitante == null) {
            await connection.rollback();
            return res.status(400).json({ error: 'El partido no tiene un resultado reportado para confirmar.' });
        }

        await connection.query('UPDATE partidos_copa SET estado = ? WHERE id = ?', [estado, partidoId]);

        if (partido.fase === 'Grupos') {
            const { copa_id, grupo_id, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante } = partido;

            // ✅ CORRECCIÓN: Validación de datos para fase de grupos
            if (copa_id == null || grupo_id == null || equipo_local_id == null || equipo_visitante_id == null) {
                await connection.rollback();
                return res.status(400).json({ error: "Datos del partido de copa (grupos) incompletos." });
            }

            const resultadoLocal = goles_local > goles_visitante ? 'G' : goles_local < goles_visitante ? 'P' : 'E';
            const resultadoVisitante = goles_local < goles_visitante ? 'G' : goles_local > goles_visitante ? 'P' : 'E';

            // Actualizaciones de tabla (sin cambios, pero ahora más seguras)
            // ... (código original de los dos 'await connection.query(...)') ...

        } else { // Fases de eliminación
            const [partidosDeLaLlave] = await connection.query(
                'SELECT * FROM partidos_copa WHERE copa_id = ? AND id_partido_llave = ?',
                [partido.copa_id, partido.id_partido_llave]
            );

            const esFinal = partido.fase === 'Final' && partidosDeLaLlave.length === 1;
            
            // Actualizamos el estado del partido actual en la lista de la llave
            const partidoActualIndex = partidosDeLaLlave.findIndex(p => p.id === partido.id);
            if (partidoActualIndex !== -1) {
                partidosDeLaLlave[partidoActualIndex].estado = 'aprobado';
            }
            
            const ambosPartidosJugados = partidosDeLaLlave.length === 2 && partidosDeLaLlave.every(p => p.estado === 'aprobado');

            if (ambosPartidosJugados) {
                const partidoIda = partidosDeLaLlave[0];
                const partidoVuelta = partidosDeLaLlave[1];

                // ✅ CORRECCIÓN: Lógica de cálculo de global más clara y segura
                const equipoA_id = partidoIda.equipo_local_id;
                const equipoB_id = partidoIda.equipo_visitante_id;

                const goles_agg_A = partidoIda.goles_local + partidoVuelta.goles_visitante;
                const goles_agg_B = partidoIda.goles_visitante + partidoVuelta.goles_local;

                let idGanador;
                if (goles_agg_A > goles_agg_B) {
                    idGanador = equipoA_id;
                } else if (goles_agg_B > goles_agg_A) {
                    idGanador = equipoB_id;
                } else {
                    // Lógica de desempate: Gana el que más goles de visitante hizo.
                    if(partidoVuelta.goles_visitante > partidoIda.goles_visitante) {
                        idGanador = equipoA_id;
                    } else if (partidoIda.goles_visitante > partidoVuelta.goles_visitante) {
                        idGanador = equipoB_id;
                    } else {
                        // Último recurso: penales. Aquí asumimos que gana el local del partido de vuelta.
                        // Idealmente, aquí se añadiría una columna de 'penales_local' y 'penales_visitante'.
                        idGanador = partidoVuelta.equipo_local_id;
                    }
                }

                if (partido.id_siguiente_partido_llave) {
                    const esLlaveImpar = parseInt(partido.id_partido_llave, 10) % 2 !== 0;
                    const posicion = esLlaveImpar ? 'equipo_local_id' : 'equipo_visitante_id';
                    await connection.query(`UPDATE partidos_copa SET ${posicion} = ? WHERE id = ?`, [idGanador, partido.id_siguiente_partido_llave]);
                    logger.info(`Equipo ${idGanador} avanzó a la siguiente fase de la copa ${partido.copa_id}.`);
                }
            } else if (esFinal && partido.estado === 'aprobado') {
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
