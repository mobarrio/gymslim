// Fichero: controllers/profileController.js (CORREGIDO)
const { User, TrustedDevice } = require('../database');
const bcrypt = require('bcrypt');

// --- ¡¡¡ESTA ES LA LÍNEA QUE FALTABA!!! ---
const { logDebug } = require('../utils/logger');

// Importar bibliotecas de MFA
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { encrypt, decrypt } = require('../utils/encryption');


/**
 * GET /profile
 * Muestra la página de edición de perfil.
 */
exports.showProfile = (req, res) => {
  // El middleware global ya cargó 'user' en res.locals
  
  res.render('profile/edit', {
    user: res.locals.user,
    // Pasamos el estado de MFA (true/false) a la vista
    mfaEnabled: res.locals.user.mfaEnabled, 
    message: req.query.message || null,
    error: req.query.error || null,
    detailsError: req.query.detailsError || null,
    passwordError: req.query.passwordError || null
  });
};

/**
 * POST /profile/details
 * (Esta función existe de la Versión Delta, la mantenemos)
 */
exports.updateDetails = async (req, res) => {
  const { name, bookingEmail } = req.body;
  const userId = req.session.userId;

  try {
    if (!bookingEmail || !bookingEmail.includes('@')) {
      throw new Error('El email proporcionado no es válido.');
    }
    
    await User.update({
      name: name,
      bookingEmail: bookingEmail
    }, {
      where: { id: userId }
    });

    logDebug(2, `[Profile] Usuario (ID: ${userId}) actualizó sus detalles.`);
    res.redirect('/profile?message=Detalles actualizados con éxito');

  } catch (error) {
    logDebug(1, `[Profile] Error actualizando detalles para ${userId}:`, error.message);
    res.redirect(`/profile?detailsError=${encodeURIComponent(error.message)}`);
  }
};

/**
 * POST /profile/password
 * (Esta función existe de la Versión Delta, la mantenemos)
 */
exports.updatePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.session.userId;

  try {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
    }
    if (newPassword !== confirmPassword) {
      throw new Error('Las nuevas contraseñas no coinciden.');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('Usuario no encontrado.');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new Error('La contraseña actual es incorrecta.');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, parseInt(process.env.SALT_ROUNDS, 10));
    
    await User.update({
      passwordHash: newPasswordHash,
      mustChangePassword: false
    }, {
      where: { id: userId }
    });

    logDebug(2, `[Profile] Usuario (ID: ${userId}) actualizó su contraseña.`);
    res.redirect('/profile?message=Contraseña actualizada con éxito');

  } catch (error) {
    logDebug(1, `[Profile] Error actualizando contraseña para ${userId}:`, error.message);
    res.redirect(`/profile?passwordError=${encodeURIComponent(error.message)}`);
  }
};


// --- Funciones de MFA (Versión Foxtrot) ---

/**
 * POST /profile/mfa/generate
 * Genera un nuevo secreto de MFA y devuelve un QR code.
 */
exports.generateMfaSecret = async (req, res) => {
  try {
    const userEmail = res.locals.user.bookingEmail || res.locals.user.username;
    const appName = 'GYMSLIM'; // Puedes cambiar esto

    // 1. Generar el secreto
    const secret = speakeasy.generateSecret({
      name: `${appName} (${userEmail})`, // Ej: "GYMSLIM (user@test.com)"
      issuer: appName
    });

    // 2. Guardar el secreto (base32) temporalmente en la sesión
    req.session.mfaTempSecret = secret.base32;
    logDebug(3, `[MFA] Secreto temporal (base32) generado para ${userEmail}`);

    // 3. Generar el QR code como Data URL
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    // 4. Enviar el QR code al cliente (JSON)
    res.json({ qrCodeDataUrl: qrCodeDataUrl });

  } catch (error) {
    logDebug(1, '[MFA] Error al generar QR:', error.message);
    res.status(500).json({ message: 'Error al generar el código QR.' });
  }
};


/**
 * POST /profile/mfa/verify
 * Verifica el token de 6 dígitos y activa el MFA.
 */
exports.verifyAndEnableMfa = async (req, res) => {
  const { token } = req.body;
  const userId = req.session.userId;
  const tempSecret = req.session.mfaTempSecret; // Secreto base32 de la sesión

  try {
    if (!tempSecret) {
      throw new Error('No se ha generado ningún secreto de MFA. Por favor, inténtelo de nuevo.');
    }

    // 1. Verificar el token
    const isVerified = speakeasy.totp.verify({
      secret: tempSecret,
      encoding: 'base32',
      token: token,
      window: 1 // Permitir una ventana de 1x30seg (pasado y futuro)
    });

    if (!isVerified) {
      logDebug(1, `[MFA] Verificación fallida para ${userId}. Token: ${token}`);
      throw new Error('El código no es válido. Asegúrese de que el reloj de su dispositivo esté sincronizado.');
    }

    // 2. Verificación exitosa. Encriptar y guardar el secreto.
    const encryptedSecret = encrypt(tempSecret);
    if (!encryptedSecret) {
      throw new Error('Error crítico: No se pudo encriptar el secreto de MFA.');
    }

    // 3. Actualizar el usuario en la BDD
    await User.update({
      mfaEnabled: true,
      mfaSecret: encryptedSecret
    }, {
      where: { id: userId }
    });

    // 4. Limpiar el secreto temporal de la sesión
    delete req.session.mfaTempSecret;
    logDebug(2, `[MFA] MFA activado exitosamente para ${userId}`);

    res.json({ message: '¡MFA activado con éxito!' });

  } catch (error)
    {
    logDebug(1, `[MFA] Error al verificar MFA para ${userId}:`, error.message);
    res.status(400).json({ message: error.message });
  }
};


/**
 * POST /profile/mfa/disable
 * Desactiva el MFA para el usuario (requiere contraseña).
 */
exports.disableMfa = async (req, res) => {
  const { password } = req.body;
  const userId = req.session.userId;

  try {
    // 1. Verificar la contraseña actual del usuario
    const user = await User.findByPk(userId);
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      logDebug(1, `[MFA] Desactivación fallida (pass incorrecta) para ${userId}`);
      throw new Error('La contraseña actual es incorrecta.');
    }

    // 2. Contraseña correcta. Desactivar MFA.
    await User.update({
      mfaEnabled: false,
      mfaSecret: null
    }, {
      where: { id: userId }
    });

    // 3. Eliminar todos los dispositivos de confianza asociados
    await TrustedDevice.destroy({
      where: { userId: userId }
    });

    logDebug(2, `[MFA] MFA desactivado (y dispositivos borrados) para ${userId}`);

    res.json({ message: 'MFA desactivado con éxito.' });

  } catch (error) {
    logDebug(1, `[MFA] Error al desactivar MFA para ${userId}:`, error.message);
    res.status(400).json({ message: error.message });
  }
};
