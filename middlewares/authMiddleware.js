// Middleware para verificar si el usuario está logueado
const { logDebug } = require('../utils/logger');
exports.checkAuth = (req, res, next) => {
  logDebug(4, `[checkAuth] Path=${req.path}, LoggedIn=${!!req.session.isLoggedIn}`);
  if (req.session.isLoggedIn) {
    next();
  } else {
    // Guardar la URL a la que intentaba acceder
    req.session.returnTo = req.originalUrl;
    res.redirect('/login');
  }
};

// Middleware para forzar el cambio de contraseña
exports.checkPasswordChange = (req, res, next) => {
  logDebug(4, `[checkPasswordChange] Path=${req.path}, MustChange=${!!req.session.user?.mustChangePassword}`);
  if (req.session.user?.mustChangePassword && req.path !== '/change-password') {
    res.redirect('/change-password');
  } else {
    next();
  }
};
