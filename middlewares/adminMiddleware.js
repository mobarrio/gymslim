// --- CAMBIO AQUÍ ---
// Importar el logger para que funcione
const { logDebug } = require('../utils/logger');

// Middleware para verificar si el usuario es Admin
exports.checkIsAdmin = (req, res, next) => {
  // Primero, verificar si está logueado
  if (!req.session.userId) { // Usar userId que es más fiable
    req.session.returnTo = req.originalUrl; // Guardar ruta de admin
    return res.redirect('/login');
  }

  // Segundo, verificar si es admin (usando res.locals seteado por el middleware global)
  if (res.locals.user?.isAdmin) {
    next(); // Es admin, continuar
  } else {
    // No es admin, redirigir a la nueva página principal
    logDebug(1, `[Admin] Acceso denegado a ${res.locals.user.username} en ${req.path}`);
    // --- CAMBIO AQUÍ ---
    res.redirect('/list?range_key=today');
  }
};
