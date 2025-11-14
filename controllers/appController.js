// Fichero: controllers/appController.js
const { ApiCache } = require('../database');
const { fetchAllApiData } = require('../services/cacheService');
const { logDebug } = require('../utils/logger');

// Helpers (movidos aquí para estar disponibles)
const helpers = {
  capitalizar: (str) => { if (typeof str !== 'string' || str.length === 0) return ''; return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(); },
  obtenerInstructor: (event) => { if (event.instructors && event.instructors.length > 0) { return event.instructors[0].name || 'N/A'; } if (event.title && event.title.toLowerCase().includes('virtual')) { return ''; } return 'Gimnasio'; },
  obtenerAvatar: (event) => { if (event.instructors && event.instructors.length > 0 && event.instructors[0].avatar) { const avatarUrl = event.instructors[0].avatar; if (avatarUrl.startsWith('http')) return avatarUrl; } return 'https://i.imgur.com/832DYNW.png'; },
  formatearPlazas: (places) => { if (!places) return 'N/A'; const booked = places.booked || 0; const total = places.total || 0; const available = total - booked; return `${booked} / ${total} (${available})`; },
  formatearFecha: (mobile) => { if (!mobile) return 'N/A'; const diaSemana = helpers.capitalizar(mobile.week_day || ''); const diaMes = mobile.month_day || ''; const hora = mobile.start_time || ''; return `${diaSemana} ${diaMes} ${hora}`; }
};

// Función para obtener la fecha de hoy YYYY-MM-DD
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- NUEVA FUNCIÓN ---
/**
 * Convierte un string de rango (ej. 'today') en un objeto { start, end }
 * @param {string} rangeKey - La clave del rango (today, tomorrow, etc.)
 * @returns {{start: string, end: string}}
 */
function calculateDatesFromRangeKey(rangeKey) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  let startDate = todayStr;
  let endDate = todayStr;

  switch (rangeKey) {
    case 'today':
      // start y end ya son todayStr
      break;
    case 'tomorrow':
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      startDate = tomorrowStr;
      endDate = tomorrowStr;
      break;
    case 'next_7':
      const next7 = new Date(today);
      next7.setDate(today.getDate() + 6); // 6 días desde hoy = 7 días en total
      endDate = next7.toISOString().split('T')[0];
      break;
    case 'this_week':
      // Lógica de la Versión Alfa: 0=Dom, 1=Lun
      const dayOfWeek = today.getUTCDay(); 
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      
      const monday = new Date(today);
      monday.setDate(today.getDate() + diffToMonday);
      
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      startDate = monday.toISOString().split('T')[0];
      endDate = sunday.toISOString().split('T')[0];
      
      // Asegurarnos de no mostrar días pasados de esta semana
      if (startDate < todayStr) {
        startDate = todayStr;
      }
      break;
  }
  return { start: startDate, end: endDate };
}
// --- FIN NUEVA FUNCIÓN ---


// GET /horario
exports.showHorario = (req, res) => {
  const today = getTodayString();
  logDebug(3, "Sirviendo formulario de selección de fecha EJS.");
  
  // Pasa datos a la plantilla EJS
  // res.locals.user y res.locals.activeBookingEmail ya están seteados por el middleware global
  res.render('horario', {
    today: today,
    error: null, // Para manejar errores de /list
    range_key: 'custom' // Para que el nav muestre "Rango Personalizado..."
  });
};

