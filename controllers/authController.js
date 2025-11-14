const { User } = require('../database');
const bcrypt = require('bcrypt');
const { logDebug } = require('../utils/logger'); // <-- Importar logger

// GET /login
exports.showLogin = (req, res) => {
  if (req.session.isLoggedIn) {
    // --- CAMBIO AQUÍ ---
    // Si ya está logueado, mandarlo a la lista, no al horario
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

    if (user && bcrypt.compareSync(password, user.passwordHash)) {
      // Login exitoso
      req.session.isLoggedIn = true;
      req.session.userId = user.id; // ¡Importante! Guardar ID de BDD en sesión
      req.session.user = { // Guardar datos de acceso rápido
        id: user.id,
        username: user.username,
        mustChangePassword: user.mustChangePassword,
        isAdmin: user.isAdmin
      };
      // Actualizar la sesión en la BDD (para el middleware checkPasswordChange)
      req.session.mustChangePassword = user.mustChangePassword;

      logDebug(3, `[Auth] Usuario '${username}' (ID: ${user.id}) ha iniciado sesión.`);

      // --- CAMBIO AQUÍ ---
      // Redirigir a la lista de "Hoy" por defecto
      res.redirect('/list?range_key=today');
    } else {
      // Login fallido
      logDebug(1, `[Auth] Intento fallido de login para '${username}'.`);
      res.render('login', { error: 'Usuario o contraseña incorrectos.' });
    }
  } catch (error) {
    logDebug(1, '[Auth] Error en doLogin:', error);
    res.render('login', { error: 'Error del servidor.' });
  }
};

// GET /logout
exports.doLogout = (req, res) => {
  logDebug(3, `[Auth] Usuario '${req.session.user?.username}' cerrando sesión.`);
  req.session.destroy((err) => {
    if (err) {
      logDebug(1, '[Auth] Error al destruir sesión:', err);
    }
    res.clearCookie('connect.sid'); // Limpiar cookie de sesión
    res.redirect('/login');
  });
};

// GET /change-password
exports.showChangePassword = (req, res) => {
  // (Usar req.session.mustChangePassword seteado por el middleware global es más fiable)
  if (!req.session.mustChangePassword) {
    return res.redirect('/list?range_key=today'); // <-- CAMBIO AQUÍ
  }
  logDebug(3, "Sirviendo formulario de cambio de contraseña EJS.");
  res.render('change-password', { error: null });
};

// POST /change-password
exports.doChangePassword = async (req, res) => {
  const { new_password, confirm_password } = req.body;
  const userId = req.session.userId; // Usar ID de la sesión

  if (new_password !== confirm_password) {
    return res.render('change-password', { error: 'Las contraseñas no coinciden.' });
  }
  if (new_password === 'admin' || new_password === 'password123') {
    return res.render('change-password', { error: 'Esa contraseña es demasiado simple.' });
  }

  try {
    const newPasswordHash = await bcrypt.hash(new_password, parseInt(process.env.SALT_ROUNDS, 10));

    // Actualizar en BDD
    await User.update({
      passwordHash: newPasswordHash,
      mustChangePassword: false
    }, {
      where: { id: userId }
    });

    // Actualizar en sesión
    req.session.mustChangePassword = false;
    if (req.session.user) {
      req.session.user.mustChangePassword = false;
    }

    logDebug(3, `[Auth] Usuario '${req.session.user.username}' ha cambiado su contraseña.`);
    // --- CAMBIO AQUÍ ---
    res.redirect('/list?range_key=today');
  } catch (error) {
    logDebug(1, '[Auth] Error al cambiar contraseña:', error);
    res.render('change-password', { error: 'Error al actualizar la contraseña.' });
  }
};
