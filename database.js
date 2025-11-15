// Fichero: database.js (Versión India - CORRECCIÓN DE ARRANQUE)
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

// --- Definición de Modelos (Mismo Código) ---

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

const FavoriteActivity = sequelize.define('FavoriteActivity', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
    activityName: { type: DataTypes.STRING, allowNull: false }
});

// --- Relaciones ---
User.hasMany(TrustedDevice, { foreignKey: 'userId', onDelete: 'CASCADE' });
TrustedDevice.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(FavoriteActivity, { foreignKey: 'userId', onDelete: 'CASCADE' });
FavoriteActivity.belongsTo(User, { foreignKey: 'userId' });


// --- Sincronización (Modificada) ---

/**
 * Función que maneja la inicialización de la base de datos en dos etapas.
 */
const initDatabase = async () => {
  
  // ETAPA 1: SINCRONIZACIÓN CRÍTICA (Necesaria antes de leer CUALQUIER Setting)
  // Sincronizamos Setting (y User/Session/etc.) sin { alter: true } en el primer paso
  // para que la tabla Setting exista y podamos leer el flag.
  await Setting.sync({ alter: true });
  await User.sync({ alter: true }); 
  await Session.sync({ alter: true }); 
  
  // ETAPA 2: LÓGICA DE CONTROL DE ALTERACIÓN
  const syncStatus = await Setting.findOne({ where: { key: 'initial_sync_complete' } });
  
  // Usar alter: true solo si syncStatus es nulo (primera vez).
  // La opción `alter` ya se ha hecho en la primera etapa, pero la repetimos
  // para las tablas que no son críticas para la lectura de settings.
  const syncOptions = { alter: !syncStatus }; 
  
  if (!syncStatus) {
      logDebug(1, 'EJECUCIÓN INICIAL: Creando estructura completa.');
  } else {
      logDebug(1, 'EJECUCIÓN NORMAL: Verificando estructura.');
  }

  // 3. Sincronizamos el resto de las tablas y las que ya sincronizamos
  // (La operación `sync` de Sequelize es más segura si se llama sobre una tabla existente)
  await TrustedDevice.sync(syncOptions);
  await ApiCache.sync(syncOptions);
  await FavoriteActivity.sync(syncOptions); 

  // 4. Si era la primera vez, guardamos el flag para que no se repita (y se apague el alter:true)
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
  Setting,
  FavoriteActivity
};
