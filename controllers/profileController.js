// Fichero: controllers/profileController.js (Versión Hotel - MODIFICADO)
const { User, TrustedDevice } = require('../database'); 
const bcrypt = require('bcrypt');
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
  res.render('profile/edit', {
    user: res.locals.user,
    mfaEnabled: res.locals.user.mfaEnabled,
    mustConfigureMfa: res.locals.user.mustConfigureMfa, // <-- ¡CAMBIO AÑADIDO!
    message: req.query.message || null,
    error: req.query.error || null,
    detailsError: req.query.detailsError || null,
    passwordError: req.query.passwordError || null
  });
};

/**
 * POST /profile/details (Sin cambios)
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
 * POST /profile/password (Sin cambios)
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


// --- Funciones de MFA ---

exports.generateMfaSecret = async (req, res) => {
  // ... (Lógica de generateMfaSecret sin cambios)
  try {
    const userEmail = res.locals.user.bookingEmail || res.locals.user.username;
    const appName = 'GYMSLIM'; 
    const secret = speakeasy.generateSecret({
      name: `${appName} (${userEmail})`, 
      issuer: appName
    });
    req.session.mfaTempSecret = secret.base32;
    logDebug(3, `[MFA] Secreto temporal (base32) generado para ${userEmail}`);
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);
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
  const tempSecret = req.session.mfaTempSecret;

  try {
    if (!tempSecret) {
      throw new Error('No se ha generado ningún secreto de MFA. Por favor, inténtelo de nuevo.');
    }

    const isVerified = speakeasy.totp.verify({
      secret: tempSecret,
      encoding: 'base32',
      token: token,
      window: 1 
    });

    if (!isVerified) {
      logDebug(1, `[MFA] Verificación fallida para ${userId}. Token: ${token}`);
      throw new Error('El código no es válido. Asegúrese de que el reloj de su dispositivo esté sincronizado.');
    }

    const encryptedSecret = encrypt(tempSecret);
    if (!encryptedSecret) {
      throw new Error('Error crítico: No se pudo encriptar el secreto de MFA.');
    }

    // 3. Actualizar el usuario en la BDD
    await User.update({
      mfaEnabled: true,
      mfaSecret: encryptedSecret,
      mustConfigureMfa: false // <-- ¡CAMBIO CRUCIAL AÑADIDO! DESBLOQUEAR AL USUARIO
    }, {
      where: { id: userId }
    });

    // 4. Actualizar la sesión (res.locals se actualiza con el middleware global)
    req.session.user.mfaEnabled = true;
    req.session.user.mustConfigureMfa = false;

    // 5. Limpiar el secreto temporal de la sesión
    delete req.session.mfaTempSecret;
    logDebug(2, `[MFA] MFA activado exitosamente (y desbloqueado) para ${userId}`);

    res.json({ message: '¡MFA activado con éxito!' });

  } catch (error)
    {
    logDebug(1, `[MFA] Error al verificar MFA para ${userId}:`, error.message);
    res.status(400).json({ message: error.message });
  }
};


/**
 * POST /profile/mfa/disable (Sin cambios)
 */
exports.disableMfa = async (req, res) => {
  // ... (Lógica de disableMfa sin cambios)
  const { password } = req.body;
  const userId = req.session.userId;

  try {
    const user = await User.findByPk(userId);
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      logDebug(1, `[MFA] Desactivación fallida (pass incorrecta) para ${userId}`);
      throw new Error('La contraseña actual es incorrecta.');
    }

    await User.update({
      mfaEnabled: false,
      mfaSecret: null
    }, {
      where: { id: userId }
    });

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
