const axios = require('axios');
const { ApiCache } = require('../database');
const { logDebug } = require('../utils/logger');

// Constantes de API (desde .env)
const API_BASE_URL = process.env.API_BASE_URL;
const GYM_TOKEN = process.env.GYM_TOKEN;

/**
 * Calcula las fechas y timestamps para la llamada a la API
 * (Sin cambios desde la vAlfa)
 */
function getApiTimestamps() {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const dayOfWeek = now.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayThisWeek = new Date(now.getTime());
  mondayThisWeek.setUTCDate(now.getUTCDate() + diffToMonday);
  const mondayNextWeek = new Date(mondayThisWeek.getTime());
  mondayNextWeek.setUTCDate(mondayThisWeek.getUTCDate() + 7);
  const endCall1 = new Date(mondayThisWeek.getTime());
  endCall1.setUTCDate(mondayThisWeek.getUTCDate() + 13);
  const endCall2 = new Date(mondayNextWeek.getTime());
  endCall2.setUTCDate(mondayNextWeek.getUTCDate() + 6);
  const call1_start = new Date(Date.UTC(mondayThisWeek.getUTCFullYear(), mondayThisWeek.getUTCMonth(), mondayThisWeek.getUTCDate(), 0, 0, 0, 0));
  const call1_end = new Date(Date.UTC(endCall1.getUTCFullYear(), endCall1.getUTCMonth(), endCall1.getUTCDate(), 23, 59, 59, 0));
  const call2_start = new Date(Date.UTC(mondayNextWeek.getUTCFullYear(), mondayNextWeek.getUTCMonth(), mondayNextWeek.getUTCDate(), 0, 0, 0, 0));
  const call2_end = new Date(Date.UTC(endCall2.getUTCFullYear(), endCall2.getUTCMonth(), endCall2.getUTCDate(), 23, 59, 59, 0));
  const params = [
    { cacheKey: `semana_${call1_start.toISOString().split('T')[0]}_14d`, start: Math.floor(call1_start.getTime() / 1000), end: Math.floor(call1_end.getTime() / 1000) },
    { cacheKey: `semana_${call2_start.toISOString().split('T')[0]}_7d`, start: Math.floor(call2_start.getTime() / 1000), end: Math.floor(call2_end.getTime() / 1000) }
  ];
  logDebug(3, "[Cache] Parámetros de llamada a API calculados:", params);
  return params;
}

/**
 * Busca datos en la API o en la caché de la BDD.
 */
async function fetchApiDataInternal(callParams, forceRefresh) {
  const { cacheKey, start, end } = callParams;
  const now = new Date();

  // 1. Limpiar caché si está forzado
  if (forceRefresh) {
    logDebug(1, `[Cache] REFRESH FORZADO para ${cacheKey}. Eliminando de BDD...`);
    await ApiCache.destroy({ where: { cacheKey: cacheKey } });
  }

  // 2. Intentar leer de la caché de la BDD
  if (!forceRefresh) {
    const cachedData = await ApiCache.findOne({ where: { cacheKey: cacheKey } });

    // Verificar si existe Y si no ha expirado
    if (cachedData && cachedData.expiresAt > now) {
      logDebug(1, `[Cache] HIT para ${cacheKey}. Sirviendo desde BDD.`);
      return JSON.parse(cachedData.data); // Devolvemos el JSON parseado
    } else if (cachedData) {
      logDebug(1, `[Cache] STALE para ${cacheKey}. Expiró, buscando en API...`);
    } else {
      logDebug(1, `[Cache] MISS para ${cacheKey}. Buscando en API...`);
    }
  }

  // 3. Si no hay caché válido, llamar a la API
  const API_URL = `${API_BASE_URL}/${GYM_TOKEN}/timetable?start=${start}&end=${end}`;
  logDebug(1, `[Cache] Llamando a API: ${API_URL}`);

  try {
    const response = await axios.get(API_URL);
    const events = response.data.events || [];
    logDebug(2, `[Cache] Respuesta JSON de la API (para ${cacheKey}) recibida.`);

    // 4. Guardar en la caché de la BDD
    const expiryDate = new Date(now.getTime() + 6 * 60 * 60 * 1000); // Caché de 6 horas
    
    await ApiCache.upsert({
      cacheKey: cacheKey,
      data: JSON.stringify(events), // Guardamos el JSON como string
      expiresAt: expiryDate
    });
    
    logDebug(3, `[Cache] Datos para ${cacheKey} guardados en BDD. Expiran: ${expiryDate.toLocaleTimeString()}`);
    return events;
  } catch (error) {
    console.error(`[Cache] Error al llamar a la API para ${cacheKey}:`, error.message);
    logDebug(1, `[Cache] Error API: ${error.message}`);
    return []; // Devolver vacío en caso de error
  }
}

/**
 * Orquesta las dos llamadas a la API y combina los resultados.
 */
async function fetchAllApiData(forceRefresh = false) {
  if (forceRefresh) {
    logDebug(1, "[Cache] REFRESH: Limpiando *toda* la caché de la BDD.");
    // Opcional: limpiar toda la tabla si el refresh es "total"
    // await ApiCache.truncate();
    // Por ahora, el forceRefresh se pasa a fetchApiDataInternal
  }

  const apiParams = getApiTimestamps();

  const events1 = await fetchApiDataInternal(apiParams[0], forceRefresh);
  const events2 = await fetchApiDataInternal(apiParams[1], forceRefresh);

  // Combinar y de-duplicar
  const eventMap = new Map();
  for (const event of events1) { eventMap.set(event.id, event); }
  logDebug(3, `Eventos de Call 1: ${events1.length}. Mapa tras Call 1: ${eventMap.size}`);
  for (const event of events2) { eventMap.set(event.id, event); }
  logDebug(3, `Eventos de Call 2: ${events2.length}. Mapa tras Call 2 (combinado): ${eventMap.size}`);

  const allEvents = Array.from(eventMap.values());
  allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

  return allEvents;
}

module.exports = {
  fetchAllApiData,
  getApiTimestamps // Exportar si otros módulos la necesitan
};
