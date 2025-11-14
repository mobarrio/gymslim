// Fichero: middlewares/checkForceMfaSetup.js
const { logDebug } = require('../utils/logger');

/**
 * Middleware que verifica si un usuario está marcado para forzar la configuración de MFA.
 * Si mustConfigureMfa es true, el usuario es redirigido a /profile y no puede salir.
 */
exports.checkForceMfaSetup = (req, res, next) => {
  const user = res.locals.user;
  
  // 1. Solo se aplica a usuarios logueados que no sean administradores
  if (!user || user.isAdmin) {
    return next();
  }

  // 2. ¿El usuario está forzado a configurar MFA?
  if (user.mustConfigureMfa) {
    // 3. Permite acceder a /profile o /logout, pero bloquea todo lo demás.
    if (req.path.startsWith('/profile') || req.path === '/logout') {
      logDebug(3, `[MFA] Usuario ${user.username} forzado a configurar MFA, permitiendo acceso a ${req.path}`);
      return next(); // Llama a next() si el acceso está permitido
    } else {
      // 4. Bloquear y redirigir a /profile
      logDebug(2, `[MFA] Bloqueando acceso a ${req.path}. Redirigiendo a ${user.username} a /profile para configurar MFA.`);
      return res.redirect('/profile?error=' + encodeURIComponent('Debes configurar la autenticación de dos factores (MFA) antes de continuar.'));
    }
  }

  // Si no está forzado, continuar normalmente
  next(); // Llama a next() si no hay bloqueo
};
