const express = require('express');
const router = express.Router();

// --- IMPORTACIONES (CON DEPURACIÓN) ---

console.log("--- Depurando admin.routes.js ---");

const adminController = require('../controllers/admin.controller');
console.log("Contenido de admin.controller:", adminController);

const mercadoController = require('../controllers/mercado.controller');
console.log("Contenido de mercado.controller:", mercadoController);

const usuariosController = require('../controllers/usuarios.controller');
console.log("Contenido de usuarios.controller:", usuariosController);

const { 
    moverJugador, crearEquipoYAsignarDT, obtenerReportes, marcarReporteComoAtendido,
    programarMercado, generarFixtureLiga, responderSolicitudRol, adminCreaEquipo,
    finalizarTemporada, ejecutarAscensosDescensos, crearNuevaTemporada, crearSancion,
    obtenerSancionesPorJugador, getDashboardStats
} = adminController;

const { abrirMercadoManual, cerrarMercadoManual } = mercadoController;
const { verSolicitudesRol } = usuariosController;

const verificarToken = require('../middleware.js/auth.middleware'); 
const verifyRole = require('../middleware.js/verifyRole');
const upload = require('../middleware.js/upload');

console.log("--- Todas las importaciones parecen correctas, definiendo rutas... ---");

// --- RUTAS DE ADMINISTRADOR ---

router.get('/solicitudes', verificarToken, verifyRole('admin'), verSolicitudesRol);
router.post('/equipos', verificarToken, verifyRole('admin'), upload.single('escudo'), adminCreaEquipo);
router.post('/mover-jugador', verificarToken, verifyRole('admin'), moverJugador);
router.post('/ligas/:liga_id/generar-fixture', verificarToken, verifyRole('admin'), generarFixtureLiga);
router.put("/solicitudes/:id/responder", verificarToken, verifyRole("admin"), responderSolicitudRol);
router.post('/crear-equipo', verificarToken, verifyRole('admin'), crearEquipoYAsignarDT);
router.put('/mercado/programar', verificarToken, verifyRole('admin'), programarMercado);
router.get('/reportes', verificarToken, verifyRole('admin'), obtenerReportes);
router.put('/reportes/:id/atender', verificarToken, verifyRole('admin'), marcarReporteComoAtendido);
router.put('/ligas/:liga_id/finalizar-temporada', verificarToken, verifyRole('admin'), finalizarTemporada);
router.post('/ligas/:id/nueva-temporada', verificarToken, verifyRole('admin'), crearNuevaTemporada);
router.post('/promocion-descenso', verificarToken, verifyRole('admin'), ejecutarAscensosDescensos);
router.post('/sanciones', verificarToken, verifyRole('admin'), crearSancion);
router.get('/usuarios/:id/sanciones', verificarToken, verifyRole('admin'), obtenerSancionesPorJugador);
router.get('/dashboard-stats', verificarToken, verifyRole('admin'), getDashboardStats);

// --- RUTAS PARA GESTIÓN MANUAL DEL MERCADO ---
router.post(
    '/mercado/abrir',
    [verificarToken, verifyRole('admin')],
    abrirMercadoManual
);

router.post(
    '/mercado/cerrar',
    [verificarToken, verifyRole('admin')],
    cerrarMercadoManual
);

console.log("--- Definición de rutas completada sin errores. ---");

module.exports = router;