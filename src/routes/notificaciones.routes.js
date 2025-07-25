const express = require('express');
const router = express.Router();

// ✅ MEJORA: Se importan las funciones específicas con destructuring.
const { 
  obtenerNotificaciones, 
  enviarNotificacion, 
  marcarComoLeida 
} = require('../controllers/notificaciones.controller');

// ✅ RECOMENDACIÓN: Corregir la ruta a la carpeta 'middleware' cuando la renombres.
const verificarToken = require('../middleware.js/auth.middleware');

// Este middleware se aplica a TODAS las rutas de este archivo.
// Significa que un usuario debe estar logueado para cualquier operación de notificación.
router.use(verificarToken);

// Define las rutas usando las funciones importadas
router.get('/', obtenerNotificaciones);
router.post('/', enviarNotificacion); // Considera añadir un verifyRole('admin') aquí si es necesario
router.put('/:id/leida', marcarComoLeida);

module.exports = router;