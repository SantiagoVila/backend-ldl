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
  getPartidoPublico // <-- Añade la nueva función aquí
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
router.put('/dt/reportar/:id', verificarToken, verificarRol('dt'), upload.any(), reportarResultado);
router.get('/:id', verificarToken, obtenerPartidoPorId);

module.exports = router;
