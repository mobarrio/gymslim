const { User, BookingEmail, sequelize } = require('../database');
const bcrypt = require('bcrypt');
// --- CAMBIO AQUÍ ---
// Importar el logger para que funcione
const { logDebug } = require('../utils/logger');

// --- Dashboard ---
exports.showDashboard = (req, res) => {
  res.redirect('/admin/users'); // Por ahora, redirige a la lista de usuarios
};

// --- Gestión de Usuarios ---

// Mostrar lista de todos los usuarios
exports.listUsers = async (req, res) => {
  try {
    const users = await User.findAll({ order: [['username', 'ASC']] });
    res.render('admin/users', { users, message: req.query.message });
  } catch (error) {
    res.status(500).send('Error al listar usuarios: ' + error.message);
  }
};

// Mostrar formulario para crear o editar usuario
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

// Crear nuevo usuario
exports.createUser = async (req, res) => {
  const { username, password, isAdmin } = req.body;
  if (!username || !password) {
    return res.render('admin/user-form', { user: null, error: 'Usuario y contraseña son requeridos.' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.SALT_ROUNDS, 10));
    await User.create({
      username,
      passwordHash,
      isAdmin: isAdmin === 'on', // 'on' si el checkbox está marcado
      mustChangePassword: true // Forzar cambio de pass al crear
    });
    res.redirect('/admin/users?message=Usuario creado con éxito');
  } catch (error) {
    res.render('admin/user-form', { user: null, error: 'Error al crear usuario: ' + error.message });
  }
};

// Actualizar usuario existente
exports.updateUser = async (req, res) => {
  const userId = req.params.id;
  const { username, isAdmin } = req.body;
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).send('Usuario no encontrado');

    user.username = username;
    user.isAdmin = isAdmin === 'on';
    await user.save();
    
    res.redirect('/admin/users?message=Usuario actualizado');
  } catch (error) {
    res.render('admin/user-form', { user: req.body, error: 'Error al actualizar: ' + error.message });
  }
};

// Resetear contraseña de un usuario
exports.resetUserPassword = async (req, res) => {
  const userId = req.params.id;
  const newPassword = 'password123'; // Contraseña temporal
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(4404).send('Usuario no encontrado');

    user.passwordHash = await bcrypt.hash(newPassword, parseInt(process.env.SALT_ROUNDS, 10));
    user.mustChangePassword = true; // Forzar cambio
    await user.save();

    res.redirect(`/admin/users?message=Contraseña de ${user.username} reseteada a "${newPassword}"`);
  } catch (error) {
    res.status(500).send('Error al resetear contraseña: ' + error.message);
  }
};

// Eliminar usuario
exports.deleteUser = async (req, res) => {
  const userId = req.params.id;
  // Evitar que el admin se borre a sí mismo
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


// --- Gestión de Emails de Reserva ---

// Listar todos los emails
exports.listEmails = async (req, res) => {
  try {
    const emails = await BookingEmail.findAll({ order: [['isDefault', 'DESC'], ['email', 'ASC']] });
    res.render('admin/emails', { emails, message: req.query.message, error: null });
  } catch (error) {
    res.status(500).send('Error al listar emails: ' + error.message);
  }
};

// Crear nuevo email
exports.createEmail = async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      throw new Error('El email no puede estar vacío.');
    }
    await BookingEmail.create({ email, isDefault: false });
    res.redirect('/admin/emails?message=Email añadido');
  } catch (error) {
    const emails = await BookingEmail.findAll();
    res.render('admin/emails', { emails, message: null, error: 'Error al crear email: ' + error.message });
  }
};

// Establecer un email como default (y quitar el anterior)
exports.setDefaultEmail = async (req, res) => {
  const emailId = req.params.id;
  const t = await sequelize.transaction(); // Usar transacción
  try {
    // 1. Quitar el default actual
    await BookingEmail.update({ isDefault: false }, { where: { isDefault: true }, transaction: t });
    // 2. Poner el nuevo default
    await BookingEmail.update({ isDefault: true }, { where: { id: emailId }, transaction: t });
    
    await t.commit(); // Confirmar transacción
    res.redirect('/admin/emails?message=Email por defecto actualizado');
  } catch (error) {
    await t.rollback(); // Deshacer en caso de error
    res.redirect('/admin/emails?message=Error al actualizar default');
  }
};

// Eliminar un email
exports.deleteEmail = async (req, res) => {
  const emailId = req.params.id;
  try {
    const email = await BookingEmail.findByPk(emailId);
    // No permitir borrar el email por defecto
    if (email.isDefault) {
      return res.redirect('/admin/emails?message=No se puede eliminar el email por defecto.');
    }
    await email.destroy();
    res.redirect('/admin/emails?message=Email eliminado');
  } catch (error) {
    res.status(500).send('Error al eliminar email: ' + error.message);
  }
};

// Mostrar página para seleccionar email activo
exports.showEmailSelector = async (req, res) => {
  try {
    // Guardar la página anterior para volver a ella
    req.session.lastAppPage = req.get('Referer') || '/list?range_key=today';

    const allEmails = await BookingEmail.findAll({ order: [['email', 'ASC']] });
    res.render('admin/emails-select', { 
      allEmails: allEmails,
      currentEmailId: res.locals.user.activeBookingEmailId,
      currentEmail: res.locals.activeBookingEmail
    });
  } catch (error) {
    res.status(500).send('Error al cargar emails: ' + error.message);
  }
};

// Procesar la selección del email activo
exports.selectActiveEmail = async (req, res) => {
  const { emailId } = req.body; // Cambiado a emailId
  const userId = req.session.userId;

  try {
    // Validar que el email existe en la BDD
    const emailToSet = await BookingEmail.findByPk(emailId);
    
    if (emailToSet) {
      // Asignar el emailId al usuario en la BDD
      await User.update({ activeBookingEmailId: emailToSet.id }, { where: { id: userId } });
      
      // Actualizar la sesión
      req.session.activeBookingEmailId = emailToSet.id;
      if (res.locals.user) { // Actualizar res.locals si existe
         res.locals.user.activeBookingEmailId = emailToSet.id;
      }

      logDebug(2, `[Session] Usuario ${req.session.user.username} cambió email activo a: ${emailToSet.email}`);
    } else {
      logDebug(1, `[Session] Intento de cambiar a emailId no válido: ${emailId}`);
    }
  } catch (error) {
     logDebug(1, `[Session] Error al cambiar email activo: ${error.message}`);
  }
  
  // Redirigir a la última página de la app (ej. /horario o /list)
  // --- CAMBIO AQUÍ ---
  res.redirect(req.session.lastAppPage || '/list?range_key=today');
};
