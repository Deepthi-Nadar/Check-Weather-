// ===== Helpers =====
const $ = (s) => document.querySelector(s);

// Small loading hint in the city label
function setLoading(msg = "Loading...") {
  const el = $('#place');
  if (el) el.textContent = msg;
}

// Map WMO code -> short description
const codeToDesc = (code) => {
  const map = {
    0:'Clear', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
    45:'Fog', 48:'Rime fog',
    51:'Light drizzle', 53:'Drizzle', 55:'Dense drizzle',
    56:'Freezing drizzle', 57:'Dense freezing drizzle',
    61:'Light rain', 63:'Rain', 65:'Heavy rain',
    66:'Freezing rain', 67:'Heavy freezing rain',
    71:'Light snow', 73:'Snow', 75:'Heavy snow',
    77:'Snow grains',
    80:'Rain showers', 81:'Showers', 82:'Violent showers',
    85:'Snow showers', 86:'Heavy snow showers',
    95:'Thunderstorm', 96:'Thunder w/ hail', 99:'Thunder w/ heavy hail'
  };
  return map[code] || '—';
};

// ===== Icons (Meteocons) =====
const codeToMeteocon = (code, isDay=true) => {
  if (code === 0) return isDay ? 'clear-day' : 'clear-night';
  if ([1,2].includes(code)) return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (code === 3) return 'overcast';
  if ([45,48].includes(code)) return 'fog';
  if ([51,53,55,56,57].includes(code)) return 'drizzle';
  if ([61,63,65,66,67,80,81,82].includes(code)) return 'rain';
  if ([71,73,75,77,85,86].includes(code)) return 'snow';
  if ([95,96,99].includes(code)) return 'thunderstorms';
  return 'na';
};
const meteoconURL = (name) =>
  `https://cdn.jsdelivr.net/gh/basmilius/weather-icons/production/fill/all/${name}.svg`;

// Comfort texts
const humComfort = (h) => h < 30 ? 'Dry' : (h <= 60 ? 'Comfortable' : 'Humid');
const visText = (km) => km >= 10 ? 'Excellent visibility' : (km >= 5 ? 'Good' : (km >= 2 ? 'Moderate' : 'Poor'));
const windText = (k) => k < 6 ? 'Calm' : (k < 20 ? 'Breezy' : (k < 38 ? 'Windy' : 'Gale'));
const aqiText = (v) => v==null ? '—' : v<=50?'Good':v<=100?'Moderate':v<=150?'Unhealthy (SG)':v<=200?'Unhealthy':v<=300?'Very Unhealthy':'Hazardous';
const fmtDateLong = (iso) => new Date(iso).toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'});

// Themes (use your CSS theme classes)
const codeToTheme = (code, isDay) => {
  if (!isDay) return 'theme-night';
  if (code === 0) return 'theme-clear';
  if ([1,2,3].includes(code)) return 'theme-cloudy';
  if ([45,48].includes(code)) return 'theme-fog';
  if ([61,63,65,66,67,80,81,82].includes(code)) return 'theme-rain';
  if ([71,73,75,77,85,86].includes(code)) return 'theme-snow';
  if ([95,96,99].includes(code)) return 'theme-thunder';
  return 'theme-cloudy';
};

function setTheme(code, isDay){
  document.body.className = document.body.className
    .split(' ')
    .filter(c => !c.startsWith('theme-'))
    .join(' ');
  document.body.classList.add(codeToTheme(code, !!isDay));
}

