// src/controllers/copas.controller.js

const db = require("../../databases");
const fixtureService = require("../services/fixture.service");
const logger = require('../config/logger');

exports.crearCopa = async (req, res) => {
    const { nombre, temporada, equipos } = req.body;
    const admin_id = req.usuario.id;

    if (!nombre || !equipos || equipos.length < 2) {
        return res.status(400).json({ msg: 'Nombre y al menos 2 equipos son obligatorios.' });
    }

    try {
        await db.query('START TRANSACTION');

        const sqlInsertarCopa = `INSERT INTO copas (nombre, temporada, creada_por_admin_id) VALUES (?, ?, ?)`;
        const [resultadoCopa] = await db.query(sqlInsertarCopa, [nombre, temporada || null, admin_id]);
        const nuevaCopaId = resultadoCopa.insertId;

        const partidosParaCrear = fixtureService.generarPartidosCopa(equipos);

        const sqlInsertarPartidos = `
            INSERT INTO partidos_copa (copa_id, equipo_local_id, equipo_visitante_id, fase, id_partido_llave, id_siguiente_partido_llave) 
            VALUES ?
        `;
        const valoresPartidos = partidosParaCrear.map(p => [
            nuevaCopaId,
            p.equipo_local_id,
            p.equipo_visitante_id,
            p.fase,
            p.id_partido_llave,
            p.id_siguiente_partido_llave
        ]);

        await db.query(sqlInsertarPartidos, [valoresPartidos]);
        
        await db.query('COMMIT');

        const [[nuevaCopa]] = await db.query('SELECT * FROM copas WHERE id = ?', [nuevaCopaId]);
        res.status(201).json(nuevaCopa);

    } catch (error) {
        await db.query('ROLLBACK');
        logger.error(`Error en crearCopa: ${error.message}`, { error });
        res.status(500).json({ error: error.message || 'Error en el servidor al crear la copa.' });
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

exports.obtenerCopaPorId = async (req, res) => {
    const { id } = req.params;
    try {
        const [[copa]] = await db.query('SELECT * FROM copas WHERE id = ?', [id]);
        if (!copa) {
            return res.status(404).json({ error: 'Copa no encontrada' });
        }

        const [partidos] = await db.query(`
            SELECT p.*, el.nombre as nombre_local, el.escudo as escudo_local, ev.nombre as nombre_visitante, ev.escudo as escudo_visitante
            FROM partidos_copa p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.copa_id = ? 
            ORDER BY p.id_partido_llave ASC
        `, [id]);
        
        const fixturePorFase = partidos.reduce((acc, p) => {
            const fase = p.fase || 'Desconocida';
            if (!acc[fase]) acc[fase] = [];
            acc[fase].push(p);
            return acc;
        }, {});

        copa.fixture = fixturePorFase;
        res.json(copa);

    } catch (error) {
        logger.error(`Error en obtenerCopaPorId: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles de la copa' });
    }
};

exports.obtenerDetallesPublicosCopa = async (req, res) => {
    const { id } = req.params;
    try {
        const [[copa]] = await db.query(`SELECT * FROM copas WHERE id = ? AND estado = 'activa'`, [id]);
        if (!copa) {
            return res.status(404).json({ error: 'Copa no encontrada o no está activa.' });
        }

        const [partidos] = await db.query(`
            SELECT p.id, p.goles_local, p.goles_visitante, p.fase, p.estado,
                   el.nombre as nombre_local, el.escudo as escudo_local, 
                   ev.nombre as nombre_visitante, ev.escudo as escudo_visitante
            FROM partidos_copa p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.copa_id = ? 
            ORDER BY p.id_partido_llave ASC
        `, [id]);
        
        const fixturePorFase = partidos.reduce((acc, p) => {
            const fase = p.fase || 'Desconocida';
            if (!acc[fase]) acc[fase] = [];
            acc[fase].push(p);
            return acc;
        }, {});

        copa.fixture = fixturePorFase;
        res.json(copa);

    } catch (error) {
        logger.error(`Error en obtenerDetallesPublicosCopa: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener los detalles públicos de la copa.' });
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
