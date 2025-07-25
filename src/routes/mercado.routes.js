const express = require("express");
const router = express.Router();
const { abrirMercado, cerrarMercado, estadoMercado } = require("../controllers/mercado.controller");

// ✅ CORRECCIÓN: Se usa el nombre de variable estándar y se corrige la ruta.
const verificarToken = require("../middleware.js/auth.middleware"); // Asumiendo que renombrarás la carpeta a 'middleware'
const verifyRole = require("../middleware.js/verifyRole"); // Asumiendo que este también está en 'middleware'

// Solo el admin puede abrir/cerrar el mercado
// ✅ CORRECCIÓN: Se usa 'verificarToken' para mantener la consistencia.
router.post("/abrir", verificarToken, verifyRole("admin"), abrirMercado);
router.post("/cerrar", verificarToken, verifyRole("admin"), cerrarMercado);

// Ruta pública para consultar el estado del mercado
router.get("/estado", estadoMercado);

module.exports = router;