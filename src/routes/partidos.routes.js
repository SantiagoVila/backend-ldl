const express = require('express');
const router = express.Router();

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
    resolverDisputa, // La función que vamos a usar
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

router.put(
    '/admin/resolver/:id',
    [verificarToken, verificarRol('admin')],
    resolverDisputa
);

// Rutas generales
router.get("/", verificarToken, verificarRol("admin"), obtenerPartidos);
router.post('/', verificarToken, verificarRol('dt'), crearPartido);
router.get('/:id', verificarToken, obtenerPartidoPorId);

module.exports = router;