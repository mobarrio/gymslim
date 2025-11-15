// Fichero: controllers/bookingController.js (Versión Delta)
const axios = require('axios');
const { URLSearchParams } = require('url');
const { logDebug } = require('../utils/logger'); // Importar logger

// POST /api/reservar
exports.createBooking = async (req, res) => {
  const { sessionId, roomName } = req.body;
  
  // --- LÓGICA MODIFICADA (Versión Delta) ---
  // Obtener los datos del usuario desde res.locals (inyectado por el middleware)
  const userEmail = res.locals.user?.bookingEmail;
  const userName = res.locals.user?.name || res.locals.user?.username; // Usar nombre, o fallback a username

  // 1. Validar que el usuario tenga un email de reserva configurado
  if (!userEmail) {
    logDebug(1, `[Booking] Fallido: El usuario ${userName} (ID: ${res.locals.user.id}) no tiene email de reserva.`);
    return res.status(400).json({ 
      message: "Error: No tienes un email de reserva configurado. Por favor, ve a 'Mi Perfil' para añadirlo." 
    });
  }

  logDebug(3, `[Booking] Intento de reserva para Sesión: ${sessionId} por Usuario: ${userName} (Email: ${userEmail})`);

  // 2. Obtener credenciales de la API desde .env
  const GYM_TOKEN = process.env.GYM_TOKEN;
  const API_PASSWORD = process.env.BOOKING_API_PASSWORD;

  if (!GYM_TOKEN || !API_PASSWORD) {
    logDebug(1, "[Booking] Error fatal: Faltan GYM_TOKEN o BOOKING_API_PASSWORD en .env");
    return res.status(500).json({ message: 'Error de configuración del servidor.' });
  }

  // 3. Preparar la solicitud a la API de Gym-Up
  const bookingApiUrl = 'https://app.gym-up.com/api/v1/bookings/';
  
  const headers = {
    'authority': 'app.gym-up.com',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 Edg/87.0.664.66',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  };

  const body = new URLSearchParams({
    'gym_token': GYM_TOKEN,
    'booking[event_session_id]': sessionId,
    'booking[name]': userName, // <-- Se usa el nombre del perfil
    'booking[email]': userEmail, // <-- Se usa el email del perfil
    'booking[phone]': '',
    'booking[sala]': roomName,
    'password': API_PASSWORD
  });

  // 4. Realizar la llamada (proxy)
  try {
    const apiResponse = await axios.post(bookingApiUrl, body.toString(), { headers });

    logDebug(3, `[Booking] Respuesta de Gym-Up (Sesión ${sessionId}):`, apiResponse.data);

    // 5. Enviar respuesta al cliente (navegador)
    // Asumimos que la API de Gym-Up responde con un JSON que incluye 'message' o 'notice'
    if (apiResponse.data && (apiResponse.data.message || apiResponse.data.notice)) {
      res.status(200).json({ 
        message: apiResponse.data.message || apiResponse.data.notice 
      });
    } else {
      // Si la API responde OK pero formato inesperado
      res.status(200).json({ message: 'Reserva completada (Respuesta desconocida de API)' });
    }
  } catch (error) {
    logDebug(1, `[Booking] ERROR al llamar a Gym-Up (Sesión ${sessionId}):`, error.response ? error.response.data : error.message);
    
    // Si la API de Gym-Up devuelve un error (ej. 422, 500)
    if (error.response && error.response.data) {
      // Reenviar el mensaje de error de la API
      res.status(400).json({ 
        message: error.response.data.message || error.response.data.error || 'Error de la API de reservas.'
      });
    } else {
      // Error de red o de axios
      res.status(500).json({ message: 'Error de conexión con el servicio de reservas.' });
    }
  }
};
