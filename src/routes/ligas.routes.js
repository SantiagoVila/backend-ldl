const express = require("express");
const router = express.Router();

const { 
    crearLiga, 
    obtenerLigas, 
    obtenerEstadisticasLiga,
    obtenerLigaPorId,
    obtenerLigasPublico,
    obtenerDetallesPublicosLiga
} = require("../controllers/ligas.controller");

const verificarToken = require("../middleware.js/auth.middleware");
const verificarRol = require("../middleware.js/verifyRole");

// --- RUTAS PÚBLICAS ---
router.get('/publico', obtenerLigasPublico);
router.get('/publico/:id/detalles', obtenerDetallesPublicosLiga);

// --- RUTAS PROTEGIDAS ---
router.get('/', verificarToken, obtenerLigas);
router.get('/:id', verificarToken, obtenerLigaPorId);
router.get('/:id/estadisticas', verificarToken, obtenerEstadisticasLiga);
router.post('/', verificarToken, verificarRol("admin"), crearLiga);

module.exports = router;