// Fichero: controllers/appController.js (CORRECCIÓN FINAL DE ZONA HORARIA)
const { ApiCache } = require('../database');
const { fetchAllApiData } = require('../services/cacheService');
const { logDebug } = require('../utils/logger'); 

// Helpers (movidos aquí para estar disponibles)
const helpers = {
  capitalizar: (str) => { if (typeof str !== 'string' || str.length === 0) return ''; return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(); },
  obtenerInstructor: (event) => { if (event.instructors && event.instructors.length > 0) { return event.instructors[0].name || 'N/A'; } if (event.title && event.title.toLowerCase().includes('virtual')) { return ''; } return 'Gimnasio'; },
  obtenerAvatar: (event) => { if (event.instructors && event.instructors.length > 0 && event.instructors[0].avatar) { const avatarUrl = event.instructors[0].avatar; if (avatarUrl.startsWith('http')) return avatarUrl; } return 'https://i.imgur.com/832DYNW.png'; },
  formatearPlazas: (places) => { if (!places) return 'N/A'; const booked = places.booked || 0; const total = places.total || 0; const available = total - booked; return `${booked} / ${total} (${available})`; },
  formatearFecha: (mobile) => { if (!mobile) return 'N/A'; const diaSemana = helpers.capitalizar(mobile.week_day || ''); const diaMes = mobile.month_day || ''; const hora = mobile.start_time || ''; return `${diaSemana} ${diaMes} ${hora}`; },
  obtenerUrlReserva: (sessionId) => { return `${process.env.BOOKING_API_URL}/${sessionId}`; }
};

// --- Funciones Robustas de Fecha ---

/**
 * Función para formatear una fecha al estándar YYYY-MM-DD local,
 * asegurando que no retrocede por diferencias de huso horario (UTC - Local).
 * @param {Date} dateObj
 * @returns {string} Fecha formateada.
 */
function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Función para obtener la fecha de hoy YYYY-MM-DD
 */
function getTodayString() {
  return formatDate(new Date());
}

/**
 * Función para sumar días a una fecha de manera segura.
 */
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(date.getDate() + days);
  return d;
};

// --- Fin Funciones Robustas de Fecha ---


/**
 * Convierte un string de rango (ej. 'tomorrow') en un objeto { start, end }
 * @param {string} rangeKey - La clave del rango (today, tomorrow, etc.)
 * @returns {{start: string, end: string}}
 */
function calculateDatesFromRangeKey(rangeKey) {
  // Siempre trabajamos con la fecha de hoy al inicio de la jornada (00:00:00)
  const today = new Date();
  today.setHours(0, 0, 0, 0); 
  
  let startDate = formatDate(today);
  let endDate = formatDate(today);
  
  let tempDate = new Date(today); // Usamos un objeto temporal para los cálculos

  switch (rangeKey) {
    case 'tomorrow':
      // Mañana es Hoy + 1 día
      tempDate = addDays(today, 1);
      startDate = formatDate(tempDate);
      endDate = formatDate(tempDate);
      break;
      
    case 'next_7':
      // Próximos 7 días: Hoy hasta Hoy + 6 días
      tempDate = addDays(today, 6); 
      endDate = formatDate(tempDate);
      break;
      
    case 'this_week':
      // 1. Encontrar el Lunes de esta semana
      const dayOfWeek = today.getDay(); // 0=Dom, 1=Lun
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = addDays(today, diffToMonday);
      
      // 2. Encontrar el Domingo de esta semana
      const sunday = addDays(monday, 6);

      startDate = formatDate(monday);
      endDate = formatDate(sunday);
      
      // 3. CRÍTICO: Asegurarnos de que el rango no empieza en el pasado
      const todayStr = getTodayString();
      if (startDate < todayStr) {
        startDate = todayStr;
      }
      break;
      
    case 'today':
    default:
      // start y end ya son hoy
      break;
  }
  
  return { start: startDate, end: endDate };
}


// GET /horario
exports.showHorario = (req, res) => {
  const today = getTodayString();
  logDebug(3, "Sirviendo formulario de selección de fecha EJS.");
  
  res.render('horario', {
    today: today,
    error: null, 
    range_key: 'custom'
  });
};

