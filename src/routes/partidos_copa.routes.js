// src/routes/partidos_copa.routes.js

const express = require("express");
const router = express.Router();

const { confirmarResultadoCopa } = require("../controllers/partidos_copa.controller");
const verificarToken = require("../middleware.js/auth.middleware");
const verificarRol = require("../middleware.js/verifyRole");

// Ruta para que un admin confirme el resultado de un partido de copa
router.put('/:id/confirmar', verificarToken, verificarRol("admin"), confirmarResultadoCopa);

module.exports = router;
