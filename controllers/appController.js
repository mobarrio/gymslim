// Fichero: controllers/appController.js (Versión Kilo - MODIFICADO)
const { ApiCache, FavoriteActivity } = require('../database'); 
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

function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayString() {
  return formatDate(new Date());
}

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(date.getDate() + days);
  return d;
};

// --- Fin Funciones Robustas de Fecha ---


function calculateDatesFromRangeKey(rangeKey) {
  const today = new Date();
  today.setHours(0, 0, 0, 0); 
  
  let startDate = formatDate(today);
  let endDate = formatDate(today);
  let tempDate = new Date(today); 

  switch (rangeKey) {
    case 'tomorrow':
      tempDate = addDays(today, 1);
      startDate = formatDate(tempDate);
      endDate = formatDate(tempDate);
      break;
      
    case 'next_7':
      tempDate = addDays(today, 6); 
      endDate = formatDate(tempDate);
      break;
      
    case 'this_week':
      const dayOfWeek = today.getDay(); 
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = addDays(today, diffToMonday);
      const sunday = addDays(monday, 6);

      startDate = formatDate(monday);
      endDate = formatDate(sunday);
      
      const todayStr = getTodayString();
      if (startDate < todayStr) {
        startDate = todayStr;
      }
      break;
      
    case 'today':
    default:
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

// GET /list (MODIFICADO para FAVORITAS por defecto)
exports.showList = async (req, res) => {
  // CRÍTICO: Si filter no existe, asumimos 'favorites' (antes era 'all')
  const { start, end, refresh, activity, range_key, filter } = req.query; 
  const currentFilter = filter || 'favorites'; // <-- ¡CAMBIO CRÍTICO AQUÍ!
  
  let filterStartDate, filterEndDate, effectiveRangeKey;

  const errorRender = (message) => {
    return res.status(400).render('horario', { 
      today: getTodayString(), 
      error: message, 
      range_key: 'custom' 
    });
  };

  // --- LÓGICA DE MANEJO DE RANGO ---
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
    // Si no hay parámetros, redirigimos a 'today'
    return res.redirect('/list?range_key=today&filter=' + currentFilter); 
  }
  // --- FIN LÓGICA DE MANEJO DE RANGO ---
  
  const selectedActivity = activity || 'todas';
  const today = getTodayString();
  
  logDebug(3, `Filtro final: ${filterStartDate} a ${filterEndDate}, Activity: ${selectedActivity}, Filter Type: ${currentFilter}, Refresh: ${!!refresh}`);

  // --- Validación de Fechas ---
  if (!filterStartDate || !filterEndDate) { return errorRender('Fechas de inicio y fin son requeridas.'); }
  if (filterEndDate < filterStartDate) { return errorRender('La fecha fin no puede ser anterior a la fecha inicio.'); }
  // --- Fin Validación ---

  try {
    const isRefresh = refresh === 'true';
    const userId = req.session.userId;
    
    // 1. Obtener datos y favoritos
    const allEventsFromApi = await fetchAllApiData(isRefresh);
    let favoriteNames = [];
    
    const favoriteEntries = await FavoriteActivity.findAll({
        where: { userId: userId },
        attributes: ['activityName']
    });
    favoriteNames = favoriteEntries.map(e => e.activityName);
    
    // 2. Generar lista de actividades para el dropdown
    const allActivityNames = [...new Set(allEventsFromApi.map(e => e.activity_name))]
      .filter(name => name)
      .sort();

    // --- APLICACIÓN DE FILTROS ---

    // Filtro inicial: Rango de Fechas y Hora Actual
    let eventsFiltered = allEventsFromApi.filter(event => {
      const eventDateStr = event.start.split('T')[0];
      
      // Filtro 1: Rango de fechas
      if (eventDateStr < filterStartDate || eventDateStr > filterEndDate) {
          return false;
      }
      
      // Filtro 2: Hora actual (para hoy)
      if (eventDateStr === today) {
        const eventStartTime = new Date(event.start);
        return eventStartTime >= new Date(); 
      }
      
      return true;
    });

    // Filtro 3: FAVORITAS (Si el filtro es 'favorites')
    if (currentFilter === 'favorites') {
        eventsFiltered = eventsFiltered.filter(event => 
            favoriteNames.includes(event.activity_name)
        );
        logDebug(3, `Eventos tras Filtro Favoritas: ${eventsFiltered.length} (de ${favoriteNames.length} favoritas)`);
    }


    // Filtro 4: ACTIVIDAD (Filtro de dropdown)
    if (selectedActivity !== 'todas') {
        eventsFiltered = eventsFiltered.filter(event => 
            event.activity_name === selectedActivity
        );
        logDebug(3, `Eventos tras Filtro de Actividad: ${eventsFiltered.length}`);
    }
    // --- FIN APLICACIÓN DE FILTROS ---


    // 3. Renderizar
    res.render('list', {
      events: eventsFiltered,
      allActivityNames: allActivityNames,
      favoriteNames: favoriteNames, 
      startDate: filterStartDate,
      endDate: filterEndDate,
      selectedActivity: selectedActivity,
      currentFilter: currentFilter, 
      helpers: helpers,
      range_key: effectiveRangeKey
    });

  } catch (error) {
    console.error("Error al procesar /list:", error);
    logDebug(1, `Error en showList: ${error.message}`);
    res.status(500).send('Error procesando la solicitud de clases: ' + error.message);
  }
};
