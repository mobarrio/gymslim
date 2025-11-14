// Fichero: utils/logger.js

// Lee el nivel de debug desde las variables de entorno
const DEBUG_LEVEL = parseInt(process.env.DEBUG_LEVEL || 0, 10);

/**
 * Logger de Debug Centralizado
 */
function logDebug(level, message, ...args) {
    if (DEBUG_LEVEL >= level) {
        if (args.length > 0 && args[0] !== undefined) {
             console.log(`[DEBUG ${level}] ${message}`, args);
        } else {
             console.log(`[DEBUG ${level}] ${message}`);
        }
    }
}

// Exportamos la función y el nivel para que otros módulos los usen
module.exports = { logDebug, DEBUG_LEVEL };
