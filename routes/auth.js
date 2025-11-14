// Fichero: routes/auth.js (Versión Foxtrot - Parte 4)
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { checkAuth } = require('../middlewares/authMiddleware');

// --- Rutas de Login (Paso 1: Email/Pass) ---

// Muestra el formulario de login principal (Sin cambios)
router.get('/login', authController.showLogin);

// Procesa el login.
// (authController.doLogin será modificado en el siguiente paso)
router.post('/login', authController.doLogin);


// --- ¡NUEVO! Rutas de MFA (Paso 2: Código) ---

// Muestra la página para introducir el código de 6 dígitos
// (El controlador se asegurará de que el usuario haya pasado el Paso 1)
router.get('/login/mfa', authController.showMfa);

// Procesa el código de 6 dígitos y el "Dispositivo de Confianza"
router.post('/login/mfa', authController.verifyMfa);

// --- Fin Nuevo ---


// --- Rutas existentes (Sin cambios) ---

// Logout
router.get('/logout', authController.doLogout);

// Cambio de contraseña (requiere estar logueado, por eso usa checkAuth)
router.get('/change-password', checkAuth, authController.showChangePassword);
router.post('/change-password', checkAuth, authController.doChangePassword);

module.exports = router;
