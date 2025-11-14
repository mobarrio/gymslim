// Fichero: routes/profile.js (Versión Foxtrot - Parte 2)
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { checkAuth } = require('../middlewares/authMiddleware');

// Proteger todas las rutas de /profile
router.use(checkAuth);

// --- Perfil Básico (Existente) ---
router.get('/', profileController.showProfile);
router.post('/details', profileController.updateDetails);
router.post('/password', profileController.updatePassword);

// --- ¡NUEVO! Rutas de MFA (Foxtrot) ---
// 1. Genera el secreto y el QR code (se envía como JSON)
router.post('/mfa/generate', profileController.generateMfaSecret);

// 2. Verifica el token y activa el MFA
router.post('/mfa/verify', profileController.verifyAndEnableMfa);

// 3. Desactiva el MFA (requiere contraseña)
router.post('/mfa/disable', profileController.disableMfa);
// --- FIN NUEVO ---

module.exports = router;
