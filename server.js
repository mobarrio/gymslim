require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { sequelize, initializeDatabase, BookingEmail } = require('./database');
const { logDebug } = require('./utils/logger');

// --- Configuración de Sesión con Sequelize ---
// Almacenamos las sesiones en SQLite para que persistan
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sessionStore = new SequelizeStore({
  db: sequelize,
});

// --- Configuración Global ---
const app = express();
const PORT = process.env.PORT || 3000;
const DEBUG_LEVEL = parseInt(process.env.DEBUG_LEVEL || 0, 10);

// --- Middlewares Principales ---
app.use(express.urlencoded({ extended: true })); // Parsear form-urlencoded
app.use(express.json()); // Parsear JSON
app.use(express.static(path.join(__dirname, 'public'))); // Servir ficheros estáticos

// Configurar EJS como motor de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurar Sesiones
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false, // No guardar sesiones vacías
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production' }
  })
);

// --- Middleware Global de Vistas ---
// Pasa datos útiles a *todas* las plantillas EJS
app.use(async (req, res, next) => {
  // 1. Poner el usuario de la sesión en res.locals
  res.locals.user = req.session.user || null;

  // 2. Gestionar el email de reserva activo
  if (req.session.isLoggedIn && !req.session.activeBookingEmail) {
    // Si el usuario acaba de loguearse y no tiene email activo,
    // buscamos el 'default' en la BDD
    const defaultEmail = await BookingEmail.findOne({ where: { isDefault: true } });
    req.session.activeBookingEmail = defaultEmail 
      ? defaultEmail.email 
      : (process.env.BOOKING_EMAIL || 'error@no.email'); // Fallback
  }
  res.locals.activeBookingEmail = req.session.activeBookingEmail || null;
  
  // 3. Guardar la última página visitada (para redirecciones útiles)
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/admin')) {
    req.session.lastAppPage = req.originalUrl;
  }

  next();
});

// --- Carga de Rutas ---
logDebug(3, 'Cargando rutas...');
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/app'));
app.use('/api', require('./routes/booking'));
app.use('/admin', require('./routes/admin'));

// --- Ruta CATCH-ALL (404) ---
app.all('*', (req, res) => {
  logDebug(1, `[404] Ruta no definida: ${req.method} ${req.path}`);
  res.status(404).send('Ruta no encontrada');
});

// --- Arranque del Servidor ---
async function startServer() {
  try {
    // 1. Sincroniza la BDD y crea datos por defecto
    await initializeDatabase();
    // 2. Sincroniza el almacén de sesiones
    await sessionStore.sync();
    logDebug(1, 'Almacén de sesiones sincronizado.');
    // 3. Inicia el servidor
    app.listen(PORT, () => {
      console.log(`Servidor Beta iniciado. Abre http://localhost:${PORT}`);
      if (DEBUG_LEVEL > 0) {
        console.warn(`\n*** MODO DEBUG ${DEBUG_LEVEL} ACTIVADO ***\n`);
      }
    });
  } catch (error) {
    console.error('Error fatal al iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();