// ===== APIs =====
async function geocodeCity(q){
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
  const r = await fetch(u).then(x=>x.json());
  if (!r?.results?.length) throw new Error('Place not found');
  const g = r.results[0];
  return { name: `${g.name}${g.admin1?`, ${g.admin1}`:''}${g.country?`, ${g.country}`:''}`, lat: g.latitude, lon: g.longitude };
}
async function reverseGeocode(lat, lon){
  try {
    const u = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`;
    const r = await fetch(u).then(x=>x.json());
    const g = r?.results?.[0];
    return g ? `${g.name}${g.admin1?`, ${g.admin1}`:''}${g.country?`, ${g.country}`:''}` : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}
async function fetchWeather(lat, lon){
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,weather_code,is_day',
    hourly: 'visibility',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    windspeed_unit: 'kmh',
    timezone: 'auto',
    forecast_days: '7'
  });
  return await fetch(url).then(x=>x.json());
}
async function fetchAQI(lat, lon){
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.search = new URLSearchParams({ latitude: lat, longitude: lon, hourly: 'us_aqi', timezone: 'auto' });
  return await fetch(url).then(x=>x.json());
}

function closestHourIdx(times, targetISO){
  const arr = Array.isArray(times) ? times : [];
  if (!arr.length || !targetISO) return 0;
  const t = new Date(targetISO).getTime();
  let best = 0, diff = Infinity;
  arr.forEach((iso, i) => {
    const d = Math.abs(new Date(iso).getTime() - t);
    if (d < diff){ diff = d; best = i; }
  });
  return best;
}

// ===== UI fragments =====
function setNowIcon(code, isDay, el){
  const name = codeToMeteocon(code, isDay);
  el.innerHTML = `<img src="${meteoconURL(name)}" alt="${codeToDesc(code)}" />`;
}

function setForecastIcons(daily, wrap){
  wrap.innerHTML = '';
  const daysAvailable = Math.max(
    0,
    Math.min(5, (daily?.time?.length || 0) - 1)
  );
  for (let i=1; i<=daysAvailable; i++){
    const date = daily.time[i];
    const code = daily.weather_code?.[i];
    const iconName = codeToMeteocon(code ?? 0, true);
    const max = Math.round(daily.temperature_2m_max?.[i] ?? 0);
    const min = Math.round(daily.temperature_2m_min?.[i] ?? 0);
    const card = document.createElement('div');
    card.className = 'daycard card';
    card.innerHTML = `
      <div class="muted">${new Date(date).toLocaleDateString(undefined,{weekday:'long'})}</div>
      <div class="icon" style="margin:6px 0">
        <img src="${meteoconURL(iconName)}" alt="${codeToDesc(code)}"/>
      </div>
      <div class="t">${max}°<small> / ${min}°</small></div>
      <small>${codeToDesc(code)}</small>
    `;
    wrap.appendChild(card);
  }
}

// ===== Update UI =====
async function updateAll(place){
  try{
    setLoading("Fetching weather...");
    const {lat, lon, name} = place;
    const [w, aq] = await Promise.all([fetchWeather(lat, lon), fetchAQI(lat, lon)]);
    if (!w?.current) throw new Error('No current weather in response');
    const c = w.current;

    // Visibility
    let visKm = null;
    if (w?.hourly?.time && Array.isArray(w?.hourly?.visibility)) {
      const idx = closestHourIdx(w.hourly.time, c.time);
      const v = w.hourly.visibility[idx];
      if (typeof v === 'number') visKm = v / 1000;
    }

    // AQI closest hour
    let aqiVal = null;
    if (aq?.hourly?.time && Array.isArray(aq?.hourly?.us_aqi)){
      const aqIdx = closestHourIdx(aq.hourly.time, c.time);
      aqiVal = aq.hourly.us_aqi[aqIdx] ?? null;
    }

    $('#place').textContent = name ?? '—';
    $('#nowTemp').textContent = Number.isFinite(c.temperature_2m) ? `${Math.round(c.temperature_2m)}°C` : '—';
    $('#feels').textContent = Number.isFinite(c.apparent_temperature) ? `${Math.round(c.apparent_temperature)}°C` : '—';
    $('#hum').textContent = Number.isFinite(c.relative_humidity_2m) ? `${Math.round(c.relative_humidity_2m)}%` : '—';
    $('#humText').textContent = Number.isFinite(c.relative_humidity_2m) ? humComfort(c.relative_humidity_2m) : '—';
    $('#press').textContent = Number.isFinite(c.pressure_msl) ? `${Math.round(c.pressure_msl)} mb` : '—';
    $('#vis').textContent = visKm != null ? `${visKm.toFixed(0)} km` : '—';
    $('#visText').textContent = visKm != null ? visText(visKm) : '—';
    $('#wind').textContent = Number.isFinite(c.wind_speed_10m) ? `${Math.round(c.wind_speed_10m)} km/h` : '—';
    $('#windText').textContent = Number.isFinite(c.wind_speed_10m) ? windText(c.wind_speed_10m) : '—';
    $('#nowDesc').textContent = codeToDesc(c.weather_code ?? 0);
    $('#nowDate').textContent = c.time ? fmtDateLong(c.time) : '—';
    $('#aqi').textContent = aqiVal != null ? `${aqiVal} AQI` : 'N/A';
    $('#aqiText').textContent = aqiText(aqiVal);

    const isDay = (c.is_day === 1 || c.is_day === true);
    setNowIcon(c.weather_code ?? 0, isDay, $('#nowIcon'));
    setTheme(c.weather_code ?? 0, isDay);

    if (w?.daily) setForecastIcons(w.daily, $('#forecast'));

    // ✅ Save last city
    if (name) localStorage.setItem("lastCity", name);
  }catch(err){
    console.error('[updateAll] failed:', err);
    $('#place').textContent = "⚠️ Error loading weather";
  }
}

// ===== Search + Startup =====
async function search(){
  const q = $('#q').value.trim();
  if (!q) return;
  setLoading(`Searching "${q}"...`);
  try {
    const p = await geocodeCity(q);
    updateAll(p);
  } catch(e){
    console.error('[search] geocode failed:', e);
    $('#place').textContent = "❌ City not found";
  }
}
$('#go').addEventListener('click', search);
$('#q').addEventListener('keydown', (e)=>{ if(e.key==='Enter') search(); });

// ===== Init: Last city > Location > Mumbai =====
(async function init(){
  try{
    setLoading("Detecting location...");
    const last = localStorage.getItem("lastCity");
    if (last) {
      const p = await geocodeCity(last);
      updateAll(p);
      return;
    }
    if (navigator.geolocation){
      navigator.geolocation.getCurrentPosition(async (pos)=>{
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const name = await reverseGeocode(lat, lon);
        updateAll({lat, lon, name});
      }, async (err)=>{
        console.warn('[geolocation] failed:', err);
        const p = await geocodeCity('Mumbai');
        updateAll(p);
      }, { timeout: 15000, enableHighAccuracy: true, maximumAge: 60000 });
    } else {
      const p = await geocodeCity('Mumbai');
      updateAll(p);
    }
  }catch(e){ console.error('[init] failed:', e); }
})();
