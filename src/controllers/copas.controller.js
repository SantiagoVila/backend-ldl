// src/controllers/copas.controller.js

const db = require("../../databases");
const fixtureService = require("../services/fixture.service");
const logger = require('../config/logger');

exports.crearCopa = async (req, res) => {
    const { nombre, temporada, equipos } = req.body;
    const admin_id = req.usuario.id;

    if (!nombre || !equipos || equipos.length < 4) {
        return res.status(400).json({ msg: 'El nombre y al menos 4 equipos son obligatorios.' });
    }

    try {
        await db.query('START TRANSACTION');

        const sqlInsertarCopa = `INSERT INTO copas (nombre, temporada, creada_por_admin_id) VALUES (?, ?, ?)`;
        const [resultadoCopa] = await db.query(sqlInsertarCopa, [nombre, temporada || null, admin_id]);
        const nuevaCopaId = resultadoCopa.insertId;

        // Llamamos a la nueva función del servicio que genera grupos y eliminatorias
        const { grupos, partidos } = fixtureService.generarCopaConGrupos(equipos, equipos.length / 2);

        const sqlInsertarPartidos = `INSERT INTO partidos_copa (copa_id, equipo_local_id, equipo_visitante_id, fase, grupo_id, id_partido_llave, id_siguiente_partido_llave, jornada) VALUES ?`;
        const valoresPartidos = partidos.map(p => [
            nuevaCopaId, p.equipo_local_id, p.equipo_visitante_id, p.fase, p.grupo_id || null, p.id_partido_llave || null, p.id_siguiente_partido_llave || null, p.jornada || null
        ]);
        await db.query(sqlInsertarPartidos, [valoresPartidos]);
        
        // Creamos las entradas iniciales en la tabla de posiciones de la copa
        const valoresPosiciones = [];
        for (const equipo of grupos[1]) { valoresPosiciones.push([nuevaCopaId, 1, equipo.id, equipo.nombre]); }
        for (const equipo of grupos[2]) { valoresPosiciones.push([nuevaCopaId, 2, equipo.id, equipo.nombre]); }
        const sqlInsertarPosiciones = `INSERT INTO tabla_posiciones_copa (copa_id, grupo_id, equipo_id, equipo_nombre) VALUES ?`;
        await db.query(sqlInsertarPosiciones, [valoresPosiciones]);
        
        await db.query('COMMIT');
        res.status(201).json({ message: 'Copa con fase de grupos creada exitosamente.' });

    } catch (error) {
        await db.query('ROLLBACK');
        logger.error(`Error en crearCopa: ${error.message}`, { error });
        res.status(500).json({ error: error.message || 'Error en el servidor al crear la copa.' });
    }
};

