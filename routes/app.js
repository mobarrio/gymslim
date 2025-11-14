const express = require('express');
const router = express.Router();
const appController = require('../controllers/appController');
const { checkAuth, checkPasswordChange } = require('../middlewares/authMiddleware');

// Proteger todas las rutas de la app
router.use(checkAuth);
router.use(checkPasswordChange);

// GET / - Redirigir al horario
router.get('/', (req, res) => {
  // --- CAMBIO AQUÍ ---
  // La nueva página principal por defecto es la lista de "Hoy"
  res.redirect('/list?range_key=today');
});

// GET /horario - Mostrar selector de fechas
router.get('/horario', appController.showHorario);

// GET /list - Mostrar lista de clases
router.get('/list', appController.showList);

module.exports = router;
