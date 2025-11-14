const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

// Configura la conexión a la base de datos SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DB_STORAGE || 'database.db',
  logging: (msg) => logDebug(4, '[DB]', msg) // Log BDD si DEBUG_LEVEL >= 4
});

// --- Definición de Modelos ---

// Modelo de Usuario
const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mustChangePassword: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

// Modelo para la Caché de API
// Guardamos la respuesta JSON completa como texto
const ApiCache = sequelize.define('ApiCache', {
  cacheKey: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  data: {
    type: DataTypes.TEXT, // Almacena el JSON como string
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE, // Para invalidar la caché
    allowNull: false
  }
});

// Modelo para los Emails de Reserva
const BookingEmail = sequelize.define('BookingEmail', {
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

// --- Sincronización e Inicialización ---
// Función de logger simple (ya que el logger completo está en server.js)
function logDebug(level, ...args) {
  if ((process.env.DEBUG_LEVEL || 0) >= level) {
    console.log(...args);
  }
}

// Función para inicializar la BDD (sincronizar y crear datos por defecto)
async function initializeDatabase() {
  try {
    // Sincroniza los modelos con la base de datos
    await sequelize.sync({ force: false }); // force: false para no borrar datos
    logDebug(1, '[DB] Base de datos sincronizada.');

    // --- Seed: Crear usuario Admin por defecto si no existe ---
    const userCount = await User.count();
    if (userCount === 0) {
      logDebug(1, '[DB] No hay usuarios. Creando usuario "admin"...');
      const passwordHash = await bcrypt.hash('admin', parseInt(process.env.SALT_ROUNDS, 10));
      await User.create({
        username: 'admin',
        passwordHash: passwordHash,
        mustChangePassword: true,
        isAdmin: true // El primer usuario es Admin
      });
      logDebug(1, '[DB] Usuario "admin" (pass: "admin") creado.');
    }

    // --- Seed: Crear email de reserva por defecto si no existe ---
    const emailCount = await BookingEmail.count();
    if (emailCount === 0) {
      logDebug(1, '[DB] No hay emails de reserva. Creando email por defecto...');
      await BookingEmail.create({
        email: process.env.BOOKING_EMAIL || 'mariano.obarrio@gmail.com',
        isDefault: true
      });
      logDebug(1, '[DB] Email de reserva por defecto creado.');
    }
  } catch (error) {
    console.error('[DB] Error al inicializar la base de datos:', error);
    process.exit(1);
  }
}

module.exports = {
  sequelize,
  initializeDatabase,
  User,
  ApiCache,
  BookingEmail
};
