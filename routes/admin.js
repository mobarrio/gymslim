const express = require('express');
const router = express.Router();
const { checkIsAdmin } = require('../middlewares/adminMiddleware');
const adminController = require('../controllers/adminController');

// --- Proteger TODAS las rutas de admin ---
router.use(checkIsAdmin);

// --- Rutas de Gestión de Usuarios ---
router.get('/', adminController.showDashboard); // Dashboard principal
router.get('/users', adminController.listUsers);
router.get('/users/new', adminController.showUserForm); // Mostrar form para crear
router.post('/users/new', adminController.createUser);
router.get('/users/:id/edit', adminController.showUserForm); // Mostrar form para editar
router.post('/users/:id/edit', adminController.updateUser);
router.post('/users/:id/reset-pass', adminController.resetUserPassword);
router.post('/users/:id/delete', adminController.deleteUser);

// --- Rutas de Gestión de Emails de Reserva ---
router.get('/emails', adminController.listEmails);
router.post('/emails/new', adminController.createEmail);
router.post('/emails/:id/set-default', adminController.setDefaultEmail);
router.post('/emails/:id/delete', adminController.deleteEmail);
router.get('/emails/select', adminController.showEmailSelector); // Página para cambiar email activo
router.post('/emails/select', adminController.selectActiveEmail); // Procesar cambio de email activo

module.exports = router;
