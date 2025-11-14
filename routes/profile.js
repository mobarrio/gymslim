// Fichero: routes/profile.js (Versión India)
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

// --- Rutas de MFA (Existente) ---
router.post('/mfa/generate', profileController.generateMfaSecret);
router.post('/mfa/verify', profileController.verifyAndEnableMfa);
router.post('/mfa/disable', profileController.disableMfa);

// --- ¡NUEVAS RUTAS! Gestión de Favoritas (Versión India) ---

// GET /profile/favorites - Mostrar la lista maestra de actividades (gestión)
router.get('/favorites', profileController.showFavoriteActivities);

// POST /profile/favorites - Añadir o eliminar una actividad de la lista del usuario
router.post('/favorites', profileController.updateFavoriteActivity);

module.exports = router;
