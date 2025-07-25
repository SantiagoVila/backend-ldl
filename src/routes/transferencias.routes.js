const express = require('express');
const router = express.Router();

// ✅ CORRECCIÓN: Se estandariza el nombre de la variable a 'verificarToken'.
const verificarToken = require('../middleware.js/auth.middleware'); 
const verifyRole = require('../middleware.js/verifyRole');

const {
  solicitarFichaje,
  verOfertasJugador,
  responderOferta,
  verSolicitudesDT,
  cancelarSolicitud,
} = require('../controllers/transferencias.controller');

// --- Rutas para DT ---
router.post('/solicitar', verificarToken, verifyRole('dt'), solicitarFichaje);
router.get('/solicitudes-dt', verificarToken, verifyRole('dt'), verSolicitudesDT);
router.delete('/cancelar/:transferencia_id', verificarToken, verifyRole('dt'), cancelarSolicitud);

// --- Rutas para Jugador ---
router.get('/mis-ofertas', verificarToken, verifyRole('jugador'), verOfertasJugador);
router.post('/responder', verificarToken, verifyRole('jugador'), responderOferta);

module.exports = router;