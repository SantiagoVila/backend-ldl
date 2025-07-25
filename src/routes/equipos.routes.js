const express = require('express');
const router = express.Router();

// ✅ Se importan todas las funciones necesarias del controlador
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

// ===================================================================
// --- RUTA PÚBLICA ---
// Cualquier persona, incluso sin iniciar sesión, puede ver el perfil de un equipo.
// ===================================================================
router.get('/publico/:id/perfil', obtenerPerfilEquipo);


// ===================================================================
// --- RUTAS PROTEGIDAS ---
// ===================================================================

// --- Rutas de Administración (Solo Admin) ---
router.get('/', verificarToken, verifyRole('admin'), obtenerTodosLosEquipos);
router.put('/:id/asignar-liga', verificarToken, verifyRole('admin'), asignarLiga);
router.put('/admin/solicitudes/:id/responder', verificarToken, verifyRole('admin'), aprobarRechazarEquipo);

// --- Rutas de Gestión (Admin o DT) ---
router.post('/crear', verificarToken, verifyRole(['dt', 'admin']), crearEquipo);
router.delete('/eliminar', verificarToken, verifyRole(['dt', 'admin']), borrarEquipo);

// --- Rutas de Consulta (Cualquier usuario logueado) ---
router.get('/:id/perfil-detallado', verificarToken, obtenerPerfilEquipo);

// --- Rutas Específicas del DT ---
router.get('/dt/mi-solicitud', verificarToken, verifyRole('dt'), obtenerMiSolicitudPendiente);
router.put('/dt/liberar-jugador', verificarToken, verifyRole('dt'), liberarJugador);

router.post('/dt/mi-equipo/escudo', verificarToken, verifyRole('dt'), upload.single('escudo'), subirEscudo);

router.get('/dt/dashboard-stats', verificarToken, verifyRole('dt'), getDtDashboardStats);

module.exports = router;
