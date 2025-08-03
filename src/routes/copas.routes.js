// src/routes/copas.routes.js

const express = require("express");
const router = express.Router();

const { crearCopa } = require("../controllers/copas.controller");
const verificarToken = require("../middleware.js/auth.middleware");
const verificarRol = require("../middleware.js/verifyRole");

// Esta es la línea 11 que daba el error. 
// Ahora 'crearCopa' será una función válida porque el controlador la exporta correctamente.
router.post('/', verificarToken, verificarRol("admin"), crearCopa);

module.exports = router;