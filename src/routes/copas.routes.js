// src/routes/copas.routes.js

const express = require("express");
const router = express.Router();

// ✅ Se importan las nuevas funciones
const { 
    crearCopa, 
    obtenerCopas, 
    obtenerCopaPorId,
    obtenerDetallesPublicosCopa 
} = require("../controllers/copas.controller");
const verificarToken = require("../middleware.js/auth.middleware");
const verificarRol = require("../middleware.js/verifyRole");

// --- RUTAS PÚBLICAS ---
router.get('/publico/:id/detalles', obtenerDetallesPublicosCopa);

// --- RUTAS DE ADMIN ---
router.get('/', verificarToken, verificarRol("admin"), obtenerCopas);
router.get('/:id', verificarToken, verificarRol("admin"), obtenerCopaPorId);
router.post('/', verificarToken, verificarRol("admin"), crearCopa);

module.exports = router;
