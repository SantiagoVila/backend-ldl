// src/routes/copas.routes.js

const express = require("express");
const router = express.Router();

const { 
    crearCopa, 
    obtenerCopas, 
    obtenerCopaPorId,
    obtenerDetallesPublicosCopa,
    borrarCopa,
    obtenerCopasPublico,
    avanzarFaseCopa // ✅ Se importa la nueva función
} = require("../controllers/copas.controller");
const verificarToken = require("../middleware.js/auth.middleware");
const verificarRol = require("../middleware.js/verifyRole");

// --- RUTAS PÚBLICAS ---
router.get('/publico', obtenerCopasPublico);
router.get('/publico/:id/detalles', obtenerDetallesPublicosCopa);

// --- RUTAS DE ADMIN ---
router.get('/', verificarToken, verificarRol("admin"), obtenerCopas);
router.get('/:id', verificarToken, verificarRol("admin"), obtenerCopaPorId);
router.post('/', verificarToken, verificarRol("admin"), crearCopa);
router.delete('/:id', verificarToken, verificarRol("admin"), borrarCopa);

// ✅ NUEVA RUTA para avanzar de fase
router.post('/:id/avanzar-fase', verificarToken, verificarRol("admin"), avanzarFaseCopa);

module.exports = router;
