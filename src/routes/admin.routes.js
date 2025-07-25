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
  getDashboardStats // ✅ Se importa la nueva función
} = require('../controllers/admin.controller');

const authMiddleware = require('../middleware.js/auth.middleware'); 
const verifyRole = require('../middleware.js/verifyRole');
const verificarToken = require('../middleware.js/auth.middleware');

// --- RUTAS DE ADMINISTRADOR ---
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


// ✅ NUEVA RUTA: Admin crea un equipo directamente
router.post('/equipos', authMiddleware, verifyRole('admin'), adminCreaEquipo);

module.exports = router;
