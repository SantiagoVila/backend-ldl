const express = require('express');
const router = express.Router();

const { 
    moverJugador, 
    crearEquipoYAsignarDT, 
    obtenerReportes, 
    marcarReporteComoAtendido,
    programarMercado,
    generarFixtureLiga,
    responderSolicitudRol,
    adminCreaEquipo,
    finalizarTemporada,
    ejecutarAscensosDescensos,
    crearNuevaTemporada,
    crearSancion,
    obtenerSancionesPorJugador,
    getDashboardStats,
    abrirMercadoManual,
    cerrarMercadoManual
} = require('../controllers/admin.controller');

const { verSolicitudesRol } = require('../controllers/usuarios.controller');

const authMiddleware = require('../middleware.js/auth.middleware'); 
const verifyRole = require('../middleware.js/verifyRole');
const verificarToken = require('../middleware.js/auth.middleware');
const upload = require('../middleware.js/upload'); // ✅ Se importa el middleware para subir archivos

// --- RUTAS DE ADMINISTRADOR ---

router.get('/solicitudes', verificarToken, verifyRole('admin'), verSolicitudesRol);

// ✅ RUTA CORREGIDA: Ahora usa el middleware 'upload' para procesar la imagen del escudo
router.post('/equipos', authMiddleware, verifyRole('admin'), upload.single('escudo'), adminCreaEquipo);

// ... (El resto de tus rutas se quedan igual)
router.post('/mover-jugador', authMiddleware, verifyRole('admin'), moverJugador);
router.post('/ligas/:liga_id/generar-fixture', authMiddleware, verifyRole('admin'), generarFixtureLiga);
router.put("/solicitudes/:id/responder", verificarToken, verifyRole("admin"), responderSolicitudRol);
router.post('/crear-equipo', authMiddleware, verifyRole('admin'), crearEquipoYAsignarDT);
router.put('/mercado/programar', authMiddleware, verifyRole('admin'), programarMercado);
router.get('/reportes', authMiddleware, verifyRole('admin'), obtenerReportes);
router.put('/reportes/:id/atender', authMiddleware, verifyRole('admin'), marcarReporteComoAtendido);
router.put('/ligas/:liga_id/finalizar-temporada', authMiddleware, verifyRole('admin'), finalizarTemporada);
router.post('/ligas/:id/nueva-temporada', authMiddleware, verifyRole('admin'), crearNuevaTemporada);
router.post('/promocion-descenso', authMiddleware, verifyRole('admin'), ejecutarAscensosDescensos);
router.post('/sanciones', authMiddleware, verifyRole('admin'), crearSancion);
router.get('/usuarios/:id/sanciones', authMiddleware, verifyRole('admin'), obtenerSancionesPorJugador);
router.get('/dashboard-stats', authMiddleware, verifyRole('admin'), getDashboardStats);

router.post(
    '/mercado/abrir',
    verificarToken, 
    verifyRole('admin'),
    abrirMercadoManual
);

router.post(
    '/mercado/cerrar',
    verificarToken, 
    verifyRole('admin'),
    cerrarMercadoManual
);

module.exports = router;
