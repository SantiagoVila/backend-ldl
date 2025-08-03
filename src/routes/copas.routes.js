// src/routes/copas.routes.js

const express = require("express");
const router = express.Router();

const { 
    crearCopa, 
    obtenerCopas, 
    obtenerCopaPorId,
    obtenerDetallesPublicosCopa,
    borrarCopa,
    obtenerCopasPublico
} = require("../controllers/copas.controller");
const verificarToken = require("../middleware.js/auth.middleware");
const verificarRol = require("../middleware.js/verifyRole");

// --- RUTAS PÚBLICAS ---
// ✅ Estas rutas no usan 'verificarToken' y son accesibles para todos.
router.get('/publico', obtenerCopasPublico);
router.get('/publico/:id/detalles', obtenerDetallesPublicosCopa);

// --- RUTAS DE ADMIN ---
// ✅ 'verificarToken' y 'verificarRol' se aplican individualmente a cada ruta protegida.
router.get('/', verificarToken, verificarRol("admin"), obtenerCopas);
router.get('/:id', verificarToken, verificarRol("admin"), obtenerCopaPorId);
router.post('/', verificarToken, verificarRol("admin"), crearCopa);
router.delete('/:id', verificarToken, verificarRol("admin"), borrarCopa);

module.exports = router;
