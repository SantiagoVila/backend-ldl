const express = require('express');
const router = express.Router();

const { 
    obtenerNoticias, 
    crearNoticia, 
    borrarNoticia // ✅ Se importa la nueva función
} = require('../controllers/noticias.controller');

const verificarToken = require('../middleware.js/auth.middleware');
const verificarRol = require('../middleware.js/verifyRole');
const upload = require('../middleware.js/upload'); // ✅ Se importa el middleware para subir archivos

// Ruta pública para obtener todas las noticias
router.get('/', obtenerNoticias);

// ✅ RUTA CORREGIDA: Ahora usa el middleware 'upload' para procesar la imagen
router.post('/', verificarToken, verificarRol('admin'), upload.single('imagen'), crearNoticia);

// ✅ NUEVA RUTA: Ruta protegida para borrar una noticia por su ID (solo admin)
router.delete('/:id', verificarToken, verificarRol('admin'), borrarNoticia);

module.exports = router;
