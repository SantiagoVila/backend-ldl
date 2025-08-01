const express = require('express');
const router = express.Router();

const {
    crearEquipo,
    borrarEquipo,
    asignarLiga,
    obtenerPerfilEquipo,
    obtenerTodosLosEquipos,
    obtenerMiSolicitudPendiente,
    aprobarRechazarEquipo,
    liberarJugador,
    subirEscudo,
    getDtDashboardStats
} = require('../controllers/equipos.controller');

const verificarToken = require('../middleware.js/auth.middleware');
const verifyRole = require('../middleware.js/verifyRole');
const upload = require('../middleware.js/upload');

// --- RUTA PÚBLICA ---
router.get('/publico/:id/perfil', obtenerPerfilEquipo);

// --- RUTAS PROTEGIDAS ---

// --- Rutas de Administración (Solo Admin) ---
router.get('/', verificarToken, verifyRole('admin'), obtenerTodosLosEquipos);
router.put('/:id/asignar-liga', verificarToken, verifyRole('admin'), asignarLiga);
router.put('/admin/solicitudes/:id/responder', verificarToken, verifyRole('admin'), aprobarRechazarEquipo);
router.delete('/:id', verificarToken, verifyRole('admin'), borrarEquipo);

// --- Rutas de DT ---
// ✅ CAMBIO: Se añade upload.single('escudo') para manejar la subida de la imagen
router.post('/crear', verificarToken, verifyRole('dt'), upload.single('escudo'), crearEquipo);

router.get('/:id/perfil-detallado', verificarToken, obtenerPerfilEquipo);
router.get('/dt/mi-solicitud', verificarToken, verifyRole('dt'), obtenerMiSolicitudPendiente);
router.put('/dt/liberar-jugador', verificarToken, verifyRole('dt'), liberarJugador);
router.post('/dt/mi-equipo/escudo', verificarToken, verifyRole('dt'), upload.single('escudo'), subirEscudo);
router.get('/dt/dashboard-stats', verificarToken, verifyRole('dt'), getDtDashboardStats);

module.exports = router;
