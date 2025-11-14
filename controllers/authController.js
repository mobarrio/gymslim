// Fichero: controllers/authController.js (Versión Golf - MODIFICADO)
const { User, TrustedDevice } = require('../database');
const bcrypt = require('bcrypt');
const { logDebug } = require('../utils/logger');
const { decrypt } = require('../utils/encryption');
const speakeasy = require('speakeasy');
const crypto = require('crypto');

// --- ¡NUEVO! Importar el caché de config ---
const { getSetting } = require('../utils/settingsCache');
// --- FIN NUEVO ---

const TRUSTED_COOKIE_NAME = 'trusted_device';

// --- ¡ELIMINADO! ---
// const TRUSTED_COOKIE_AGE = 30 * 24 * 60 * 60 * 1000; (Ya no está hardcodeado)
// --- FIN ELIMINADO ---


function completeLogin(req, res, user) {
  req.session.isLoggedIn = true;
  req.session.userId = user.id;
  req.session.user = { 
    id: user.id,
    username: user.username,
    name: user.name,
    bookingEmail: user.bookingEmail,
    isAdmin: user.isAdmin,
    mfaEnabled: user.mfaEnabled
  };
  req.session.mustChangePassword = user.mustChangePassword;
  delete req.session.mfaUserId;
  logDebug(3, `[Auth] Login completado para ${user.username} (ID: ${user.id}).`);
}

async function createTrustedDevice(req, res, userId) {
  try {
    const token = crypto.randomBytes(32).toString('hex');

    // --- ¡LÓGICA MODIFICADA! ---
    // 1. Obtener los días desde la caché de configuración
    const daysStr = getSetting('trusted_device_days', '30'); // Default 30
    const days = parseInt(daysStr, 10);
    
    // 2. Calcular la expiración
    const trustedCookieAgeMs = days * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + trustedCookieAgeMs);
    // --- FIN LÓGICA MODIFICADA ---

    logDebug(2, `[Auth] Creando Dispositivo (Duración: ${days} días): UserID: ${userId}`);
    
    await TrustedDevice.create({
      userId: userId,
      token: token, 
      userAgent: req.headers['user-agent'],
      expiresAt: expiresAt // Guardar la fecha de expiración calculada
    });

    res.cookie(TRUSTED_COOKIE_NAME, token, {
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      expires: expiresAt, // Usar la misma fecha para la cookie
      sameSite: 'Strict'
    });
    
  } catch (error) {
    logDebug(1, `[Auth] Error al crear dispositivo de confianza:`, error);
  }
}

async function checkTrustedDevice(req, userId) {
  const token = req.cookies[TRUSTED_COOKIE_NAME];
  if (!token) {
    logDebug(4, `[Auth] Check Trusted: No hay cookie.`);
    return false;
  }

  logDebug(2, `[Auth] Verificando Dispositivo: Buscando en BDD -> UserID: ${userId}`);

  const trusted = await TrustedDevice.findOne({
    where: { 
      token: token, 
      userId: userId
    } 
  });

  if (!trusted) {
    logDebug(2, `[Auth] Verificando Dispositivo: NO ENCONTRADO.`);
    return false;
  }

  // La lógica de expiración ya funciona,
  // porque compara con la fecha 'expiresAt' guardada en la BDD.
  if (trusted.expiresAt < new Date()) {
    logDebug(2, `[Auth] Check Trusted: Dispositivo expirado. Eliminando...`);
    await trusted.destroy();
    return false;
  }
  
  logDebug(2, `[Auth] Check Trusted: ¡Dispositivo de confianza VERIFICADO!`);
  return true;
}

// GET /login
exports.showLogin = (req, res) => {
  if (req.session.isLoggedIn) {
    return res.redirect('/list?range_key=today');
  }
  logDebug(3, "Sirviendo formulario de login EJS");
  res.render('login', { error: null });
};

