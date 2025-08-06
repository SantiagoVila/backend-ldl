const express = require('express');
const router = express.Router();
const mercadoController = require('../controllers/mercado.controller');
const verificarToken = require('../middleware.js/auth.middleware'); // Asegúrate que la ruta sea correcta

// Ruta pública (o para usuarios logueados) para saber si el mercado está abierto
router.get('/estado', verificarToken, mercadoController.getEstadoMercado);

module.exports = router;
