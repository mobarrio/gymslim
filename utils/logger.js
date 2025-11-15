// Fichero: utils/logger.js
const DEBUG_LEVEL = parseInt(process.env.DEBUG_LEVEL || 0, 10);

/**
 * Logger de Debug Centralizado
 */
function logDebug(level, message, ...args) {
    if (DEBUG_LEVEL >= level) {
        if (args.length > 0) {
            console.log(`[DEBUG ${level}] ${message}`);
            args.forEach(arg => console.dir(arg, { depth: null }));
        } else {
            console.log(`[DEBUG ${level}] ${message}`);
        }
    }
}

module.exports = {
  logDebug,
  DEBUG_LEVEL
};
