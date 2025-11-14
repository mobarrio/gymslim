// Fichero: utils/encryption.js (NUEVO)
const crypto = require('crypto');
const { logDebug } = require('./logger');

// Asegurarse de que la clave de encriptación esté definida
const ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY; // 64 hex chars (32 bytes)
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  logDebug(1, '[Crypto] Error fatal: MFA_ENCRYPTION_KEY no está definida o no tiene 64 caracteres.');
  // En producción, deberías lanzar un error
  // throw new Error('MFA_ENCRYPTION_KEY no está configurada correctamente.');
}
const key = Buffer.from(ENCRYPTION_KEY, 'hex');

const IV_LENGTH = 16; // Para AES, esto es 16 bytes

/**
 * Encripta un texto (usado para el secreto de MFA)
 * @param {string} text El secreto de MFA en texto plano
 * @returns {string} El secreto encriptado (iv:encryptedData)
 */
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Devuelve el IV y los datos encriptados, separados por ':'
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    logDebug(1, '[Crypto] Error al encriptar:', error);
    return null;
  }
}

/**
 * Desencripta un texto (usado para el secreto de MFA)
 * @param {string} text El secreto encriptado (iv:encryptedData)
 * @returns {string} El secreto en texto plano
 */
function decrypt(text) {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    logDebug(1, '[Crypto] Error al desencriptar (¿datos corruptos o clave incorrecta?):', error);
    return null;
  }
}

module.exports = { encrypt, decrypt };
