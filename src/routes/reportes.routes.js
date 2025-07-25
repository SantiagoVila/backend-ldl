const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware.js/auth.middleware');
const { enviarReporte } = require('../controllers/reportes.controller');

router.post('/enviar', authMiddleware, enviarReporte);

module.exports = router;