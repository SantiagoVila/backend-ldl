const db = require("../../databases");
const logger = require('../config/logger');

// Nota: El paquete 'moment' no se está utilizando en este archivo y podría eliminarse
// de package.json si no se usa en otras partes del proyecto para aligerarlo.

/**
 * Busca jugadores por nombre (función de búsqueda general).
 */
exports.buscarJugadoresPorNombre = async (req, res) => {
    const nombre = req.query.nombre;

    if (!nombre || nombre.length < 2) {
        return res.status(400).json({ error: "Proporcione al menos 2 letras para buscar" });
    }

    try {
        const sql = `
            SELECT u.id, u.nombre_in_game, u.posicion, e.nombre AS equipo
            FROM usuarios u
            LEFT JOIN equipos e ON u.equipo_id = e.id
            WHERE u.rol = 'jugador' AND u.nombre_in_game LIKE ?
            LIMIT 10
        `;
        const [jugadores] = await db.query(sql, [`%${nombre}%`]);

        let puedeFichar = false;

        if (req.usuario && req.usuario.rol === "dt") {
            const sqlMercado = `SELECT id FROM mercado WHERE abierto = 1 LIMIT 1`;
            const [mercado] = await db.query(sqlMercado);
            puedeFichar = mercado.length > 0;
        }

        res.json({ jugadores, puedeFichar });

    } catch (error) {
        logger.error("Error en buscarJugadoresPorNombre:", { message: error.message, error });
        res.status(500).json({ error: "Error en el servidor al buscar jugadores" });
    }
};

/**
 * Busca el perfil de un jugador específico por su ID (ruta protegida).
 */
exports.buscarPerfilJugador = async (req, res) => {
    const jugador_id = req.params.id;
    const usuario = req.usuario; // viene del token

    try {
        const sqlJugador = `
            SELECT id, nombre_in_game, posicion, equipo_id
            FROM usuarios 
            WHERE id = ? AND rol = 'jugador'
        `;
        const [resultados] = await db.query(sqlJugador, [jugador_id]);

        if (resultados.length === 0) {
            return res.status(404).json({ error: "Jugador no encontrado" });
        }

        const jugador = resultados[0];
        jugador.puede_fichar = false; // valor por defecto

        if (usuario && usuario.rol === "dt") {
            const sqlMercado = `SELECT id FROM mercado WHERE abierto = 1 LIMIT 1`;
            const [mercado] = await db.query(sqlMercado);
            if (mercado.length > 0 && jugador.equipo_id !== usuario.equipo_id) {
                jugador.puede_fichar = true;
            }
        }
        
        res.json(jugador);

    } catch (error) {
        logger.error("Error en buscarPerfilJugador:", { message: error.message, error });
        res.status(500).json({ error: "Error en el servidor al buscar el perfil" });
    }
};

/**
 * Muestra todos los jugadores de un equipo específico.
 */
exports.verJugadoresPorEquipo = async (req, res) => {
    const equipoId = req.params.equipoId;

    try {
        const sqlEquipo = `SELECT nombre FROM equipos WHERE id = ?`;
        const [equipoRes] = await db.query(sqlEquipo, [equipoId]);

        if (equipoRes.length === 0) {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }
        const nombreEquipo = equipoRes[0].nombre;

        const sqlJugadores = `
            SELECT id, nombre_in_game, posicion, numero_remera
            FROM usuarios
            WHERE equipo_id = ? AND rol = 'jugador'
            ORDER BY 
                FIELD(posicion, 'Arquero', 'Defensor', 'Mediocampista', 'Delantero'),
                nombre_in_game
        `;
        const [jugadores] = await db.query(sqlJugadores, [equipoId]);

        const agrupados = {
            Arquero: [], Defensor: [], Mediocampista: [], Delantero: []
        };
        jugadores.forEach(j => {
            if (agrupados[j.posicion]) agrupados[j.posicion].push(j);
        });

        res.json({ equipo: nombreEquipo, jugadores: agrupados });

    } catch (error) {
        logger.error("Error en verJugadoresPorEquipo:", { message: error.message, error });
        res.status(500).json({ error: "Error en el servidor al obtener los jugadores del equipo" });
    }
};

/**
 * Obtiene un perfil detallado de un jugador para usuarios logueados.
 */
exports.obtenerPerfilJugadorDetallado = async (req, res) => {
    const { id } = req.params;
    try {
        const infoBasicaQuery = db.query(`
            SELECT u.id, u.nombre_in_game, u.posicion, u.numero_remera, e.nombre as equipo_actual, e.id as equipo_actual_id
            FROM usuarios u
            LEFT JOIN equipos e ON u.equipo_id = e.id
            WHERE u.id = ? AND u.rol = 'jugador'
        `, [id]);
        const estadisticasQuery = db.query(`
            SELECT SUM(goles) as goles_totales, SUM(asistencias) as asistencias_totales, COUNT(id) as partidos_jugados
            FROM estadisticas_jugadores_partido
            WHERE jugador_id = ?
        `, [id]);
        const historialQuery = db.query(`
            SELECT ht.fecha_ingreso, ht.fecha_salida, e.nombre as nombre_equipo, e.id as equipo_id
            FROM historial_transferencias ht
            JOIN equipos e ON ht.equipo_id = e.id
            WHERE ht.jugador_id = ?
            ORDER BY ht.fecha_ingreso DESC
        `, [id]);

        const [ [[infoResult]], [[estadisticasResult]], [historialResult] ] = await Promise.all([infoBasicaQuery, estadisticasQuery, historialQuery]);

        if (!infoResult) return res.status(404).json({ error: 'Jugador no encontrado' });

        res.json({
            ...infoResult,
            estadisticas_carrera: {
                goles: parseInt(estadisticasResult.goles_totales) || 0,
                asistencias: parseInt(estadisticasResult.asistencias_totales) || 0,
                partidos: estadisticasResult.partidos_jugados || 0
            },
            historial_clubes: historialResult
        });
    } catch (error) {
        logger.error(`Error en obtenerPerfilJugadorDetallado: ${error.message}`, { error });
        res.status(500).json({ error: "Error en el servidor al obtener el perfil del jugador." });
    }
};

