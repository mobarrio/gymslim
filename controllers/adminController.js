// Fichero: controllers/adminController.js (Versión Papa - CORREGIDO)
const { User, sequelize, TrustedDevice, ApiCache } = require('../database'); 
const bcrypt = require('bcrypt');
const { logDebug } = require('../utils/logger'); 
// Importamos getSetting y updateSetting
const { getSetting, updateSetting } = require('../utils/settingsCache');
const { fetchAllApiData } = require('../services/cacheService');

// --- Dashboard ---
exports.showDashboard = (req, res) => {
  res.redirect('/admin/users');
};

// --- Gestión de Usuarios (Sin cambios) ---
exports.listUsers = async (req, res) => {
  try {
    const users = await User.findAll({ 
      order: [['username', 'ASC']],
      attributes: ['id', 'username', 'name', 'bookingEmail', 'isAdmin', 'mustChangePassword', 'mfaEnabled', 'mustConfigureMfa']
    });
    res.render('admin/users', { users, message: req.query.message });
  } catch (error) {
    res.status(500).send('Error al listar usuarios: ' + error.message);
  }
};
exports.showUserForm = async (req, res) => {
  try {
    const userId = req.params.id;
    let user = null;
    if (userId) {
      user = await User.findByPk(userId);
    }
    res.render('admin/user-form', { user, error: null });
  } catch (error) {
    res.status(500).send('Error: ' + error.message);
  }
};
exports.createUser = async (req, res) => {
  const { username, password, name, bookingEmail, isAdmin } = req.body;
  
  if (!username || !password) {
    return res.render('admin/user-form', { user: null, error: 'Usuario y contraseña son requeridos.' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.SALT_ROUNDS, 10));
    await User.create({
      username,
      passwordHash,
      name: name || null, 
      bookingEmail: bookingEmail || null, 
      isAdmin: isAdmin === 'on', 
      mustChangePassword: true 
    });
    res.redirect('/admin/users?message=Usuario creado con éxito');
  } catch (error) {
    logDebug(1, '[Admin] Error creando usuario:', error.message);
    res.render('admin/user-form', { 
      user: { username, name, bookingEmail, isAdmin }, 
      error: 'Error al crear usuario: ' + error.message 
    });
  }
};
exports.updateUser = async (req, res) => {
  const userId = req.params.id;
  const { username, name, bookingEmail, isAdmin } = req.body;
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).send('Usuario no encontrado');

    user.username = username;
    user.name = name;
    user.bookingEmail = bookingEmail;
    user.isAdmin = isAdmin === 'on';
    
    await user.save();
    
    res.redirect('/admin/users?message=Usuario actualizado');
  } catch (error) {
    logDebug(1, `[Admin] Error actualizando usuario ${userId}:`, error.message);
    req.body.id = userId; 
    res.render('admin/user-form', { 
      user: req.body, 
      error: 'Error al actualizar: ' + error.message 
    });
  }
};
exports.deleteUser = async (req, res) => {
  const userId = req.params.id;
  if (req.session.userId == userId) {
    return res.redirect('/admin/users?message=No puedes eliminar tu propia cuenta');
  }
  try {
    await User.destroy({ where: { id: userId } });
    res.redirect('/admin/users?message=Usuario eliminado');
  } catch (error) {
    res.status(500).send('Error al eliminar: ' + error.message);
  }
};

// --- Gestión de Contraseñas (Sin cambios) ---
exports.resetUserPassword = async (req, res) => {
  const userId = req.params.id;
  const newPassword = 'password123';
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).send('Usuario no encontrado');

    user.passwordHash = await bcrypt.hash(newPassword, parseInt(process.env.SALT_ROUNDS, 10));
    user.mustChangePassword = true; 
    await user.save();

    res.redirect(`/admin/users?message=Contraseña de ${user.username} reseteada a "${newPassword}"`);
  } catch (error) {
    res.status(500).send('Error al resetear contraseña: ' + error.message);
  }
};
exports.showChangePasswordForm = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.redirect('/admin/users?message=Usuario no encontrado');
    }
    res.render('admin/change-password', {
      user: user,
      error: null,
      message: null
    });
  } catch (error) {
    res.redirect('/admin/users?message=Error: ' + error.message);
  }
};
exports.changeUserPassword = async (req, res) => {
  const { newPassword, confirmPassword } = req.body;
  const userId = req.params.id;
  const user = await User.findByPk(userId);

  try {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }
    if (newPassword !== confirmPassword) {
      throw new Error('Las contraseñas no coinciden.');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, parseInt(process.env.SALT_ROUNDS, 10));
    
    await User.update({
      passwordHash: newPasswordHash,
      mustChangePassword: false 
    }, {
      where: { id: userId }
    });

    logDebug(2, `[Admin] El admin ${req.session.user.username} cambió la contraseña del usuario ${user.username}`);
    res.redirect(`/admin/users?message=Contraseña de ${user.username} actualizada con éxito`);

  } catch (error) {
    logDebug(1, `[Admin] Error cambiando contraseña de ${user.username}:`, error.message);
    res.render('admin/change-password', {
      user: user,
      error: error.message 
    });
  }
};

