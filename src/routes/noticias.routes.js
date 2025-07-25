const express = require('express');
const router = express.Router();

// ✅ MEJORA: Se importan las funciones específicas con destructuring para mayor claridad.
const { obtenerNoticias, crearNoticia } = require('../controllers/noticias.controller');

// ✅ RECOMENDACIÓN: Corregir la ruta a la carpeta 'middleware' cuando la renombres.
const verificarToken = require('../middleware.js/auth.middleware');
const verificarRol = require('../middleware.js/verifyRole');

// Ruta pública para obtener todas las noticias
router.get('/', obtenerNoticias);

// Ruta protegida para crear una nueva noticia (solo admin)
router.post('/', verificarToken, verificarRol('admin'), crearNoticia);

module.exports = router;