// GET /list
exports.showList = async (req, res) => {
  // --- LÓGICA DE FECHAS MODIFICADA ---
  const { start, end, refresh, activity, range_key } = req.query;
  let filterStartDate, filterEndDate, effectiveRangeKey;

  const errorRender = (message) => {
    return res.status(400).render('horario', {
      today: getTodayString(),
      error: message,
      range_key: 'custom'
    });
  };

  if (range_key) {
    // Opción 1: El usuario usó el selector rápido
    logDebug(3, `Ruta /list accedida con range_key: ${range_key}`);
    if (range_key === 'custom') {
      // Si seleccionó "Custom", lo mandamos a la página de horario
      // (Aunque el JS ya hace esto, es un fallback)
      return res.redirect('/horario');
    }
    const dates = calculateDatesFromRangeKey(range_key);
    filterStartDate = dates.start;
    filterEndDate = dates.end;
    effectiveRangeKey = range_key;
  } else if (start && end) {
    // Opción 2: El usuario usó el formulario de /horario (o un bookmark)
    logDebug(3, `Ruta /list accedida con fechas: ${start} a ${end}`);
    filterStartDate = start;
    filterEndDate = end;
    // Si las fechas coinciden con un rango, lo seleccionamos
    if (start === end && start === getTodayString()) {
       effectiveRangeKey = 'today';
    } else {
       effectiveRangeKey = 'custom'; // Si vienen fechas, es un rango custom
    }
  } else {
    // Opción 3: El usuario accedió a /list sin fechas (ej. desde /)
    // Redirigimos a una vista por defecto (Hoy)
    return res.redirect('/list?range_key=today');
  }
  
  const selectedActivity = activity || 'todas';
  const today = getTodayString();
  
  logDebug(3, `Filtro final: ${filterStartDate} a ${filterEndDate}, Activity: ${selectedActivity}, Refresh: ${!!refresh}`);

  // --- Validación de Fechas ---
  if (!filterStartDate || !filterEndDate) { return errorRender('Fechas de inicio y fin son requeridas.'); }
  // (Validación de fechas pasadas se maneja en el filtro de "eventsAfterNow")
  if (filterEndDate < filterStartDate) { return errorRender('La fecha fin no puede ser anterior a la fecha inicio.'); }
  // --- Fin Validación ---

  try {
    const isRefresh = refresh === 'true';
    const allEventsFromApi = await fetchAllApiData(isRefresh);
    logDebug(3, `Total de eventos únicos de API/Cache: ${allEventsFromApi.length}`);

    const allActivityNames = [...new Set(allEventsFromApi.map(e => e.activity_name))]
      .filter(name => name) // Filtra nulos o strings vacíos
      .sort();
    logDebug(3, `Generadas ${allActivityNames.length} actividades únicas para el filtro.`);

    // --- Filtros ---
    const eventsInDateRange = allEventsFromApi.filter(event => {
      const eventDateStr = event.start.split('T')[0];
      return eventDateStr >= filterStartDate && eventDateStr <= filterEndDate;
    });
    logDebug(3, `Eventos tras Filtro de Rango: ${eventsInDateRange.length}`);
    
    const now = new Date(); 
    const eventsAfterNow = eventsInDateRange.filter(event => {
      const eventDateStr = event.start.split('T')[0];
      if (eventDateStr === today) {
        const eventStartTime = new Date(event.start);
        return eventStartTime >= now;
      }
      // Si la fecha del evento es futura, siempre es true
      return eventDateStr > today;
    });
    logDebug(3, `Eventos tras Filtro de Hora: ${eventsAfterNow.length}`);

    const finalFilteredEvents = (selectedActivity === 'todas')
      ? eventsAfterNow
      : eventsAfterNow.filter(event => event.activity_name === selectedActivity);
    logDebug(3, `Eventos tras Filtro de Actividad (${selectedActivity}): ${finalFilteredEvents.length}`);

    // --- Renderizar ---
    res.render('list', {
      events: finalFilteredEvents,
      allActivityNames: allActivityNames,
      startDate: filterStartDate,
      endDate: filterEndDate,
      selectedActivity: selectedActivity,
      helpers: helpers, // Pasamos los helpers a la vista
      range_key: effectiveRangeKey // Pasamos el range_key para el <select>
    });

  } catch (error) {
    console.error("Error al procesar /list:", error);
    res.status(500).send('Error procesando la solicitud: ' + error.message);
  }
};
