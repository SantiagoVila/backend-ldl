const express = require('express');
const router = express.Router();

// =================================================================
// <<<<<<<<<<<<<<<<< ESPÍA DE DEPURACIÓN >>>>>>>>>>>>>>>>>
// Este código nos dirá si las peticiones están llegando a este archivo.
// No lo quites hasta que solucionemos el problema.
router.use((req, res, next) => {
    console.log(`[ESPÍA en partidos.routes.js] -> Petición recibida: ${req.method} ${req.originalUrl}`);
    next();
});
// =================================================================

// --- 1. IMPORTACIONES ---
const { 
    crearPartido, 
    obtenerPartidos,
    obtenerPartidosDT,
    obtenerPartidoPorId,
    obtenerPartidosPublico,
    getPartidoPublico,
    getPartidoParaReportar,
    crearReporte,
    resolverDisputa, // La función que estamos depurando
    obtenerPartidosParaRevision,
    adminCargarResultado
} = require('../controllers/partidos.controller');

const verificarToken = require('../middleware.js/auth.middleware');
const verificarRol = require('../middleware.js/verifyRole');
const upload = require('../middleware.js/upload'); 

// --- 2. RUTAS PÚBLICAS ---
router.get("/publico/recientes", obtenerPartidosPublico);
router.get('/publico/:id', getPartidoPublico);

// --- 3. RUTAS PROTEGIDAS ---

// Rutas para el DT
router.get('/dt/mis-partidos', verificarToken, verificarRol('dt'), obtenerPartidosDT);
router.get('/dt/partido-para-reportar/:tipo/:id', verificarToken, verificarRol('dt'), getPartidoParaReportar);
router.post(
    '/reportar/:tipo/:partido_id',
    [verificarToken, verificarRol('dt')],
    upload.array('imagen_resultado', 1),
    crearReporte
);

// Rutas para el Admin
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

// =================================================================
// <<<<<<<<<<<<<<<<< RUTA PROBLEMÁTICA (VERSIÓN FINAL) >>>>>>>>>>>>>>>>>
// Esta es la ruta que debe coincidir con la URL de la consola.
// URL de la consola: .../admin/resolve/liga/333
// La ruta debe ser: '/admin/resolve/:tipo/:id'
router.post(
    '/admin/resolve/:tipo/:id', 
    [verificarToken, verificarRol('admin')],
    resolverDisputa
);
// =================================================================

// Rutas generales (más genéricas, por eso van después de las más específicas)
router.get("/", verificarToken, verificarRol("admin"), obtenerPartidos);
router.post('/', verificarToken, verificarRol('dt'), crearPartido);
router.get('/:id', verificarToken, obtenerPartidoPorId); // Esta es muy genérica, es importante que vaya al final.


module.exports = router;