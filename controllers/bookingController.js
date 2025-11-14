const axios = require('axios');
const { logDebug } = require('../utils/logger');
const { URLSearchParams } = require('url');

// Constantes de API (desde .env)
const BOOKING_API_URL = process.env.BOOKING_API_URL;
const GYM_TOKEN = process.env.GYM_TOKEN;
const BOOKING_PASSWORD = process.env.BOOKING_PASSWORD;
const FALLBACK_EMAIL = process.env.BOOKING_EMAIL;

// API Proxy para crear la reserva
exports.createBooking = async (req, res) => {
  // Datos que nos envía nuestro propio frontend
  const { sessionId, roomName } = req.body;

  // --- ¡NUEVO! Usar el email de la sesión ---
  const activeEmail = req.session.activeBookingEmail || FALLBACK_EMAIL;
  // --- Fin Nuevo ---

  if (!sessionId || !roomName) {
    return res.status(400).json({ success: false, message: 'Falta el ID de sesión o el nombre de la sala.' });
  }

  logDebug(2, `[Reserva] Intento de reserva para Sesión: ${sessionId}, Sala: ${roomName}, Email: ${activeEmail}`);

  // 1. Construir el body en formato x-www-form-urlencoded
  const bookingBody = new URLSearchParams();
  bookingBody.append('gym_token', GYM_TOKEN);
  bookingBody.append('booking[event_session_id]', sessionId);
  bookingBody.append('booking[name]', '');
  bookingBody.append('booking[email]', activeEmail); // Usar email de sesión
  bookingBody.append('booking[phone]', '');
  bookingBody.append('booking[sala]', roomName);
  bookingBody.append('password', BOOKING_PASSWORD);

  // 2. Construir los headers
  const bookingHeaders = {
    'authority': 'app.gym-up.com',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 Edg/87.0.664.66',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  };

  // 3. Llamar a la API externa de Gym-Up
  try {
    const apiResponse = await axios.post(
      BOOKING_API_URL,
      bookingBody,
      { headers: bookingHeaders }
    );

    logDebug(3, "[Reserva] Respuesta de API exitosa:", apiResponse.data);
    res.json({ success: true, message: `¡Reserva confirmada con ${activeEmail}!` });

  } catch (error) {
    logDebug(1, "[Reserva] Error al llamar a la API de Gym-Up:", error.message);
    let errorMessage = 'Error desconocido al reservar.';
    if (error.response && error.response.data) {
      errorMessage = error.response.data.error || JSON.stringify(error.response.data);
    }
    res.status(500).json({ success: false, message: `Error de la API: ${errorMessage}` });
  }
};