// POST /login
exports.doLogin = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username: username } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      logDebug(1, `[Auth] Intento fallido de login (pass incorrecta) para '${username}'.`);
      return res.render('login', { error: 'Usuario o contraseña incorrectos.' });
    }

    const isTrusted = await checkTrustedDevice(req, user.id);

    if (isTrusted) {
      logDebug(2, `[Auth] Dispositivo CONFIABLE para ${username}. Saltando MFA.`);
      completeLogin(req, res, user);
      return res.redirect('/list?range_key=today');
    }

    if (user.mfaEnabled) {
      logDebug(2, `[Auth] MFA requerido para ${username}.`);
      req.session.mfaUserId = user.id;
      return res.redirect('/login/mfa');
    }

    logDebug(2, `[Auth] Login directo (MFA deshabilitado) para ${username}.`);
    completeLogin(req, res, user);
    return res.redirect('/list?range_key=today');

  } catch (error) {
    logDebug(1, '[Auth] Error en doLogin:', error);
    res.render('login', { error: 'Error del servidor.' });
  }
};

// GET /login/mfa
exports.showMfa = (req, res) => {
  if (!req.session.mfaUserId) {
    logDebug(1, `[Auth] Acceso a /login/mfa sin pasar por el Paso 1.`);
    return res.redirect('/login');
  }
  res.render('login-mfa', { error: null });
};

// POST /login/mfa
exports.verifyMfa = async (req, res) => {
  const { token, trustDevice } = req.body;
  const userId = req.session.mfaUserId;

  try {
    if (!userId) {
      logDebug(1, `[Auth] Verificación MFA fallida (sin mfaUserId en sesión).`);
      return res.redirect('/login');
    }

    const user = await User.findByPk(userId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      logDebug(1, `[Auth] Verificación MFA fallida (usuario ${userId} no tiene MFA activado en BDD).`);
      return res.render('login-mfa', { error: 'Error de MFA. Contacte al administrador.' });
    }

    const decryptedSecret = decrypt(user.mfaSecret);
    if (!decryptedSecret) {
      return res.render('login-mfa', { error: 'Error crítico de encriptación.' });
    }

    const isVerified = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token: token,
      window: 1 
    });

    if (!isVerified) {
      logDebug(1, `[Auth] Verificación MFA fallida (token incorrecto) para ${userId}.`);
      return res.render('login-mfa', { error: 'El código de 6 dígitos es incorrecto.' });
    }

    logDebug(2, `[Auth] Verificación MFA exitosa para ${userId}.`);

    if (trustDevice === 'true') {
      await createTrustedDevice(req, res, user.id);
    }

    completeLogin(req, res, user);
    res.redirect('/list?range_key=today');

  } catch (error) {
    logDebug(1, '[Auth] Error en verifyMfa:', error);
    res.render('login-mfa', { error: 'Error del servidor durante la verificación.' });
  }
};

// GET /logout
exports.doLogout = (req, res) => {
  logDebug(3, `[Auth] Usuario '${req.session.user?.username}' cerrando sesión.`);
  
  // Limpiamos SOLO la cookie de sesión
  res.clearCookie('connect.sid'); 

  req.session.destroy((err) => {
    if (err) {
      logDebug(1, '[Auth] Error al destruir sesión:', err);
    }
    res.redirect('/login');
  });
};

// GET /change-password
exports.showChangePassword = (req, res) => {
  if (!req.session.mustChangePassword) {
    return res.redirect('/list?range_key=today'); 
  }
  logDebug(3, "Sirviendo formulario de cambio de contraseña EJS.");
  res.render('change-password', { error: null });
};

// POST /change-password
exports.doChangePassword = async (req, res) => {
  const { new_password, confirm_password } = req.body;
  const userId = req.session.userId;

  if (new_password !== confirm_password) {
    return res.render('change-password', { error: 'Las contraseñas no coinciden.' });
  }
  if (new_password.length < 6) {
    return res.render('change-password', { error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const newPasswordHash = await bcrypt.hash(new_password, parseInt(process.env.SALT_ROUNDS, 10));

    await User.update({
      passwordHash: newPasswordHash,
      mustChangePassword: false
    }, {
      where: { id: userId }
    });

    req.session.mustChangePassword = false;
    if (req.session.user) {
      req.session.user.mustChangePassword = false;
    }

    logDebug(3, `[Auth] Usuario '${req.session.user.username}' ha cambiado su contraseña forzada.`);
    res.redirect('/list?range_key=today');
  } catch (error) {
    logDebug(1, '[Auth] Error al cambiar contraseña forzada:', error);
    res.render('change-password', { error: 'Error al actualizar la contraseña.' });
  }
};
