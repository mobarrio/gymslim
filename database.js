// Fichero: database.js (Versión Papa - MODIFICADO)
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

// --- Definición de Modelos (Sin cambios en las definiciones) ---

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true, 
  },
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
  },
  mustConfigureMfa: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

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

const Session = sequelize.define('Session', {
  sid: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  userId: DataTypes.STRING,
  expires: DataTypes.DATE,
  data: DataTypes.TEXT,
});

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
  timestamps: false 
});

const FavoriteActivity = sequelize.define('FavoriteActivity', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id',
        },
    },
    activityName: {
        type: DataTypes.STRING,
        allowNull: false,
    }
});
// --- FIN MODELOS ---


// --- Relaciones ---
User.hasMany(TrustedDevice, { foreignKey: 'userId', onDelete: 'CASCADE' });
TrustedDevice.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(FavoriteActivity, { foreignKey: 'userId', onDelete: 'CASCADE' });
FavoriteActivity.belongsTo(User, { foreignKey: 'userId' });


// --- Sincronización ---
const initDatabase = async () => {
  
  // Sincronización robusta (Versión Kilo)
  await Setting.sync({ alter: true });
  await User.sync({ alter: true }); 
  await Session.sync({ alter: true }); 
  
  const syncStatus = await Setting.findOne({ where: { key: 'initial_sync_complete' } });
  
  const syncOptions = { alter: !syncStatus }; 
  
  if (!syncStatus) {
      logDebug(1, 'EJECUCIÓN INICIAL: Usando ALTER: TRUE para crear todas las columnas...');
  } else {
      logDebug(1, 'EJECUCIÓN NORMAL: Usando SINCRONIZACIÓN SEGURA (alter: false) para verificar estructura.');
  }

  await TrustedDevice.sync(syncOptions);
  await ApiCache.sync(syncOptions);
  await FavoriteActivity.sync(syncOptions); 

  if (!syncStatus) {
      await Setting.create({ key: 'initial_sync_complete', value: 'true' });
      logDebug(1, 'Flag "initial_sync_complete" guardado en la BDD.');
  }
  
  logDebug(1, 'Base de datos sincronizada.');


  // Código de inicialización
  try {
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

    // Inicializar Configuración de Días de Confianza (Versión Golf)
    await Setting.findOrCreate({
      where: { key: 'trusted_device_days' },
      defaults: { value: '30' }
    });
    
    // --- ¡NUEVO! Inicializar Configuración de Caché (Versión Papa) ---
    await Setting.findOrCreate({
      where: { key: 'cache_enabled' },
      defaults: { value: 'true' } // Caché activada por defecto
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
  Setting,
  FavoriteActivity
};
