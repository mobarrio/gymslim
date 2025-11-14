// Fichero: routes/app.js (Versión Hotel - MODIFICADO)
const express = require('express');
const router = express.Router();
const appController = require('../controllers/appController');
const { checkAuth, checkPasswordChange } = require('../middlewares/authMiddleware');
// --- ¡NUEVO! Importar el middleware de MFA ---
const { checkForceMfaSetup } = require('../middlewares/checkForceMfaSetup'); 

// Proteger todas las rutas de la app
router.use(checkAuth);
router.use(checkPasswordChange);

// --- ¡NUEVO! Añadir el middleware de MFA ---
// Si mustConfigureMfa = true, redirige a /profile
router.use(checkForceMfaSetup);
// --- FIN NUEVO ---

// GET / - Redirigir al horario
router.get('/', (req, res) => {
  res.redirect('/list?range_key=today');
});

// GET /horario - Mostrar selector de fechas
router.get('/horario', appController.showHorario);

// GET /list - Mostrar lista de clases
router.get('/list', appController.showList);

module.exports = router;
