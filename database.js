// Fichero: database.js (Versión Golf - MODIFICADO)
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const { logDebug } = require('./utils/logger'); // Importar logger
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DB_STORAGE || 'database.db',
  logging: (msg) => logDebug(4, '[DB]', msg)
});

// --- Definición de Modelos ---

// Modelo de Usuario (Sin cambios)
const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bookingEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
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
  },
  mfaEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  mfaSecret: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

// Modelo para la Caché de API (Sin cambios)
const ApiCache = sequelize.define('ApiCache', {
  cacheKey: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  data: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
  }
});

// Modelo de Sesión (Sin cambios)
const Session = sequelize.define('Session', {
  sid: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  userId: DataTypes.STRING,
  expires: DataTypes.DATE,
  data: DataTypes.TEXT,
});

// Modelo de Dispositivos de Confianza (Sin cambios)
const TrustedDevice = sequelize.define('TrustedDevice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  userAgent: {
    type: DataTypes.STRING,
    allowNull: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  }
});

// --- ¡NUEVO MODELO! (Configuración) ---
const Setting = sequelize.define('Setting', {
  key: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  value: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  timestamps: false // No necesitamos createdAt/updatedAt
});
// --- FIN NUEVO MODELO ---


// --- Relaciones ---
User.hasMany(TrustedDevice, { foreignKey: 'userId', onDelete: 'CASCADE' });
TrustedDevice.belongsTo(User, { foreignKey: 'userId' });


// --- Sincronización ---
const initDatabase = async () => {
  
  // Sincronizamos explícitamente TODOS nuestros modelos
  await User.sync({ alter: true });
  await ApiCache.sync({ alter: true });
  await Session.sync({ alter: true }); 
  await TrustedDevice.sync({ alter: true });
  await Setting.sync({ alter: true }); // <-- AÑADIDO

  logDebug(1, 'Modelos [User], [ApiCache], [Session], [TrustedDevice] y [Setting] sincronizados.');

  // Código de inicialización
  try {
    // Inicializar Admin
    const adminUser = await User.findOne({ where: { username: 'admin' } });
    if (!adminUser) {
      logDebug(1, 'No se encontró admin, creando usuario "admin" por defecto...');
      const passwordHash = await bcrypt.hash('admin', parseInt(process.env.SALT_ROUNDS, 10));
      await User.create({
        username: 'admin',
        passwordHash: passwordHash,
        isAdmin: true,
        mustChangePassword: true,
        name: 'Administrador'
      });
    }

    // --- ¡NUEVO! Inicializar Configuración por Defecto ---
    await Setting.findOrCreate({
      where: { key: 'trusted_device_days' },
      defaults: { value: '30' } // Valor por defecto de 30 días
    });
    // --- FIN NUEVO ---

  } catch (error) {
    logDebug(1, 'Error al inicializar la base de datos:', error);
  }
};

module.exports = {
  sequelize,
  initDatabase,
  User,
  ApiCache,
  Session,
  TrustedDevice,
  Setting // <-- Exportar el nuevo modelo
};
