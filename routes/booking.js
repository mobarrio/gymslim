const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { checkAuth } = require('../middlewares/authMiddleware');

// POST /api/reservar - Crear una reserva (proxy)
// Protegida para que solo usuarios logueados puedan reservar
router.post('/reservar', checkAuth, bookingController.createBooking);

module.exports = router;
