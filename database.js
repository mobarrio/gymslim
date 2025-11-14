// Fichero: database.js (Versión Hotel - CORRECCIÓN DE SINCRONIZACIÓN FINAL)
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const { logDebug } = require('./utils/logger'); 
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DB_STORAGE || 'database.db',
  logging: (msg) => logDebug(4, '[DB]', msg)
});

// --- Definición de Modelos (Sin cambios en las definiciones) ---

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: true },
  bookingEmail: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  mustChangePassword: { type: DataTypes.BOOLEAN, defaultValue: false },
  isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
  mfaEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  mfaSecret: { type: DataTypes.STRING, allowNull: true },
  mustConfigureMfa: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const ApiCache = sequelize.define('ApiCache', {
  cacheKey: { type: DataTypes.STRING, primaryKey: true },
  data: { type: DataTypes.TEXT, allowNull: false },
  expiresAt: { type: DataTypes.DATE }
});

const Session = sequelize.define('Session', {
  sid: { type: DataTypes.STRING, primaryKey: true },
  userId: DataTypes.STRING,
  expires: DataTypes.DATE,
  data: DataTypes.TEXT,
});

const TrustedDevice = sequelize.define('TrustedDevice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
  token: { type: DataTypes.STRING, allowNull: false, unique: true },
  userAgent: { type: DataTypes.STRING, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false }
});

const Setting = sequelize.define('Setting', {
  key: { type: DataTypes.STRING, primaryKey: true },
  value: { type: DataTypes.STRING, allowNull: true }
}, {
  timestamps: false 
});

// --- Relaciones ---
User.hasMany(TrustedDevice, { foreignKey: 'userId', onDelete: 'CASCADE' });
TrustedDevice.belongsTo(User, { foreignKey: 'userId' });


// --- Sincronización (Modificada) ---
const initDatabase = async () => {
  
  // 1. Verificar si la base de datos ya tiene el flag de sincronización inicial
  const syncStatus = await Setting.findOne({ where: { key: 'initial_sync_complete' } });
  
  const syncOptions = { alter: !syncStatus }; // Usar alter: true solo si syncStatus es nulo (primera vez)
  
  if (!syncStatus) {
      logDebug(1, 'EJECUCIÓN INICIAL: Usando ALTER: TRUE para crear todas las columnas...');
  } else {
      logDebug(1, 'EJECUCIÓN NORMAL: Usando SINCRONIZACIÓN SEGURA (alter: false) para verificar estructura.');
  }

  // 2. Sincronizamos todos los modelos con las opciones condicionales
  await User.sync(syncOptions); 
  await ApiCache.sync(syncOptions);
  await Session.sync(syncOptions);
  await TrustedDevice.sync(syncOptions);
  await Setting.sync(syncOptions); 
  
  // 3. Si era la primera vez, guardamos el flag para que no se repita
  if (!syncStatus) {
      await Setting.create({ key: 'initial_sync_complete', value: 'true' });
      logDebug(1, 'Flag "initial_sync_complete" guardado en la BDD.');
  }
  
  logDebug(1, 'Base de datos sincronizada.');


  // Código de inicialización (Admin y Configuración)
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

    await Setting.findOrCreate({
      where: { key: 'trusted_device_days' },
      defaults: { value: '30' }
    });

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
  Setting
};
