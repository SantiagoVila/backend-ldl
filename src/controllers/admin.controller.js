// ✅ PASO 1: Importamos el logger al principio del archivo.
const logger = require('../config/logger');
const db = require('../../databases');
const fixtureService = require('../services/fixture.service');

/**
 * Mueve un jugador de un equipo a otro.
 */
exports.moverJugador = async (req, res) => {
    const { jugador_id, nuevo_equipo_id } = req.body;
    const admin_id = req.usuario.id;

    if (!jugador_id || !nuevo_equipo_id) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {
        const sqlVerificarJugador = `SELECT * FROM usuarios WHERE id = ? AND rol = 'jugador'`;
        const [resultadosJugador] = await db.query(sqlVerificarJugador, [jugador_id]);

        if (resultadosJugador.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        const sqlVerificarEquipo = `SELECT * FROM equipos WHERE id = ?`;
        const [resultadosEquipo] = await db.query(sqlVerificarEquipo, [nuevo_equipo_id]);

        if (resultadosEquipo.length === 0) {
            return res.status(404).json({ error: 'Equipo destino no encontrado' });
        }

        const sqlUpdate = `UPDATE usuarios SET equipo_id = ? WHERE id = ?`;
        await db.query(sqlUpdate, [nuevo_equipo_id, jugador_id]);
        
        // ✅ MEJORA: Registramos la acción exitosa
        logger.info(`Admin (ID: ${admin_id}) movió al jugador (ID: ${jugador_id}) al equipo (ID: ${nuevo_equipo_id}).`);
        res.json({ message: 'Jugador movido correctamente al nuevo equipo' });

    } catch (error) {
        // ✅ MEJORA: Usamos logger.error para un registro detallado del error
        logger.error(`Error en moverJugador: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al mover al jugador' });
    }
};

exports.crearEquipoYAsignarDT = async (req, res) => {
    const { nombre, escudo, formacion, liga_id, dt_id } = req.body;
    const admin_id = req.usuario.id;

    if (!nombre || !dt_id) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (nombre y dt_id)' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [results] = await connection.query("SELECT * FROM usuarios WHERE id = ?", [dt_id]);

        if (results.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        if (results[0].rol !== 'jugador') {
            await connection.rollback();
            return res.status(400).json({ error: 'El usuario no es un jugador y no puede ser asignado como DT' });
        }

        const crearEquipoSql = `INSERT INTO equipos (nombre, escudo, formacion, liga_id, dt_id) VALUES (?, ?, ?, ?, ?)`;
        const [result] = await connection.query(crearEquipoSql, [nombre, escudo || null, formacion || '4-4-2', liga_id || null, dt_id]);
        const equipoId = result.insertId;

        const actualizarRolSql = `UPDATE usuarios SET rol = 'DT' WHERE id = ?`;
        await connection.query(actualizarRolSql, [dt_id]);

        // ✅ PASO ADICIONAL: Asignamos el nuevo equipo al usuario en la tabla 'usuarios'.
        // Esto asegura que su token de login tenga el equipo_id correcto.
        const asignarEquipoAlUsuarioSql = `UPDATE usuarios SET equipo_id = ? WHERE id = ?`;
        await connection.query(asignarEquipoAlUsuarioSql, [equipoId, dt_id]);

        await connection.commit();

        logger.info(`Admin (ID: ${admin_id}) creó el equipo '${nombre}' (ID: ${equipoId}) y asignó al usuario (ID: ${dt_id}) como DT.`);
        res.status(201).json({
            message: 'Equipo creado y DT asignado correctamente',
            equipo_id: equipoId
        });

    } catch (error) {
        if (connection) await connection.rollback();
        
        logger.error(`Error en crearEquipoYAsignarDT: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al crear el equipo. La operación fue cancelada.' });

    } finally {
        if (connection) connection.release();
    }
};

/**
 * Obtiene todos los reportes de los usuarios.
 */
exports.obtenerReportes = async (req, res) => {
    try {
        const sql = `
            SELECT r.*, u.email 
            FROM reportes r
            JOIN usuarios u ON r.usuario_id = u.id
            ORDER BY r.creado_en DESC
        `;
        const [rows] = await db.query(sql);
        res.json({ reportes: rows });
    } catch (error) {
        logger.error(`Error en obtenerReportes: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener reportes' });
    }
};

/**
 * Marca un reporte como atendido.
 */
exports.marcarReporteComoAtendido = async (req, res) => {
    const { id } = req.params;
    const admin_id = req.usuario.id;
    try {
        const sql = `UPDATE reportes SET estado = 'atendido' WHERE id = ?`;
        await db.query(sql, [id]);
        
        logger.info(`Admin (ID: ${admin_id}) marcó el reporte (ID: ${id}) como atendido.`);
        res.json({ message: 'Reporte marcado como atendido' });
    } catch (error) {
        logger.error(`Error en marcarReporteComoAtendido: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al actualizar estado del reporte' });
    }
};

/**
 * Permite a un admin programar las fechas de inicio y fin del mercado de pases.
 */
exports.programarMercado = async (req, res) => {
    const { fecha_inicio, fecha_fin } = req.body;
    const admin_id = req.usuario.id;

    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({ error: 'Debes proporcionar una fecha de inicio y una de fin.' });
    }

    try {
        const sql = `UPDATE mercado SET fecha_inicio = ?, fecha_fin = ? WHERE id = 1`;
        const [result] = await db.query(sql, [fecha_inicio, fecha_fin]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "No se encontró la configuración del mercado para actualizar." });
        }

        logger.info(`Admin (ID: ${admin_id}) programó el mercado de pases desde ${fecha_inicio} hasta ${fecha_fin}.`);
        res.json({ message: `Mercado de pases programado desde ${fecha_inicio} hasta ${fecha_fin}` });

    } catch (error) {
        logger.error(`Error en programarMercado: ${error.message}`, { error });
        res.status(500).json({ error: "Error en el servidor al programar el mercado." });
    }
};

