// Fichero: services/cacheService.js (CORRECCIÓN DEFINITIVA DE TOKEN)
const axios = require('axios');
const fs = require('fs').promises;
const { ApiCache } = require('../database');
const { logDebug } = require('../utils/logger'); 

// --- ¡¡¡CORRECCIÓN CRÍTICA AQUÍ!!! ---
// API_BASE_URL: La URL base de la API (ej. https://app.gym-up.com/ws/v2/event_sessions_public)
const API_BASE_URL = process.env.API_BASE_URL;

// API_TOKEN: Leemos GYM_TOKEN del .env y lo asignamos a nuestra constante interna API_TOKEN
const API_TOKEN = process.env.GYM_TOKEN; 

const CACHE_KEY_PREFIX = 'api_events_';

if (!API_TOKEN) {
  logDebug(0, "[ERROR] API_TOKEN (GYM_TOKEN) está UNDEFINED. La caché fallará.");
}
// --- FIN CORRECCIÓN CRÍTICA ---


// --- Funciones Auxiliares de Fechas ---

/**
 * Calcula las fechas y timestamps para la llamada a la API
 * según las directrices: Lunes de esta semana + 14 días.
 */
function getApiTimestamps() {
  const now = new Date();
  now.setHours(12, 0, 0, 0); // Estandarizar a mediodía

  // 1. Encontrar el Lunes de esta semana (en UTC)
  const dayOfWeek = now.getUTCDay(); // 0=Dom, 1=Lun
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayThisWeek = new Date(now.getTime());
  mondayThisWeek.setUTCDate(now.getUTCDate() + diffToMonday);
    
  // 2. Encontrar el Lunes de la semana que viene
  const mondayNextWeek = new Date(mondayThisWeek.getTime());
  mondayNextWeek.setUTCDate(mondayThisWeek.getUTCDate() + 7);

  // 3. Calcular fechas de fin
  const endCall1 = new Date(mondayThisWeek.getTime());
  endCall1.setUTCDate(mondayThisWeek.getUTCDate() + 13);
  const endCall2 = new Date(mondayNextWeek.getTime());
  endCall2.setUTCDate(mondayNextWeek.getUTCDate() + 6);

  // 4. Generar Timestamps UTC (00:00:00 y 23:59:59)
  const call1_start = new Date(Date.UTC(mondayThisWeek.getUTCFullYear(), mondayThisWeek.getUTCMonth(), mondayThisWeek.getUTCDate(), 0, 0, 0, 0));
  const call1_end = new Date(Date.UTC(endCall1.getUTCFullYear(), endCall1.getUTCMonth(), endCall1.getUTCDate(), 23, 59, 59, 0));
  const call2_start = new Date(Date.UTC(mondayNextWeek.getUTCFullYear(), mondayNextWeek.getUTCMonth(), mondayNextWeek.getUTCDate(), 0, 0, 0, 0));
  const call2_end = new Date(Date.UTC(endCall2.getUTCFullYear(), endCall2.getUTCMonth(), endCall2.getUTCDate(), 23, 59, 59, 0));

  const params = [
    { cacheKey: `${CACHE_KEY_PREFIX}1_${call1_start.toISOString().split('T')[0]}`, start: Math.floor(call1_start.getTime() / 1000), end: Math.floor(call1_end.getTime() / 1000) },
    { cacheKey: `${CACHE_KEY_PREFIX}2_${call2_start.toISOString().split('T')[0]}`, start: Math.floor(call2_start.getTime() / 1000), end: Math.floor(call2_end.getTime() / 1000) }
  ];

  logDebug(3, "Parámetros de llamada a API calculados:", params);
  return params;
}

/**
 * Llama a la API o sirve desde la caché de la BDD.
 */
async function fetchApiDataInternal(callParams, forceRefresh) {
  const { cacheKey, start, end } = callParams;

  // Si el token es inválido (ej. no se cargó el .env), devolvemos error inmediatamente
  if (!API_TOKEN) {
    logDebug(0, `[ERROR] API_TOKEN no disponible. Saltando llamada a API para ${cacheKey}.`);
    return []; 
  }

  // 1. Intentar cargar desde la caché si no hay refresh forzado
  if (!forceRefresh) {
    try {
      const cacheEntry = await ApiCache.findByPk(cacheKey);
      if (cacheEntry && new Date() < cacheEntry.expiresAt) {
        logDebug(1, `[Cache] HIT para ${cacheKey}. Sirviendo desde BDD.`);
        return JSON.parse(cacheEntry.data);
      } else if (cacheEntry) {
        logDebug(1, `[Cache] Expired para ${cacheKey}. Eliminando y buscando en la API.`);
        await cacheEntry.destroy();
      }
    } catch (e) {
      logDebug(1, `[Cache] Error al buscar en cache (BDD): ${e.message}`);
    }
  }

  if (forceRefresh) logDebug(1, `[Cache] REFRESH FORZADO para ${cacheKey}.`);
  else logDebug(1, `[Cache] MISS para ${cacheKey}. Buscando en la API...`);
    
  // La URL ahora se construye correctamente
  const API_URL = `${API_BASE_URL}/${API_TOKEN}/timetable?start=${start}&end=${end}`;

  logDebug(1, `Llamando a API: ${API_URL}`);

  try {
    const response = await axios.get(API_URL, { timeout: 10000 });
    const events = response.data.events || [];
    
    // Si la respuesta es exitosa, guardar en la caché de la BDD
    const expirationDate = new Date(Date.now() + (24 * 60 * 60 * 1000)); // Caduca en 24h
    
    await ApiCache.upsert({
      cacheKey: cacheKey,
      data: JSON.stringify(events),
      expiresAt: expirationDate
    });
    
    logDebug(2, `[Cache] Datos para ${cacheKey} guardados con ${events.length} eventos (Expira en 24h).`);
    return events;

  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
       console.error(`Error de timeout al llamar a la API para ${cacheKey}.`);
    } else {
       console.error(`Error al llamar a la API para ${cacheKey}:`, error.message);
    }
    logDebug(1, `Error al llamar a la API: ${error.message}`);
    return [];
  }
}

/**
 * Orquesta las dos llamadas a la API y combina los resultados.
 */
async function fetchAllApiData(forceRefresh = false) {
  
  if (forceRefresh) {
    logDebug(1, "[Cache] REFRESH: Limpiando cache.");
  }

  const apiParams = getApiTimestamps(); 
    
  // Realiza ambas llamadas (o lecturas de cache)
  const events1 = await fetchApiDataInternal(apiParams[0], forceRefresh);
  const events2 = await fetchApiDataInternal(apiParams[1], forceRefresh);

  // Combina y de-duplica los resultados
  const eventMap = new Map();
  for (const event of events1) { eventMap.set(event.id, event); }
  for (const event of events2) { eventMap.set(event.id, event); }

  const allEvents = Array.from(eventMap.values());
    
  // Ordenar por fecha de inicio
  allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
    
  return allEvents;
}


module.exports = {
  fetchAllApiData,
  getApiTimestamps
};
