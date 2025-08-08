const db = require("../../databases");
const logger = require('../config/logger');

/**
 * ✅ FUNCIÓN REFACTORIZADA v2.0
 * Un admin resuelve una disputa o confirma un reporte único para un partido de copa.
 * Utiliza la lógica original de fases de grupo y eliminatorias.
 */
exports.resolverDisputaCopa = async (req, res) => {
    const { partido_id } = req.params;
    const { reporte_ganador_id } = req.body;

    if (!reporte_ganador_id) {
        return res.status(400).json({ error: 'Se debe especificar un reporte ganador.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Obtenemos el reporte que el admin eligió como válido
        const [[reporteGanador]] = await connection.query('SELECT * FROM reportes_partidos WHERE id = ? AND partido_id = ? AND tipo_partido = "copa"', [reporte_ganador_id, partido_id]);
        if (!reporteGanador) {
            await connection.rollback();
            return res.status(404).json({ error: 'El reporte ganador seleccionado no es válido para este partido de copa.' });
        }

        // 2. Obtenemos la información del partido de copa
        const [[partido]] = await connection.query(`SELECT * FROM partidos_copa WHERE id = ? FOR UPDATE`, [partido_id]);
        if (!partido) {
            await connection.rollback();
            return res.status(404).json({ error: 'Partido de copa no encontrado.' });
        }
        if (!['en_disputa', 'reportado_parcialmente'].includes(partido.estado_reporte)) {
            await connection.rollback();
            return res.status(409).json({ error: 'Este partido no se puede confirmar manualmente.' });
        }

        // 3. Actualizamos el estado del partido a 'aprobado'
        await connection.query("UPDATE partidos_copa SET estado = 'aprobado', estado_reporte = 'confirmado_admin' WHERE id = ?", [partido_id]);

        // 4. EJECUTAMOS TU LÓGICA ORIGINAL DE COPAS USANDO LOS GOLES DEL REPORTE GANADOR
        const goles_local = reporteGanador.goles_local_reportados;
        const goles_visitante = reporteGanador.goles_visitante_reportados;

        if (partido.fase === 'Grupos') {
            // ✅ LÓGICA COMPLETA PARA FASE DE GRUPOS
            const { copa_id, grupo_id, equipo_local_id, equipo_visitante_id } = partido;
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

        } else { // Fases de eliminación
            // ✅ LÓGICA COMPLETA PARA FASE DE ELIMINACIÓN
            const [partidosDeLaLlave] = await connection.query('SELECT * FROM partidos_copa WHERE copa_id = ? AND id_partido_llave = ?', [partido.copa_id, partido.id_partido_llave]);
            
            // Actualizamos el estado del partido actual en la lista que acabamos de obtener
            const partidoActualIndex = partidosDeLaLlave.findIndex(p => p.id === partido.id);
            if (partidoActualIndex !== -1) {
                partidosDeLaLlave[partidoActualIndex].estado = 'aprobado';
            }
            
            const ambosPartidosJugados = partidosDeLaLlave.length === 2 && partidosDeLaLlave.every(p => p.estado === 'aprobado');
            const esFinal = partidosDeLaLlave.length === 1 && partido.fase === 'Final';

            if (ambosPartidosJugados) {
                const partidoIda = partidosDeLaLlave[0];
                const partidoVuelta = partidosDeLaLlave[1];

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
                    if(partidoVuelta.goles_visitante > partidoIda.goles_visitante) {
                        idGanador = equipoA_id;
                    } else if (partidoIda.goles_visitante > partidoVuelta.goles_visitante) {
                        idGanador = equipoB_id;
                    } else {
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
        res.json({ message: 'Partido de copa confirmado y procesado por el administrador.' });

    } catch (error) {
        await connection.rollback();
        logger.error(`Error en resolverDisputaCopa: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al confirmar el resultado de copa.' });
    } finally {
        if (connection) connection.release();
    }
};
