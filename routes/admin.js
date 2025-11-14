// Fichero: routes/admin.js (Versión Golf - CORREGIDO)
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { checkIsAdmin } = require('../middlewares/adminMiddleware');

// Proteger TODAS las rutas de /admin
router.use(checkIsAdmin);

// --- Dashboard ---
router.get('/', adminController.showDashboard);

// --- Gestión de Usuarios (CRUD) ---
router.get('/users', adminController.listUsers);
router.get('/users/new', adminController.showUserForm);
router.post('/users/new', adminController.createUser);
router.get('/users/edit/:id', adminController.showUserForm);
router.post('/users/edit/:id', adminController.updateUser);
router.post('/users/delete/:id', adminController.deleteUser);

// --- Gestión de Contraseñas (Versión Echo) ---
router.post('/users/reset-pw/:id', adminController.resetUserPassword);
router.get('/users/change-password/:id', adminController.showChangePasswordForm);
router.post('/users/change-password/:id', adminController.changeUserPassword);

// --- Gestión de MFA (Versión Foxtrot) ---
router.post('/users/disable-mfa/:id', adminController.adminDisableMfa);

// --- Gestión de MFA Forzado (Versión Hotel) ---
router.post('/users/force-mfa/:id', adminController.adminForceMfaSetup); // Esta línea es correcta.

// --- ¡NUEVO! Gestión de Configuración (Versión Golf) ---
// La línea 36 (o similar) que da error
router.get('/settings', adminController.showSettings); 

router.post('/settings', adminController.saveSettings);
// --- FIN NUEVO ---


module.exports = router;