exports.obtenerCopaPorId = async (req, res) => {
    const { id } = req.params;
    try {
        const [[copa]] = await db.query('SELECT * FROM copas WHERE id = ?', [id]);
        if (!copa) return res.status(404).json({ error: 'Copa no encontrada' });

        if (copa.fase_actual === 'grupos') {
            const [tablaGrupo1] = await db.query('SELECT * FROM tabla_posiciones_copa WHERE copa_id = ? AND grupo_id = 1 ORDER BY puntos DESC, diferencia_goles DESC', [id]);
            const [tablaGrupo2] = await db.query('SELECT * FROM tabla_posiciones_copa WHERE copa_id = ? AND grupo_id = 2 ORDER BY puntos DESC, diferencia_goles DESC', [id]);
            
            const [partidos] = await db.query(`
                SELECT p.*, el.nombre as nombre_local, ev.nombre as nombre_visitante
                FROM partidos_copa p
                LEFT JOIN equipos el ON p.equipo_local_id = el.id
                LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
                WHERE p.copa_id = ? AND p.fase = 'Grupos' 
                ORDER BY p.jornada
            `, [id]);

            copa.grupos = {
                1: { tabla: tablaGrupo1, partidos: partidos.filter(p => p.grupo_id === 1) },
                2: { tabla: tablaGrupo2, partidos: partidos.filter(p => p.grupo_id === 2) }
            };
        } else {
            const [partidos] = await db.query(`
                SELECT p.*, el.nombre as nombre_local, ev.nombre as nombre_visitante
                FROM partidos_copa p
                LEFT JOIN equipos el ON p.equipo_local_id = el.id
                LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
                WHERE p.copa_id = ? AND p.fase != 'Grupos'
                ORDER BY p.id_partido_llave ASC
            `, [id]);
            copa.fixture = partidos.reduce((acc, p) => {
                if (!acc[p.fase]) acc[p.fase] = [];
                acc[p.fase].push(p);
                return acc;
            }, {});
        }
        res.json(copa);
    } catch (error) {
        logger.error(`Error en obtenerCopaPorId: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles de la copa' });
    }
};

/**
 * ✅ FUNCIÓN IMPLEMENTADA
 * Finaliza la fase de grupos, calcula los clasificados y genera las llaves de eliminatorias.
 */
exports.avanzarFaseCopa = async (req, res) => {
    const { id: copaId } = req.params;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Verificar que la copa esté en fase de grupos
        const [[copa]] = await connection.query("SELECT * FROM copas WHERE id = ? AND fase_actual = 'grupos'", [copaId]);
        if (!copa) {
            await connection.rollback();
            return res.status(400).json({ error: "La copa no existe o ya ha avanzado de la fase de grupos." });
        }

        // 2. Verificar que TODOS los partidos de grupo se hayan jugado
        const [[{ total_partidos, jugados }]] = await connection.query(
            "SELECT COUNT(*) as total_partidos, SUM(IF(estado = 'aprobado', 1, 0)) as jugados FROM partidos_copa WHERE copa_id = ? AND fase = 'Grupos'",
            [copaId]
        );
        if (total_partidos !== jugados) {
            await connection.rollback();
            return res.status(400).json({ error: `Aún faltan ${total_partidos - jugados} partidos por confirmar en la fase de grupos.` });
        }

        // 3. Obtener los 4 mejores de cada grupo
        const [clasificadosG1] = await connection.query("SELECT equipo_id FROM tabla_posiciones_copa WHERE copa_id = ? AND grupo_id = 1 ORDER BY puntos DESC, diferencia_goles DESC, goles_a_favor DESC LIMIT 4", [copaId]);
        const [clasificadosG2] = await connection.query("SELECT equipo_id FROM tabla_posiciones_copa WHERE copa_id = ? AND grupo_id = 2 ORDER BY puntos DESC, diferencia_goles DESC, goles_a_favor DESC LIMIT 4", [copaId]);

        if (clasificadosG1.length < 4 || clasificadosG2.length < 4) {
            await connection.rollback();
            return res.status(500).json({ error: "No hay suficientes equipos para generar las llaves." });
        }

        // 4. Definir los cruces para Cuartos de Final
        const cruces = [
            { llave: 1, local: clasificadosG1[0].equipo_id, visitante: clasificadosG2[3].equipo_id }, // 1° G1 vs 4° G2
            { llave: 2, local: clasificadosG1[2].equipo_id, visitante: clasificadosG2[1].equipo_id }, // 3° G1 vs 2° G2
            { llave: 3, local: clasificadosG1[1].equipo_id, visitante: clasificadosG2[2].equipo_id }, // 2° G1 vs 3° G2
            { llave: 4, local: clasificadosG1[3].equipo_id, visitante: clasificadosG2[0].equipo_id }  // 4° G1 vs 1° G2
        ];

        // 5. Actualizar los partidos de Cuartos de Final
        for (const cruce of cruces) {
            const [partidosDeLlave] = await connection.query("SELECT id FROM partidos_copa WHERE copa_id = ? AND fase = 'Cuartos de Final' AND id_partido_llave = ?", [copaId, cruce.llave]);
            
            // Actualizar partido de IDA
            await connection.query("UPDATE partidos_copa SET equipo_local_id = ?, equipo_visitante_id = ? WHERE id = ?", [cruce.local, cruce.visitante, partidosDeLlave[0].id]);
            // Actualizar partido de VUELTA
            await connection.query("UPDATE partidos_copa SET equipo_local_id = ?, equipo_visitante_id = ? WHERE id = ?", [cruce.visitante, cruce.local, partidosDeLlave[1].id]);
        }

        // 6. Actualizar el estado de la copa
        await connection.query("UPDATE copas SET fase_actual = 'cuartos' WHERE id = ?", [copaId]);

        await connection.commit();
        res.json({ message: "Fase de grupos finalizada y llaves de Cuartos de Final generadas con éxito." });

    } catch (error) {
        await connection.rollback();
        logger.error(`Error en avanzarFaseCopa: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al avanzar de fase.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.obtenerCopas = async (req, res) => {
    try {
        const [copas] = await db.query('SELECT * FROM copas ORDER BY fecha_creacion DESC');
        res.json(copas);
    } catch (error) {
        logger.error(`Error en obtenerCopas: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener las copas' });
    }
};

exports.borrarCopa = async (req, res) => {
    const { id } = req.params;
    const adminId = req.usuario.id;
    try {
        const [result] = await db.query("DELETE FROM copas WHERE id = ?", [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Copa no encontrada o ya ha sido eliminada." });
        }
        logger.info(`Admin (ID: ${adminId}) borró la copa (ID: ${id}).`);
        res.json({ message: "Copa eliminada correctamente." });
    } catch (error) {
        logger.error(`Error en borrarCopa: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al borrar la copa.' });
    }
};

exports.obtenerCopasPublico = async (req, res) => {
    try {
        const [copas] = await db.query("SELECT id, nombre, temporada FROM copas WHERE estado = 'activa' ORDER BY fecha_creacion DESC");
        res.json(copas);
    } catch (error) {
        logger.error(`Error en obtenerCopasPublico: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener las copas' });
    }
};

exports.obtenerDetallesPublicosCopa = async (req, res) => {
    const { id } = req.params;
    try {
        const [[copa]] = await db.query('SELECT * FROM copas WHERE id = ?', [id]);
        if (!copa) return res.status(404).json({ error: 'Copa no encontrada' });
        
        if (copa.fase_actual === 'grupos') {
            const [tablaGrupo1] = await db.query('SELECT * FROM tabla_posiciones_copa WHERE copa_id = ? AND grupo_id = 1 ORDER BY puntos DESC, diferencia_goles DESC', [id]);
            const [tablaGrupo2] = await db.query('SELECT * FROM tabla_posiciones_copa WHERE copa_id = ? AND grupo_id = 2 ORDER BY puntos DESC, diferencia_goles DESC', [id]);
            const [partidos] = await db.query('SELECT * FROM partidos_copa WHERE copa_id = ? AND fase = "Grupos" ORDER BY jornada', [id]);
            copa.grupos = {
                1: { tabla: tablaGrupo1, partidos: partidos.filter(p => p.grupo_id === 1) },
                2: { tabla: tablaGrupo2, partidos: partidos.filter(p => p.grupo_id === 2) }
            };
        } else {
            const [partidos] = await db.query(`
                SELECT p.*, el.nombre as nombre_local, ev.nombre as nombre_visitante
                FROM partidos_copa p
                LEFT JOIN equipos el ON p.equipo_local_id = el.id
                LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
                WHERE p.copa_id = ? AND p.fase != 'Grupos'
                ORDER BY p.id_partido_llave ASC
            `, [id]);
            copa.fixture = partidos.reduce((acc, p) => {
                if (!acc[p.fase]) acc[p.fase] = [];
                acc[p.fase].push(p);
                return acc;
            }, {});
        }
        res.json(copa);
    } catch (error) {
        logger.error(`Error en obtenerDetallesPublicosCopa: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles de la copa' });
    }
};
