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
    crearReporte,              // <-- Nueva función para reportes de DT
    resolverDisputa,           // <-- Nueva función para que el admin resuelva
    obtenerPartidosParaRevision,
    adminCargarResultado // <-- Nueva función para la página de admin
} = require('../controllers/partidos.controller');

// Usamos los nombres de tus middlewares
const verificarToken = require('../middleware.js/auth.middleware');
const verificarRol = require('../middleware.js/verifyRole');
const upload = require('../middleware.js/upload'); 

// --- RUTAS PÚBLICAS (Sin cambios) ---
router.get("/publico/recientes", obtenerPartidosPublico);
router.get('/publico/:id', getPartidoPublico);

// --- RUTAS PROTEGIDAS ---

// Rutas de consulta generales
router.get("/", verificarToken, verificarRol("admin"), obtenerPartidos);
router.get('/:id', verificarToken, obtenerPartidoPorId);

// Crear un partido
router.post('/', verificarToken, verificarRol('dt'), crearPartido);

// Rutas para el DT
router.get('/dt/mis-partidos', verificarToken, verificarRol('dt'), obtenerPartidosDT);
router.get('/dt/partido-para-reportar/:tipo/:id', verificarToken, verificarRol('dt'), getPartidoParaReportar);

// ✅ 2. NUEVAS RUTAS PARA EL SISTEMA v2.0
// Ruta para que un DT envíe su reporte
router.post(
    '/reportar/:tipo/:partido_id',
    [verificarToken, verificarRol('dt')],
    upload.array('imagen_resultado', 1), // Usamos upload.array para más seguridad
    crearReporte
);

// Ruta para que un Admin obtenga los partidos a revisar
router.get(
    '/admin/revision',
    [verificarToken, verificarRol('admin')],
    obtenerPartidosParaRevision
);

router.post(
    '/admin/cargar-resultado/:tipo/:partido_id',
    [verificarToken, verificarRol('admin')],
    adminCargarResultado
);

// Ruta para que un Admin resuelva una disputa o confirme un reporte único
router.post(
    '/admin/resolve/:tipo/:id', // <<< CAMBIO: "resolver" ahora es "resolve"
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
