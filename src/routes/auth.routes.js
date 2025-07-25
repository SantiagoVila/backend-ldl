const express = require('express');
const router = express.Router();
const { loginUsuario, forgotPassword, resetPassword, confirmarCuenta } = require('../controllers/auth.controller');

router.post('/login', loginUsuario);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// ✅ NUEVA RUTA PÚBLICA para confirmar la cuenta
router.get('/confirmar/:token', confirmarCuenta);

module.exports = router;
