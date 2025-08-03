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

// Aquí podrías añadir más funciones como obtenerCopas, obtenerCopaPorId, etc.