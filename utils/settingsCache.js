// Fichero: utils/settingsCache.js (CORRECCIÓN FINAL DE CONSISTENCIA)
const { Setting } = require('../database');
const { logDebug } = require('./logger');

// Caché en memoria
let settingsCache = {};

/**
 * Carga todas las configuraciones de la BDD a la caché en memoria.
 */
async function loadSettings() {
  try {
    const settings = await Setting.findAll();
    settingsCache = {}; // Limpiar caché anterior
    settings.forEach(setting => {
      settingsCache[setting.key] = setting.value;
    });
    logDebug(1, `[Settings] Caché de configuración cargada con ${settings.length} valores.`);
  } catch (error) {
    logDebug(1, '[Settings] Error al cargar la caché de configuración:', error);
  }
}

/**
 * Obtiene un valor de la caché. Si no está, lo intenta buscar en la BDD
 * (aunque el loadSettings debería haberlo hecho).
 * @param {string} key La clave de configuración (ej. 'trusted_device_days')
 * @param {string} defaultValue El valor a devolver si la clave no existe
 * @returns {string} El valor de la configuración
 */
function getSetting(key, defaultValue) {
  // 1. Devolver de la caché si existe (el caso normal)
  if (settingsCache[key]) {
      return settingsCache[key];
  }
  
  // 2. Si no existe, devuelve el valor por defecto
  return defaultValue;
}

/**
 * Actualiza un valor en la BDD y luego en la caché.
 */
async function updateSetting(key, value) {
  try {
    // upsert = UPdate or inSERT
    await Setting.upsert({ key: key, value: value });
    // Actualizar la caché en memoria
    settingsCache[key] = value;
    logDebug(2, `[Settings] Configuración actualizada -> ${key}: ${value}`);
    return true;
  } catch (error) {
    logDebug(1, `[Settings] Error al actualizar la configuración ${key}:`, error);
    return false;
  }
}

module.exports = {
  loadSettings,
  getSetting,
  updateSetting
};
