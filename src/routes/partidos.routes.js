const express = require('express');
const router = express.Router();

// ✅ 1. IMPORTACIONES ACTUALIZADAS
const { 
    crearPartido, 
    obtenerPartidos,
    obtenerPartidosDT,
    obtenerPartidoPorId,
    obtenerPartidosPublico,
    getPartidoPublico,
    getPartidoParaReportar,
    crearReporte,          // <-- NUEVA función para reportes de DT
    resolverDisputa        // <-- NUEVA función para que el admin resuelva
} = require('../controllers/partidos.controller');

// Asumo que la ruta a tus middlewares es esta, ajústala si es necesario
const verificarToken = require('../middleware.js/auth.middleware');
const verificarRol = require('../middleware.js/verifyRole'); // Asegúrate que el nombre de archivo sea correcto
const upload = require('../middleware.js/upload'); 

// --- RUTAS PÚBLICAS (Sin cambios) ---
router.get("/publico/recientes", obtenerPartidosPublico);
router.get('/publico/:id', getPartidoPublico);

// --- RUTAS PROTEGIDAS ---

// Rutas de consulta generales (sin cambios)
router.get("/", verificarToken, verificarRol("admin"), obtenerPartidos);
router.get('/:id', verificarToken, obtenerPartidoPorId);

// Crear un partido (sin cambios)
router.post('/', verificarToken, verificarRol('dt'), crearPartido);

// Obtener partidos para el DT (sin cambios en la ruta, pero el controlador fue modificado)
router.get('/dt/mis-partidos', verificarToken, verificarRol('dt'), obtenerPartidosDT);

// Obtener datos de un partido específico para la página de reporte (sin cambios)
router.get('/dt/partido-para-reportar/:tipo/:id', verificarToken, verificarRol('dt'), getPartidoParaReportar);


// ✅ 2. NUEVAS RUTAS PARA EL SISTEMA v2.0
// Ruta para que un DT envíe su reporte
router.post(
    '/reportar/:tipo/:partido_id',
    [verificarToken, verificarRol('dt')],
    upload.array('imagen_resultado', 1), // Más seguro que upload.any()
    crearReporte
);

// Ruta para que un Admin resuelva una disputa
router.post(
    '/admin/resolver/:partido_id',
    [verificarToken, verificarRol('admin')],
    resolverDisputa
);


/*
  ❌ 3. RUTAS OBSOLETAS (Eliminadas)
  Las siguientes rutas usaban los controladores viejos y ya no son necesarias.

  router.put('/:id/confirmar', ...);
  router.put('/dt/reportar/:tipo/:id', ...);
*/

module.exports = router;