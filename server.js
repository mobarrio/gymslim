// Fichero: server.js (Versión Hotel - MODIFICADO)
require('dotenv').config(); // Cargar .env primero
const express = require('express');
const session = require('express-session');
const path = require('path');
const cookieParser = require('cookie-parser');

// Importamos 'Session' ADEMÁS de los otros
const { sequelize, initDatabase, User, Session } = require('./database'); 
const { logDebug, DEBUG_LEVEL } = require('./utils/logger'); // Importar logger
const SequelizeStore = require('connect-session-sequelize')(session.Store);

// Importar el cargador de caché (Versión Golf)
const { loadSettings } = require('./utils/settingsCache');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuración de Express ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(cookieParser()); // (Versión Foxtrot)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Sesión
const sessionStore = new SequelizeStore({
  db: sequelize,
  model: Session, // (Corrección de arranque)
  table: 'Session'
});

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

// --- Middleware Global (MODIFICADO) ---
app.use(async (req, res, next) => {
  res.locals.DEBUG_LEVEL = DEBUG_LEVEL;
  if (!req.session.userId) {
    return next();
  }
  try {
    const user = await User.findByPk(req.session.userId);
    if (user) {
      // Poner datos clave a disposición de todas las vistas (EJS)
      res.locals.user = {
        id: user.id,
        username: user.username,
        name: user.name, 
        bookingEmail: user.bookingEmail, 
        isAdmin: user.isAdmin,
        mfaEnabled: user.mfaEnabled,
        mustConfigureMfa: user.mustConfigureMfa // <-- ¡CAMBIO AÑADIDO!
      };
      
      res.locals.activeBookingEmail = user.bookingEmail; 
      req.session.mustChangePassword = user.mustChangePassword;
      
      // Actualizar datos de sesión
      req.session.user = res.locals.user; // <-- El objeto user ya incluye el nuevo flag
      
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

// --- Iniciar Servidor (Corrección Definitiva) ---
const startServer = async () => {
  try {
    // 1. Sincroniza BDD (User, ApiCache, Session, TrustedDevice, Setting)
    await initDatabase(); 

    // 2. Carga la configuración (ej. '30' días) en la memoria
    await loadSettings();
    
    // 3. Iniciar el servidor
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
