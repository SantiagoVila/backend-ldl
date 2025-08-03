// src/routes/copas.routes.js

const express = require("express");
const router = express.Router();

const { crearCopa } = require("../controllers/copas.controller");
const verificarToken = require("../middleware.js/auth.middleware");
const verificarRol = require("../middleware.js/verifyRole");

// Por ahora solo tenemos la ruta para crear
router.post('/', verificarToken, verificarRol("admin"), crearCopa);

// Aquí podrías añadir más rutas como GET para ver las copas

module.exports = router;
