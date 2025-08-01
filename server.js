require('dotenv').config();
const express = require("express");
const cors = require("cors");
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http'); 
const { Server } = require("socket.io");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ LÍNEA AÑADIDA: Esto soluciona el error del rate-limit
// Le dice a Express que confíe en el proxy (Nginx) que tiene por delante.
app.set('trust proxy', 1);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST"]
  }
});

const logger = require('./src/config/logger'); 

// ===================================================================
// --- Middleware Esencial ---
// ===================================================================

app.use(helmet());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200, 
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

const corsOptions = {
  origin: process.env.CORS_ORIGIN, 
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ===================================================================
// --- Lógica de Socket.IO ---
// ===================================================================

const activeUsers = new Map();

io.on('connection', (socket) => {
  logger.info(`Usuario conectado: ${socket.id}`);

  socket.on('register', (userId) => {
    activeUsers.set(userId.toString(), socket.id);
    logger.info(`Usuario ID ${userId} registrado con socket ID ${socket.id}`);
  });

  socket.on('disconnect', () => {
    for (let [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
        break;
      }
    }
    logger.info(`Usuario desconectado: ${socket.id}`);
  });
});

app.set('socketio', io);
app.set('activeUsers', activeUsers);

// ===================================================================
// --- Rutas de la Aplicación ---
// ===================================================================

app.get("/", (req, res) => {
    res.send("Servidor funcionando correctamente");
});

// (El resto de tus rutas no necesitan cambios)
const usuariosRoutes = require('./src/routes/usuarios.routes');
app.use('/api/usuarios', usuariosRoutes);

const authRoutes = require('./src/routes/auth.routes');
app.use('/api/auth', authRoutes);

const equiposRoutes = require('./src/routes/equipos.routes');
app.use('/api/equipos', equiposRoutes);

const mercadoRoutes = require('./src/routes/mercado.routes');
app.use('/api/mercado', mercadoRoutes);

const transferenciasRoutes = require('./src/routes/transferencias.routes');
app.use('/api/transferencias', transferenciasRoutes);

const jugadoresRoutes = require("./src/routes/jugadores.routes")
app.use('/api/jugadores', jugadoresRoutes);

const ligasRoutes = require('./src/routes/ligas.routes');
app.use('/api/ligas', ligasRoutes);

const partidosRoutes = require('./src/routes/partidos.routes');
app.use('/api/partidos', partidosRoutes);

const notificacionesRoutes = require('./src/routes/notificaciones.routes');
app.use('/api/notificaciones', notificacionesRoutes);

const noticiasRoutes = require('./src/routes/noticias.routes');
app.use('/api/noticias', noticiasRoutes);

const adminRoutes = require('./src/routes/admin.routes');
app.use('/api/admin', adminRoutes);

const reportesRoutes = require('./src/routes/reportes.routes');
app.use('/api/reportes', reportesRoutes);

const statsRoutes = require('./src/routes/stats.routes');
app.use('/api/stats', statsRoutes);

const logRoutes = require('./src/routes/log.routes');
app.use('/api/logs', logRoutes);

// ===================================================================
// --- Manejo de Errores y Arranque del Servidor ---
// ===================================================================

app.use((req, res, next) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({ error: 'Ocurrió un error en el servidor' });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`Servidor backend corriendo en http://localhost:${PORT}`);
  });
}

module.exports = { app, server };