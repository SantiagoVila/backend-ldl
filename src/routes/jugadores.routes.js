// En: backend/src/routes/jugadores.routes.js

const express = require("express");
const router = express.Router();

const jugadoresController = require("../controllers/jugadores.controller");
const historialController = require("../controllers/historial.controller"); // Este se mantiene
const verificarToken = require("../middleware.js/auth.middleware");
const authOptional = require("../middleware.js/auth.optional");
const verifyRole = require("../middleware.js/verifyRole");


// --- RUTAS DE JUGADORES ---

// Búsqueda y perfiles públicos/protegidos
router.get("/buscar", authOptional, jugadoresController.buscarJugadoresPorNombre);
router.get("/publico/:id", jugadoresController.obtenerPerfilPublicoJugador);
router.get("/perfil/:id", verificarToken, jugadoresController.buscarPerfilJugador);
router.get("/perfil/:id/detallado", verificarToken, jugadoresController.obtenerPerfilJugadorDetallado);
router.get("/equipo/:equipoId", jugadoresController.verJugadoresPorEquipo);
router.get("/:id/historial", historialController.obtenerHistorialPorJugador);

// Rutas del Mercado para el DT
router.get('/mercado', verificarToken, verifyRole('dt'), jugadoresController.obtenerJugadoresFichables);

// Ruta del Calendario para el Jugador
router.get('/mi-calendario', verificarToken, verifyRole('jugador'), jugadoresController.obtenerMiCalendario);


module.exports = router;