// GET /list
exports.showList = async (req, res) => {
  const { start, end, refresh, activity, range_key } = req.query;
  let filterStartDate, filterEndDate, effectiveRangeKey;

  const errorRender = (message) => {
    return res.status(400).render('horario', { 
      today: getTodayString(), 
      error: message, 
      range_key: 'custom' 
    });
  };

  // --- LÓGICA DE MANEJO DE RANGO (CRÍTICO) ---
  if (range_key) {
    if (range_key === 'custom') {
      return res.redirect('/horario');
    }
    const dates = calculateDatesFromRangeKey(range_key);
    filterStartDate = dates.start;
    filterEndDate = dates.end;
    effectiveRangeKey = range_key;
  } else if (start && end) {
    filterStartDate = start;
    filterEndDate = end;
    
    if (start === end && start === getTodayString()) {
       effectiveRangeKey = 'today';
    } else {
       effectiveRangeKey = 'custom';
    }
  } else {
    // Default: Redirigir a 'today' si no hay parámetros
    return res.redirect('/list?range_key=today');
  }
  // --- FIN LÓGICA DE MANEJO DE RANGO ---
  
  const selectedActivity = activity || 'todas';
  const today = getTodayString();
  
  logDebug(3, `Filtro final: ${filterStartDate} a ${filterEndDate}, Activity: ${selectedActivity}, Refresh: ${!!refresh}`);

  // --- Validación de Fechas ---
  if (!filterStartDate || !filterEndDate) { return errorRender('Fechas de inicio y fin son requeridas.'); }
  if (filterEndDate < filterStartDate) { return errorRender('La fecha fin no puede ser anterior a la fecha inicio.'); }
  // --- Fin Validación ---

  try {
    const isRefresh = refresh === 'true';
    
    // 1. Obtener datos (de la API o la caché)
    const allEventsFromApi = await fetchAllApiData(isRefresh);
    logDebug(3, `Total de eventos únicos de API/Cache: ${allEventsFromApi.length}`);

    // 2. Generar lista de actividades
    const allActivityNames = [...new Set(allEventsFromApi.map(e => e.activity_name))]
      .filter(name => name)
      .sort();
    logDebug(3, `Generadas ${allActivityNames.length} actividades únicas para el filtro.`);

    // 3. FILTRO 1: RANGO DE FECHAS (Filtro de usuario)
    const eventsInDateRange = allEventsFromApi.filter(event => {
      const eventDateStr = event.start.split('T')[0];
      return eventDateStr >= filterStartDate && eventDateStr <= filterEndDate;
    });
    logDebug(3, `Eventos tras Filtro de Rango: ${eventsInDateRange.length}`);
    
    // 4. FILTRO 2: HORA ACTUAL (Solo para el día actual)
    const now = new Date(); 
    const eventsAfterNow = eventsInDateRange.filter(event => {
      const eventDateStr = event.start.split('T')[0];
      
      // Si la fecha del evento es HOY, filtramos por la hora.
      if (eventDateStr === today) {
        const eventStartTime = new Date(event.start);
        // Debe ser MAYOR o IGUAL a la hora actual
        return eventStartTime >= now; 
      }
      
      // Si la fecha del evento es FUTURA, siempre es true.
      return eventDateStr > today;
    });
    logDebug(3, `Eventos tras Filtro de Hora: ${eventsAfterNow.length}`);

    // 5. FILTRO 3: ACTIVIDAD
    const finalFilteredEvents = (selectedActivity === 'todas')
      ? eventsAfterNow
      : eventsAfterNow.filter(event => event.activity_name === selectedActivity);
    logDebug(3, `Eventos tras Filtro de Actividad: ${finalFilteredEvents.length}`);

    // 6. Renderizar
    res.render('list', {
      events: finalFilteredEvents,
      allActivityNames: allActivityNames,
      startDate: filterStartDate,
      endDate: filterEndDate,
      selectedActivity: selectedActivity,
      helpers: helpers,
      range_key: effectiveRangeKey
    });

  } catch (error) {
    console.error("Error al procesar /list:", error);
    logDebug(1, `Error en showList: ${error.message}`);
    res.status(500).send('Error procesando la solicitud de clases: ' + error.message);
  }
};
