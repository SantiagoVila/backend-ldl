const express = require('express');
const router = express.Router();

// ✅ IMPORTANTE: Ahora importamos desde su PROPIO controlador
const {
    resolverDisputaCopa,
} = require('../controllers/partidos_copa.controller');

const verificarToken = require('../middleware.js/auth.middleware');
const verifyRole = require('../middleware.js/verifyRole');

// ✅ RUTA ACTUALIZADA: Permite al admin resolver una disputa de copa
// Esta ruta llama a la función especializada que maneja fases de grupo, eliminatorias, etc.
router.post(
    '/admin/resolver/:partido_id', 
    [verificarToken, verifyRole('admin')], 
    resolverDisputaCopa
);

module.exports = router;
