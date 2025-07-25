// src/routes/usuarios.routes.js

const express = require("express");
const router = express.Router();
const { body } = require('express-validator'); // Importamos 'body' para crear las reglas

const { 
  registrarUsuario, 
  obtenerTodosLosUsuarios, 
  solicitarRolDT,
  verSolicitudesRol,
  obtenerUsuarioPorId,
  actualizarRolUsuario,   
  actualizarEquipoUsuario,
   cambiarPassword,
   subirAvatar,
   actualizarPerfil,
   getPublicDtProfile 
} = require('../controllers/usuarios.controller');

const verificarToken = require("../middleware.js/auth.middleware");
const verifyRole = require('../middleware.js/verifyRole');
const upload = require('../middleware.js/upload');

// --- RUTAS DE USUARIOS ---

router.post(
    '/register',
    // ✅ REGLAS DE VALIDACIÓN AÑADIDAS
    [
        body('email', 'El email proporcionado no es válido.').isEmail(),
        body('password', 'La contraseña debe tener al menos 8 caracteres.').isLength({ min: 8 }),
        body('nombre_in_game', 'El nombre en el juego es obligatorio.').not().isEmpty().trim().escape(),
        body('numero_remera', 'El número de remera debe estar entre 1 y 99.').optional({ checkFalsy: true }).isInt({ min: 1, max: 99 })
    ],
    registrarUsuario
);

router.get('/publico/dt/:id', getPublicDtProfile);

// Ruta para obtener todos los usuarios (protegida para admins)
router.get("/", verificarToken, verifyRole('admin'), obtenerTodosLosUsuarios);

// Ruta para que un jugador solicite ser DT
router.post("/solicitar-dt", verificarToken, verifyRole('jugador'), solicitarRolDT);

// Ruta para que un admin vea las solicitudes de roles
router.get("/solicitudes", verificarToken, verifyRole("admin"), verSolicitudesRol);

router.get("/:id", verificarToken, obtenerUsuarioPorId);

router.put("/:id/rol", verificarToken, verifyRole('admin'), actualizarRolUsuario);
router.put("/:id/equipo", verificarToken, verifyRole('admin'), actualizarEquipoUsuario);

router.put('/cambiar-password', verificarToken, cambiarPassword);

router.post('/avatar', verificarToken, upload.single('avatar'), subirAvatar);

router.put('/perfil', verificarToken, actualizarPerfil);

// Ruta protegida de prueba 
router.get('/protegida', verificarToken, (req, res) => {
  res.json({
    message: 'Accediste a una ruta protegida',
    usuario: req.usuario,
  });
});


module.exports = router;