/**
 * ✅ FUNCIÓN UNIFICADA Y FINAL PARA EL MERCADO
 * Un DT obtiene la lista de jugadores a los que puede fichar, con filtros avanzados.
 * Solo funciona si el mercado está abierto.
 */
exports.obtenerJugadoresFichables = async (req, res) => {
    const equipo_id_dt = req.usuario.equipo_id;
    const { nombre, posicion, liga_id, soloAgentesLibres } = req.query;

    if (!equipo_id_dt) {
        return res.status(400).json({ error: 'No tienes un equipo para realizar fichajes.' });
    }

    try {
        const sqlMercado = `SELECT id FROM mercado WHERE abierto = 1 LIMIT 1`;
        const [mercado] = await db.query(sqlMercado);

        if (mercado.length === 0) {
            return res.status(403).json({ error: "El mercado de pases está actualmente cerrado." });
        }

        let sql = `
            SELECT 
                u.id, u.nombre_in_game, u.posicion, e.nombre as equipo_actual
            FROM usuarios u
            LEFT JOIN equipos e ON u.equipo_id = e.id
            WHERE u.rol = 'jugador' AND (u.equipo_id != ? OR u.equipo_id IS NULL)
        `;
        const params = [equipo_id_dt];

        if (nombre) {
            sql += ` AND u.nombre_in_game LIKE ?`;
            params.push(`%${nombre}%`);
        }
        if (posicion) {
            sql += ` AND u.posicion = ?`;
            params.push(posicion);
        }
        if (liga_id) {
            sql += ` AND e.liga_id = ?`;
            params.push(liga_id);
        }
        if (soloAgentesLibres === 'true') {
            sql += ` AND u.equipo_id IS NULL`;
        }
        
        sql += ` ORDER BY u.nombre_in_game ASC`;

        const [jugadores] = await db.query(sql, params);
        res.json(jugadores);
    } catch (error) {
        logger.error(`Error en obtenerJugadoresFichables: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener la lista de jugadores.' });
    }
};

/**
 * Obtiene el perfil público de un jugador. No requiere autenticación.
 */
exports.obtenerPerfilPublicoJugador = async (req, res) => {
    const { id } = req.params;
    try {
        const infoBasicaQuery = db.query(`SELECT u.id, u.nombre_in_game, u.posicion, u.numero_remera, e.nombre as equipo_actual, e.id as equipo_actual_id FROM usuarios u LEFT JOIN equipos e ON u.equipo_id = e.id WHERE u.id = ? AND u.rol = 'jugador'`, [id]);
        const estadisticasQuery = db.query(`SELECT SUM(goles) as goles_totales, SUM(asistencias) as asistencias_totales, COUNT(id) as partidos_jugados FROM estadisticas_jugadores_partido WHERE jugador_id = ?`, [id]);
        const historialQuery = db.query(`SELECT ht.fecha_ingreso, ht.fecha_salida, e.nombre as nombre_equipo, e.id as equipo_id FROM historial_transferencias ht JOIN equipos e ON ht.equipo_id = e.id WHERE ht.jugador_id = ? ORDER BY ht.fecha_ingreso DESC`, [id]);
        
        const [ [[infoResult]], [[estadisticasResult]], [historialResult] ] = await Promise.all([infoBasicaQuery, estadisticasQuery, historialQuery]);

        if (!infoResult) return res.status(404).json({ error: 'Jugador no encontrado' });

        res.json({
            ...infoResult,
            estadisticas_carrera: {
                goles: parseInt(estadisticasResult.goles_totales) || 0,
                asistencias: parseInt(estadisticasResult.asistencias_totales) || 0,
                partidos: estadisticasResult.partidos_jugados || 0
            },
            historial_clubes: historialResult
        });
    } catch (error) {
        logger.error(`Error en obtenerPerfilPublicoJugador: ${error.message}`, { error });
        res.status(500).json({ error: "Error en el servidor al obtener el perfil del jugador." });
    }
};

/**
 * Obtiene el calendario de próximos partidos para el jugador logueado.
 */
exports.obtenerMiCalendario = async (req, res) => {
    const equipo_id = req.usuario.equipo_id;
    if (!equipo_id) return res.json([]);

    try {
        const sql = `
            SELECT p.id, p.fecha, p.estado, el.nombre as nombre_local, ev.nombre as nombre_visitante
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE (p.equipo_local_id = ? OR p.equipo_visitante_id = ?) 
            AND p.estado = 'pendiente'
            ORDER BY p.fecha ASC
            LIMIT 5
        `;
        const [partidos] = await db.query(sql, [equipo_id, equipo_id]);
        res.json(partidos);
    } catch (error) {
        logger.error(`Error en obtenerMiCalendario: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener el calendario de partidos.' });
    }
};

/*
  Funciones eliminadas por redundancia:
  - Se eliminó la versión simple de `obtenerJugadoresFichables`.
  - Se eliminó `getAgentesLibres` ya que su lógica se integró en `obtenerJugadoresFichables`.
*/