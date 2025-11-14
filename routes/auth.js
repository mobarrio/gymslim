const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { checkAuth } = require('../middlewares/authMiddleware');

// GET /login - Mostrar formulario de login
router.get('/login', authController.showLogin);

// POST /login - Procesar login
router.post('/login', authController.doLogin);

// GET /logout - Cerrar sesión
router.get('/logout', authController.doLogout);

// GET /change-password - Mostrar formulario de cambio de contraseña
router.get('/change-password', checkAuth, authController.showChangePassword);

// POST /change-password - Procesar cambio de contraseña
router.post('/change-password', checkAuth, authController.doChangePassword);

module.exports = router;
