// En: backend/src/routes/stats.routes.js

const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');

// Ruta pública para obtener los líderes de la plataforma
router.get('/lideres', statsController.getLideresGlobales);

router.get('/ultimos-fichajes', statsController.getUltimosFichajes);

module.exports = router;