/**
 * Genera el fixture completo para una liga.
 */
exports.generarFixtureLiga = async (req, res) => {
    const { liga_id } = req.params;
    const { dias_de_juego, fecha_arranque } = req.body;
    const admin_id = req.usuario.id;

    if (!dias_de_juego || !dias_de_juego.length || !fecha_arranque) {
        return res.status(400).json({ error: 'Faltan los días de juego o la fecha de arranque.' });
    }

    try {
        const [ligas] = await db.query('SELECT * FROM ligas WHERE id = ?', [liga_id]);
        if (ligas.length === 0) return res.status(404).json({ error: 'Liga no encontrada.' });
        if (ligas[0].fixture_generado) return res.status(409).json({ error: 'El fixture para esta liga ya ha sido generado.' });

        const [equipos] = await db.query('SELECT id, nombre FROM equipos WHERE liga_id = ?', [liga_id]);
        if (equipos.length < 2) return res.status(400).json({ error: 'Se necesitan al menos 2 equipos en la liga para generar un fixture.' });

        const partidosSinFecha = fixtureService.generarPartidosRoundRobin(equipos);
        
        let fechaActual = new Date(fecha_arranque);
        const diasSemana = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        let partidosConFecha = partidosSinFecha.map(partido => {
            while (!dias_de_juego.includes(Object.keys(diasSemana).find(key => diasSemana[key] === fechaActual.getDay()))) {
                fechaActual.setDate(fechaActual.getDate() + 1);
            }
            const partidoConFecha = {
                ...partido,
                fecha: new Date(fechaActual).toISOString().slice(0, 10)
            };
            fechaActual.setDate(fechaActual.getDate() + 1);
            return partidoConFecha;
        });

        const sqlInsert = `INSERT INTO partidos (equipo_local_id, equipo_visitante_id, jornada, fecha, liga_id, estado) VALUES ?`;
        const values = partidosConFecha.map(p => [p.equipo_local_id, p.equipo_visitante_id, p.jornada, p.fecha, liga_id, 'pendiente']);

        await db.query(sqlInsert, [values]);
        await db.query('UPDATE ligas SET fixture_generado = TRUE WHERE id = ?', [liga_id]);

        logger.info(`Admin (ID: ${admin_id}) generó el fixture para la liga (ID: ${liga_id}).`);
        res.status(201).json({ message: `Fixture de ${partidosConFecha.length} partidos generado correctamente para la liga.` });

    } catch (error) {
        logger.error(`Error al generar fixture: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al generar el fixture.' });
    }
};

/**
 * ✅ FUNCIÓN ACTUALIZADA Y MEJORADA
 * Un admin aprueba o rechaza una solicitud de rol.
 * Si se aprueba un rol de 'dt', actualiza tanto la tabla de usuarios como la de equipos.
 */
exports.responderSolicitudRol = async (req, res) => {
    const { id: solicitudId } = req.params;
    const { respuesta } = req.body; // 'aprobado' o 'rechazado'
    const adminId = req.usuario.id;

    if (!['aprobado', 'rechazado'].includes(respuesta)) {
        return res.status(400).json({ error: 'Respuesta inválida.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Obtenemos la solicitud y los datos del usuario asociado (su equipo y rol actual)
        const [[solicitud]] = await connection.query(`
            SELECT sr.*, u.equipo_id, u.rol as rol_actual 
            FROM solicitud_roles sr
            JOIN usuarios u ON sr.usuario_id = u.id
            WHERE sr.id = ? AND sr.estado = "pendiente"
        `, [solicitudId]);

        if (!solicitud) {
            await connection.rollback();
            return res.status(404).json({ error: 'Solicitud no encontrada o ya ha sido procesada.' });
        }

        // 2. Actualizamos el estado de la solicitud
        await connection.query('UPDATE solicitud_roles SET estado = ? WHERE id = ?', [respuesta, solicitudId]);
        
        // 3. Si se aprueba la solicitud para ser DT, realizamos la lógica completa
        if (respuesta === 'aprobado' && solicitud.rol_solicitado === 'dt') {
            // Actualizamos el rol del usuario a 'dt'
            await connection.query('UPDATE usuarios SET rol = "dt" WHERE id = ?', [solicitud.usuario_id]);

            // Si el usuario ya pertenece a un equipo, lo asignamos como DT de ese equipo
            if (solicitud.equipo_id) {
                // Primero, verificamos que el equipo no tenga ya otro DT
                const [[equipo]] = await connection.query('SELECT dt_id FROM equipos WHERE id = ?', [solicitud.equipo_id]);
                if (equipo && equipo.dt_id) {
                     await connection.rollback();
                     return res.status(409).json({ error: 'El equipo de este usuario ya tiene un DT asignado. Primero debe ser removido.' });
                }
                // Si el puesto está libre, asignamos al nuevo DT
                await connection.query('UPDATE equipos SET dt_id = ? WHERE id = ?', [solicitud.usuario_id, solicitud.equipo_id]);
            }
            logger.info(`Admin (ID: ${adminId}) aprobó la solicitud ${solicitudId}. Usuario (ID: ${solicitud.usuario_id}) es ahora DT.`);
        } else if (respuesta === 'rechazado') {
            logger.info(`Admin (ID: ${adminId}) rechazó la solicitud ${solicitudId}.`);
        }

        // 4. Si todo salió bien, confirmamos la transacción
        await connection.commit();
        res.json({ message: `Solicitud ${respuesta} correctamente.` });

    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en responderSolicitudRol: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al responder la solicitud.' });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * ✅ NUEVA FUNCIÓN AÑADIDA
 * Un admin crea un nuevo equipo desde cero.
 */
exports.adminCreaEquipo = async (req, res) => {
    const { nombre, escudo, formacion, liga_id } = req.body;
    const admin_id = req.usuario.id;

    if (!nombre || !formacion) {
        return res.status(400).json({ error: "Nombre y formación son obligatorios." });
    }

    try {
        const [existente] = await db.query('SELECT id FROM equipos WHERE nombre = ?', [nombre]);
        if (existente.length > 0) {
            return res.status(409).json({ error: 'Ya existe un equipo con ese nombre.' });
        }

        const sql = "INSERT INTO equipos (nombre, escudo, formacion, liga_id, estado) VALUES (?, ?, ?, ?, 'aprobado')";
        const [result] = await db.query(sql, [nombre, escudo || null, formacion, liga_id || null]);

        logger.info(`Admin (ID: ${admin_id}) creó el equipo '${nombre}' (ID: ${result.insertId})`);
        res.status(201).json({ message: 'Equipo creado correctamente por el admin.', equipoId: result.insertId });
    } catch (error) {
        logger.error("Error en adminCreaEquipo:", { message: error.message, error });
        res.status(500).json({ error: 'Error en el servidor al crear el equipo.' });
    }
};

/**
 * Finaliza la temporada de una liga: calcula posiciones finales y la archiva.
 */
exports.finalizarTemporada = async (req, res) => {
    const { liga_id } = req.params;
    const admin_id = req.usuario.id;
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [partidosPendientes] = await connection.query(`SELECT COUNT(id) as total FROM partidos WHERE liga_id = ? AND estado = 'pendiente'`, [liga_id]);
        if (partidosPendientes[0].total > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'No se puede finalizar la temporada. Aún hay partidos pendientes de aprobación.' });
        }

        const [tablaPosiciones] = await connection.query(`SELECT equipo_id FROM tabla_posiciones WHERE liga_id = ? ORDER BY puntos DESC, diferencia_goles DESC`, [liga_id]);
        if (tablaPosiciones.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'No se encontraron datos en la tabla de posiciones para esta liga.' });
        }

        const updatePromises = tablaPosiciones.map((equipo, index) => {
            const posicion = index + 1;
            return connection.query('UPDATE equipos SET posicion_final_liga = ? WHERE id = ?', [posicion, equipo.equipo_id]);
        });
        await Promise.all(updatePromises);
        
        await connection.query(`UPDATE ligas SET estado_temporada = 'archivada' WHERE id = ?`, [liga_id]);
        await connection.commit();
        
        logger.info(`Admin (ID: ${admin_id}) finalizó la temporada para la liga (ID: ${liga_id}).`);
        res.json({ message: 'Temporada finalizada y posiciones calculadas correctamente.' });
    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en finalizarTemporada: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al finalizar la temporada.' });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Ejecuta el proceso de ascensos y descensos entre dos ligas.
 */
exports.ejecutarAscensosDescensos = async (req, res) => {
    const { liga_superior_id, liga_inferior_id, cantidad_equipos } = req.body;
    const admin_id = req.usuario.id;

    if (!liga_superior_id || !liga_inferior_id || !cantidad_equipos) {
        return res.status(400).json({ error: 'Faltan datos: se requieren ambas ligas y la cantidad de equipos a mover.' });
    }
    const cantidad = parseInt(cantidad_equipos);
    if (cantidad <= 0) {
        return res.status(400).json({ error: 'La cantidad de equipos debe ser mayor a cero.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [equipos_a_descender] = await connection.query(`SELECT id FROM equipos WHERE liga_id = ? ORDER BY posicion_final_liga DESC LIMIT ?`, [liga_superior_id, cantidad]);
        const [equipos_a_ascender] = await connection.query(`SELECT id FROM equipos WHERE liga_id = ? ORDER BY posicion_final_liga ASC LIMIT ?`, [liga_inferior_id, cantidad]);

        if (equipos_a_descender.length < cantidad || equipos_a_ascender.length < cantidad) {
            await connection.rollback();
            return res.status(400).json({ error: 'Una de las ligas no tiene suficientes equipos para realizar la operación.' });
        }

        const idsDescenso = equipos_a_descender.map(e => e.id);
        await connection.query(`UPDATE equipos SET liga_id = ? WHERE id IN (?)`, [liga_inferior_id, idsDescenso]);

        const idsAscenso = equipos_a_ascender.map(e => e.id);
        await connection.query(`UPDATE equipos SET liga_id = ? WHERE id IN (?)`, [liga_superior_id, idsAscenso]);

        await connection.commit();
        
        logger.info(`Admin (ID: ${admin_id}) ejecutó ascensos/descensos entre liga ${liga_superior_id} y ${liga_inferior_id}.`);
        res.json({ message: `Se han movido ${cantidad} equipos entre las ligas correctamente.` });
    } catch (error) {
        if (connection) await connection.rollback();
        logger.error(`Error en ejecutarAscensosDescensos: ${error.message}`, { error });
        res.status(500).json({ error: 'Error en el servidor al procesar los ascensos y descensos.' });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * ✅ NUEVA FUNCIÓN
 * Crea una nueva temporada para una liga existente.
 * Clona la liga y sus equipos para la siguiente temporada.
 */
exports.crearNuevaTemporada = async (req, res) => {
    const { id: ligaAntiguaId } = req.params;
    const adminId = req.usuario.id;
    const logger = require('../config/logger');

    const connection = await db.getConnection(); // Usamos una conexión para manejar la transacción

    try {
        await connection.beginTransaction();

        // 1. Verificar que la liga antigua existe y está archivada
        const [[ligaAntigua]] = await connection.query("SELECT * FROM ligas WHERE id = ? AND estado_temporada = 'archivada'", [ligaAntiguaId]);
        if (!ligaAntigua) {
            await connection.rollback();
            return res.status(404).json({ error: "La liga no existe o no está archivada. Solo se puede crear una nueva temporada a partir de una liga archivada." });
        }

        // 2. Determinar el nuevo nombre de la temporada
        const temporadaActual = ligaAntigua.temporada || 'Temporada 1';
        const numeroTemporada = parseInt(temporadaActual.match(/\d+/g)) || 1;
        const nuevaTemporadaNombre = `Temporada ${numeroTemporada + 1}`;

        // 3. Crear la nueva liga
        const nuevaLigaQuery = `
            INSERT INTO ligas (nombre, categoria, temporada, creada_por_admin_id, estado_temporada) 
            VALUES (?, ?, ?, ?, 'activa')
        `;
        const [result] = await connection.query(nuevaLigaQuery, [ligaAntigua.nombre, ligaAntigua.categoria, nuevaTemporadaNombre, adminId]);
        const nuevaLigaId = result.insertId;

        // 4. Obtener los equipos de la liga antigua
        const [equiposAntiguos] = await connection.query("SELECT id FROM equipos WHERE liga_id = ?", [ligaAntiguaId]);
        if (equiposAntiguos.length === 0) {
            // Si no hay equipos, la tarea está hecha.
            await connection.commit();
            return res.status(201).json({ message: `Nueva temporada '${nuevaTemporadaNombre}' creada con éxito, sin equipos.`, nuevaLigaId });
        }

        // 5. Actualizar la liga_id de los equipos para que apunten a la nueva liga
        const idsEquipos = equiposAntiguos.map(e => e.id);
        const placeholders = idsEquipos.map(() => '?').join(',');
        const actualizarEquiposQuery = `UPDATE equipos SET liga_id = ? WHERE id IN (${placeholders})`;
        await connection.query(actualizarEquiposQuery, [nuevaLigaId, ...idsEquipos]);

        // 6. Crear las entradas en la tabla de posiciones para la nueva liga
        const valoresTablaPosiciones = equiposAntiguos.map(equipo => 
            [nuevaLigaId, equipo.id, '(nombre pendiente)'] // El nombre se podría obtener con otro JOIN, pero lo simplificamos
        );
        // Necesitamos obtener los nombres de los equipos
        const nombresEquiposQuery = `SELECT id, nombre FROM equipos WHERE id IN (${placeholders})`;
        const [nombresEquipos] = await connection.query(nombresEquiposQuery, [...idsEquipos]);
        
        const mapNombres = new Map(nombresEquipos.map(e => [e.id, e.nombre]));

        const valoresTablaFinal = idsEquipos.map(id => [nuevaLigaId, id, mapNombres.get(id)]);

        const tablaPosicionesQuery = `INSERT INTO tabla_posiciones (liga_id, equipo_id, equipo_nombre) VALUES ?`;
        await connection.query(tablaPosicionesQuery, [valoresTablaFinal]);


        await connection.commit(); // Si todo fue bien, confirmamos los cambios
        res.status(201).json({ message: `Nueva temporada '${nuevaTemporadaNombre}' creada y ${idsEquipos.length} equipos transferidos.`, nuevaLigaId });

    } catch (error) {
        await connection.rollback(); // Si algo falla, revertimos todo
        logger.error(`Error en crearNuevaTemporada: ${error.message}`, { error });
        res.status(500).json({ error: "Error en el servidor al crear la nueva temporada." });
    } finally {
        connection.release(); // Liberamos la conexión al pool
    }
};

/**
 * ✅ NUEVA FUNCIÓN
 * Aplica una sanción a un jugador específico.
 */
exports.crearSancion = async (req, res) => {
    const { jugador_id, motivo, partidos_de_sancion, partido_id } = req.body;
    const admin_id = req.usuario.id;
    const logger = require('../config/logger');

    // Validación básica de los datos de entrada
    if (!jugador_id || !motivo || !partidos_de_sancion) {
        return res.status(400).json({ error: 'Faltan datos obligatorios: jugador_id, motivo y partidos_de_sancion.' });
    }

    if (isNaN(parseInt(partidos_de_sancion)) || parseInt(partidos_de_sancion) <= 0) {
        return res.status(400).json({ error: 'La cantidad de partidos de sanción debe ser un número mayor a cero.' });
    }

    try {
        const sql = `
            INSERT INTO sanciones 
                (jugador_id, motivo, partidos_de_sancion, partido_id, creado_por_admin_id)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        const [result] = await db.query(sql, [
            jugador_id, 
            motivo, 
            partidos_de_sancion, 
            partido_id || null, // Se guarda null si no se especifica
            admin_id
        ]);

        logger.info(`Admin (ID: ${admin_id}) aplicó una sanción de ${partidos_de_sancion} partidos al jugador (ID: ${jugador_id}).`);
        res.status(201).json({ 
            message: 'Sanción aplicada correctamente.',
            sancionId: result.insertId 
        });

    } catch (error) {
        logger.error(`Error en crearSancion: ${error.message}`, { error });
        // Error específico por si el jugador no existe
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
             return res.status(404).json({ error: 'El jugador especificado no existe.' });
        }
        res.status(500).json({ error: 'Error en el servidor al aplicar la sanción.' });
    }
};

