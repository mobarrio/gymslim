// Fichero: controllers/profileController.js (CORREGIDO)
const { User, TrustedDevice, FavoriteActivity } = require('../database');
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
  const user = res.locals.user;
  
  res.render('profile/edit', {
    user: user,
    mfaEnabled: user.mfaEnabled,
    mustConfigureMfa: user.mustConfigureMfa,
    message: req.query.message || null,
    error: req.query.error || null,
    detailsError: req.query.detailsError || null,
    passwordError: req.query.passwordError || null
  });
};

/**
 * POST /profile/details
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
  try {
    const userEmail = res.locals.user.bookingEmail || res.locals.user.username;
    const appName = 'GYMSLIM';
    const secret = speakeasy.generateSecret({ name: `${appName} (${userEmail})`, issuer: appName });
    req.session.mfaTempSecret = secret.base32;
    logDebug(3, `[MFA] Secreto temporal (base32) generado para ${userEmail}`);
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ qrCodeDataUrl: qrCodeDataUrl, base32Secret: secret.base32 });
  } catch (error) {
    logDebug(1, '[MFA] Error al generar QR:', error.message);
    res.status(500).json({ message: 'Error al generar el código QR.' });
  }
};

exports.verifyAndEnableMfa = async (req, res) => {
  const { token } = req.body;
  const userId = req.session.userId;
  const tempSecret = req.session.mfaTempSecret;

  try {
    if (!tempSecret) throw new Error('No se ha generado ningún secreto de MFA. Por favor, inténtelo de nuevo.');
    const isVerified = speakeasy.totp.verify({ secret: tempSecret, encoding: 'base32', token: token, window: 1 });
    if (!isVerified) throw new Error('El código no es válido. Asegúrese de que el reloj de su dispositivo esté sincronizado.');
    
    const encryptedSecret = encrypt(tempSecret);
    if (!encryptedSecret) throw new Error('Error crítico: No se pudo encriptar el secreto de MFA.');

    await User.update({ mfaEnabled: true, mfaSecret: encryptedSecret, mustConfigureMfa: false }, { where: { id: userId } });

    req.session.user.mfaEnabled = true;
    req.session.user.mustConfigureMfa = false;
    delete req.session.mfaTempSecret;
    logDebug(2, `[MFA] MFA activado exitosamente (y desbloqueado) para ${userId}`);

    res.json({ message: '¡MFA activado con éxito!' });

  } catch (error) {
    logDebug(1, `[MFA] Error al verificar MFA para ${userId}:`, error.message);
    res.status(400).json({ message: error.message });
  }
};

exports.disableMfa = async (req, res) => {
  const { password } = req.body;
  const userId = req.session.userId;

  try {
    const user = await User.findByPk(userId);
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) throw new Error('La contraseña actual es incorrecta.');

    await User.update({ mfaEnabled: false, mfaSecret: null }, { where: { id: userId } });
    await TrustedDevice.destroy({ where: { userId: userId } });

    logDebug(2, `[MFA] MFA desactivado (y dispositivos borrados) para ${userId}`);
    res.json({ message: 'MFA desactivado con éxito.' });

  } catch (error) {
    logDebug(1, `[MFA] Error al desactivar MFA para ${userId}:`, error.message);
    res.status(400).json({ message: 'Error de MFA: ' + error.message });
  }
};

// --- Gestión de Favoritas (CORREGIDO) ---

/**
 * GET /profile/favorites
 * Muestra la lista maestra de actividades guardadas por el usuario.
 */
exports.showFavoriteActivities = async (req, res) => {
    const userId = req.session.userId;
    try {
        const favoriteActivities = await FavoriteActivity.findAll({
            where: { userId: userId },
            attributes: ['activityName'],
            order: [['activityName', 'ASC']]
        });
        
        const favorites = favoriteActivities.map(fa => fa.activityName);

        res.render('profile/favorites', {
            favorites: favorites,
            message: req.query.message || null,
            error: req.query.error || null,
        });

    } catch (error) {
        logDebug(1, `[Favorites] Error al listar favoritas para ${userId}:`, error.message);
        res.status(500).send('Error al cargar actividades favoritas.');
    }
};

/**
 * POST /profile/favorites (CORREGIDO)
 * Añade o elimina una actividad de la lista de favoritos del usuario.
 * Esta ruta ahora maneja dos tipos de acciones:
 * 1. 'add'/'remove' (Desde los iconos de corazón en /list, responde JSON)
 * 2. 'add_master'/'remove_master' (Desde el formulario en /profile/favorites, responde REDIRECT)
 */
exports.updateFavoriteActivity = async (req, res) => {
    const { activityName, action } = req.body;
    const userId = req.session.userId;

    if (!activityName || !action) {
        return res.status(400).json({ message: 'Parámetros faltantes.' });
    }

    try {
        // --- LÓGICA DE AÑADIR ---
        if (action === 'add' || action === 'add_master') {
            
            await FavoriteActivity.findOrCreate({
                where: { userId: userId, activityName: activityName },
                defaults: { userId: userId, activityName: activityName }
            });
            logDebug(3, `[Favorites] Añadida actividad: ${activityName} para ${userId}`);
            
            // Responder según el origen
            if (action === 'add') { // (Desde /list)
                return res.json({ message: 'Añadida a favoritos', added: true });
            } else { // (Desde /profile/favorites)
                return res.redirect('/profile/favorites?message=Actividad añadida con éxito');
            }

        // --- LÓGICA DE ELIMINAR ---
        } else if (action === 'remove' || action === 'remove_master') {
            
            await FavoriteActivity.destroy({
                where: { userId: userId, activityName: activityName }
            });
            logDebug(3, `[Favorites] Eliminada actividad: ${activityName} para ${userId}`);

            // Responder según el origen
            if (action === 'remove') { // (Desde /list)
                return res.json({ message: 'Eliminada de favoritos', removed: true });
            } else { // (Desde /profile/favorites)
                return res.redirect('/profile/favorites?message=Actividad eliminada con éxito');
            }
        }
        
        // --- Si la acción no coincide con ninguna ---
        logDebug(1, `[Favorites] Acción no válida recibida: ${action}`);
        if (action.includes('_master')) { // Error desde el formulario
             return res.redirect('/profile/favorites?error=Acción no válida');
        } else { // Error desde la API (iconos corazón)
             return res.status(400).json({ message: 'Acción no válida.' });
        }

    } catch (error) {
        logDebug(1, `[Favorites] Error al actualizar favoritas para ${userId}:`, error.message);
        if (action.includes('_master')) { // Error desde el formulario
             return res.redirect('/profile/favorites?error=' + encodeURIComponent(error.message));
        } else { // Error desde la API (iconos corazón)
             return res.status(500).json({ message: 'Error interno al procesar la solicitud.' });
        }
    }
};