// --- Gestión de MFA (Sin cambios) ---
exports.adminDisableMfa = async (req, res) => {
  const userId = req.params.id;
  const adminUsername = req.session.user.username;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.redirect('/admin/users?message=Usuario no encontrado');
    }

    await User.update({
      mfaEnabled: false,
      mfaSecret: null,
      mustConfigureMfa: false 
    }, {
      where: { id: userId }
    });

    await TrustedDevice.destroy({
      where: { userId: userId }
    });

    logDebug(2, `[Admin] ${adminUsername} ha DESACTIVADO el MFA para ${user.username} (ID: ${userId})`);
    res.redirect(`/admin/users?message=MFA desactivado para ${user.username}`);

  } catch (error) {
    logDebug(1, `[Admin] Error al desactivar MFA para ${userId}:`, error.message);
    res.redirect('/admin/users?message=' + encodeURIComponent(`Error al desactivar MFA: ${error.message}`));
  }
};
exports.adminForceMfaSetup = async (req, res) => {
  const userId = req.params.id;
  const adminUsername = req.session.user.username;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.redirect('/admin/users?message=Usuario no encontrado');
    }

    await User.update({
      mustConfigureMfa: true,
      mfaEnabled: false,
      mfaSecret: null
    }, {
      where: { id: userId }
    });

    await TrustedDevice.destroy({
      where: { userId: userId }
    });

    logDebug(2, `[Admin] ${adminUsername} ha FORZADO la (re)configuración de MFA para ${user.username} (ID: ${userId})`);
    res.redirect(`/admin/users?message=Se ha forzado la configuración de MFA para ${user.username}`);

  } catch (error) {
    logDebug(1, `[Admin] Error al forzar MFA para ${userId}:`, error.message);
    res.redirect('/admin/users?message=' + encodeURIComponent(`Error al forzar MFA: ${error.message}`));
  }
};

// --- Gestión de Configuración (MODIFICADO) ---

/**
 * GET /admin/settings
 * Muestra la página de configuración del sistema.
 */
exports.showSettings = (req, res) => {
  try {
    // --- ¡CORRECCIÓN! Leemos ambos valores de la caché ---
    const trustedDays = getSetting('trusted_device_days', '30');
    const cacheEnabled = getSetting('cache_enabled', 'true');
    // --- FIN CORRECCIÓN ---
    
    res.render('admin/settings', {
      settings: {
        trusted_device_days: trustedDays,
        cache_enabled: cacheEnabled // <-- Pasar el valor a la vista
      },
      message: req.query.message || null,
      error: req.query.error || null
    });
  } catch (error) {
    logDebug(1, '[Admin] Error al mostrar configuraciones:', error.message);
    res.redirect('/admin/users?message=Error al cargar la configuración');
  }
};

/**
 * POST /admin/settings
 * Actualiza la configuración del sistema.
 */
exports.saveSettings = async (req, res) => {
  // --- ¡CORRECCIÓN! Leemos 'cache_enabled' del formulario ---
  const { trusted_device_days, cache_enabled } = req.body;
  
  try {
    // 1. Guardar Días de Confianza
    const days = parseInt(trusted_device_days, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      throw new Error('Los días deben ser un número entre 1 y 365.');
    }
    await updateSetting('trusted_device_days', days.toString());

    // 2. Guardar Estado de Caché
    // Si el checkbox está marcado, req.body.cache_enabled será "true"
    // Si NO está marcado, req.body.cache_enabled será 'undefined'
    const newCacheState = (cache_enabled === 'true') ? 'true' : 'false';
    await updateSetting('cache_enabled', newCacheState);
    // --- FIN CORRECCIÓN ---

    res.redirect('/admin/settings?message=Configuración guardada con éxito');

  } catch (error) {
    logDebug(1, '[Admin] Error al guardar configuraciones:', error.message);
    // Volver a cargar los valores actuales en caso de error
    const trustedDays = getSetting('trusted_device_days', '30'); 
    const cacheEnabled = getSetting('cache_enabled', 'true');
    res.render('admin/settings', {
      settings: {
        trusted_device_days: trustedDays,
        cache_enabled: cacheEnabled
      },
      message: null,
      error: error.message
    });
  }
};

/**
 * POST /admin/settings/purge-cache
 * Elimina todos los registros de la tabla ApiCache.
 */
exports.purgeCache = async (req, res) => {
    try {
        const count = await ApiCache.destroy({
            where: {}, // Borra todos los registros
            truncate: true // Reinicia el contador de ID
        });
        
        logDebug(2, `[Cache] Admin ${req.session.user.username} purgó la caché. Se eliminaron ${count} registros.`);
        res.redirect('/admin/settings?message=' + encodeURIComponent(`Caché purgada con éxito. Se eliminaron ${count} entradas.`));

    } catch (error) {
        logDebug(1, '[Admin] Error al purgar caché:', error.message);
        res.redirect('/admin/settings?error=' + encodeURIComponent(`Error al purgar caché: ${error.message}`));
    }
};
