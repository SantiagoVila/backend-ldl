const express = require('express');
const router = express.Router();
const logController = require('../controllers/log.controller');
const verificarToken = require('../middleware.js/auth.middleware');
const verifyRole = require('../middleware.js/verifyRole');

// Ruta protegida para que solo los administradores puedan ver los logs
router.get('/', verificarToken, verifyRole('admin'), logController.getLogs);

module.exports = router;
