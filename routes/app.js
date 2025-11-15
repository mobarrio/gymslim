// Fichero: routes/app.js (Versión Kilo - MODIFICADO)
const express = require('express');
const router = express.Router();
const appController = require('../controllers/appController');
const { checkAuth, checkPasswordChange } = require('../middlewares/authMiddleware');
const { checkForceMfaSetup } = require('../middlewares/checkForceMfaSetup'); 

// Proteger todas las rutas de la app
router.use(checkAuth);
router.use(checkPasswordChange);

// Si mustConfigureMfa = true, redirige a /profile
router.use(checkForceMfaSetup);

// GET / - Redirigir al horario
router.get('/', (req, res) => {
  // --- ¡CAMBIO CRÍTICO! Favoritas por defecto ---
  res.redirect('/list?filter=favorites&range_key=today');
});

// GET /horario - Mostrar selector de fechas
router.get('/horario', appController.showHorario);

// GET /list - Mostrar lista de clases
router.get('/list', appController.showList);

module.exports = router;
