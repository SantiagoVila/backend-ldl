const express = require('express');
const router = express.Router();

const { 
  crearPartido, 
  confirmarPartido, 
  obtenerPartidos,
  obtenerPartidosDT,
  reportarResultado,
  obtenerPartidoPorId,
  obtenerPartidosPublico,
  getPartidoPublico, // <-- Añade la nueva función aquí
  getPartidoParaReportar // <-- Y esta también
} = require('../controllers/partidos.controller');

const verificarToken = require('../middleware.js/auth.middleware');
const verificarRol = require('../middleware.js/verifyRole');
const upload = require('../middleware.js/upload'); 

// --- RUTAS PÚBLICAS ---
router.get("/publico/recientes", obtenerPartidosPublico);
router.get('/publico/:id', getPartidoPublico); // <-- Añade la nueva ruta aquí

// --- RUTAS PROTEGIDAS ---
router.get("/", verificarToken, verificarRol("admin"), obtenerPartidos)
router.post('/', verificarToken, verificarRol('dt'), crearPartido);
router.put('/:id/confirmar', verificarToken, verificarRol('admin'), confirmarPartido);
router.get('/dt/mis-partidos', verificarToken, verificarRol('dt'), obtenerPartidosDT);
router.get('/dt/partido-para-reportar/:tipo/:id', verificarToken, verificarRol('dt'), getPartidoParaReportar);
router.put('/dt/reportar/:tipo/:id', verificarToken, verificarRol('dt'), upload.any(), reportarResultado);
router.get('/:id', verificarToken, obtenerPartidoPorId);

module.exports = router;