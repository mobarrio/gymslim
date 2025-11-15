// Fichero: server.js (Versión Hotel - FINAL)
require('dotenv').config(); // Cargar .env primero
const express = require('express');
const session = require('express-session');
const path = require('path');
const cookieParser = require('cookie-parser');

const { sequelize, initDatabase, User, Session } = require('./database'); 
const { logDebug, DEBUG_LEVEL } = require('./utils/logger'); 
const SequelizeStore = require('connect-session-sequelize')(session.Store);

const { loadSettings, getSetting } = require('./utils/settingsCache');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuración de Express y Middleware de Sesión ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(cookieParser());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Sesión
const sessionStore = new SequelizeStore({
  db: sequelize,
  model: Session, 
  table: 'Session'
});

// 1. INICIALIZAR EL MIDDLEWARE DE SESIÓN
app.use(session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// 2. MIDDLEWARE GLOBAL (Se ejecuta después de session)
app.use(async (req, res, next) => {
  res.locals.DEBUG_LEVEL = DEBUG_LEVEL;
  
  // Pasa la configuración global de la caché a las vistas
  res.locals.trustedDeviceDays = getSetting('trusted_device_days', '30'); 

  if (!req.session.userId) {
    return next();
  }

  try {
    const user = await User.findByPk(req.session.userId);
    if (user) {
      res.locals.user = {
        id: user.id,
        username: user.username,
        name: user.name, 
        bookingEmail: user.bookingEmail, 
        isAdmin: user.isAdmin,
        mfaEnabled: user.mfaEnabled,
        mustConfigureMfa: user.mustConfigureMfa
      };
      
      res.locals.activeBookingEmail = user.bookingEmail; 
      req.session.mustChangePassword = user.mustChangePassword;
      req.session.user = res.locals.user;
      logDebug(4, `[Session] Usuario ${user.username} cargado en res.locals`);
    } else {
      logDebug(2, `[Session] ID de sesión ${req.session.userId} no encontrado en BDD. Limpiando sesión.`);
      req.session.destroy();
    }
  } catch (error) {
    logDebug(1, '[Session] Error al cargar usuario en middleware:', error);
  }
  next();
});

// --- Importar Rutas ---
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/app');
const adminRoutes = require('./routes/admin');
const bookingRoutes = require('./routes/booking');
const profileRoutes = require('./routes/profile'); 

// --- Usar Rutas ---
app.use('/', authRoutes);
app.use('/', appRoutes);
app.use('/admin', adminRoutes);
app.use('/api', bookingRoutes);
app.use('/profile', profileRoutes);

// Ruta Catch-all (404)
app.all('*', (req, res) => {
  logDebug(1, `[404] Ruta no encontrada: ${req.method} ${req.path}`);
  res.status(404).send('Ruta no encontrada');
});

// --- Iniciar Servidor ---
const startServer = async () => {
  try {
    await initDatabase(); 
    await loadSettings(); 
    
    app.listen(PORT, () => {
      logDebug(1, `Servidor iniciado. Escuchando en http://localhost:${PORT}`);
      if (DEBUG_LEVEL > 0) {
        console.warn(`\n*** MODO DEBUG ${DEBUG_LEVEL} ACTIVADO ***\n`);
      }
    });
  } catch (error) {
    console.error("Error fatal al iniciar el servidor:", error);
    process.exit(1);
  }
};

startServer();

module.exports = { app };