/**
 * Obtiene todas las sanciones de un jugador específico.
 */
exports.obtenerSancionesPorJugador = async (req, res) => {
    const { id: jugador_id } = req.params;
    const logger = require('../config/logger');

    try {
        const sql = "SELECT * FROM sanciones WHERE jugador_id = ? ORDER BY fecha_creacion DESC";
        const [sanciones] = await db.query(sql, [jugador_id]);
        res.json(sanciones);
    } catch (error) {
        logger.error(`Error en obtenerSancionesPorJugador: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener el historial de sanciones.' });
    }
};

/**
 * ✅ NUEVA FUNCIÓN
 * Recopila varias estadísticas clave para el dashboard del admin.
 */
exports.getDashboardStats = async (req, res) => {
    const logger = require('../config/logger');

    try {
        // Definimos todas las consultas de conteo que necesitamos
        const q_equipos_pendientes = db.query("SELECT COUNT(*) as count FROM equipos WHERE estado = 'pendiente'");
        const q_roles_pendientes = db.query("SELECT COUNT(*) as count FROM solicitud_roles WHERE estado = 'pendiente'");
        const q_partidos_pendientes = db.query("SELECT COUNT(*) as count FROM partidos WHERE estado = 'pendiente' AND imagen_resultado_url IS NOT NULL");
        const q_total_usuarios = db.query("SELECT COUNT(*) as count FROM usuarios");
        const q_total_equipos = db.query("SELECT COUNT(*) as count FROM equipos WHERE estado = 'aprobado'");
        const q_total_ligas = db.query("SELECT COUNT(*) as count FROM ligas");
        
        // Las ejecutamos todas en paralelo
        const [
            [[equipos_pendientes]],
            [[roles_pendientes]],
            [[partidos_pendientes]],
            [[total_usuarios]],
            [[total_equipos]],
            [[total_ligas]]
        ] = await Promise.all([
            q_equipos_pendientes,
            q_roles_pendientes,
            q_partidos_pendientes,
            q_total_usuarios,
            q_total_equipos,
            q_total_ligas
        ]);

        // Formateamos la respuesta en un solo objeto JSON
        res.json({
            equipos_pendientes: equipos_pendientes.count,
            roles_pendientes: roles_pendientes.count,
            partidos_pendientes: partidos_pendientes.count,
            total_usuarios: total_usuarios.count,
            total_equipos: total_equipos.count,
            total_ligas: total_ligas.count
        });

    } catch (error) {
        logger.error(`Error en getDashboardStats: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener las estadísticas del dashboard.' });
    }
};