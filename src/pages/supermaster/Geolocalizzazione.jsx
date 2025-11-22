import { useEffect, useState } from 'react';
import Card from '../../components/common/Card';
import { NavLink } from 'react-router-dom';
import SuperMasterTopbar from '../../components/supermaster/Topbar';
import { getProtectedData } from '../../services/api';

export default function Geolocalizzazione() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadStatus, setLoadStatus] = useState({ step: 0, msg: 'Caricamento…', progress: 5 });
  const mapContainerId = 'sm-map-container';

  // Helper: load external script once
  const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true; s.defer = true;
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  // Normalize lat/lng field names
  const pickLatLng = (d) => {
    const lat = d.lat ?? d.latitude ?? d.Latitude ?? d.Latitudine ?? d.Lat;
    const lng = d.lng ?? d.longitude ?? d.Longitude ?? d.Longitudine ?? d.Lng;
    if (lat == null || lng == null) return null;
    const nlat = Number(lat), nlng = Number(lng);
    if (Number.isFinite(nlat) && Number.isFinite(nlng)) return { lat: nlat, lng: nlng };
    return null;
  };

  // Build address from dealer fields
  const buildAddress = (d) => {
    const parts = [d.Indirizzo || d.indirizzo, d.CAP || d.cap, d.Citta || d.Città || d.citta, d.Provincia || d.provincia, 'Italia']
      .filter(Boolean)
      .map(x => String(x).trim())
      .filter(Boolean);
    return parts.join(', ');
  };

  // Local geocode cache
  const CACHE_KEY = 'supermaster_geocode_cache_v1';
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni
  const readCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
  };
  const writeCache = (obj) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {}
  };
  const getGeocodeFromCache = (address) => {
    if (!address) return null;
    const cache = readCache();
    const item = cache[address];
    if (!item) return null;
    if (Date.now() - (item.ts || 0) > CACHE_TTL_MS) return null;
    return { lat: item.lat, lng: item.lng };
  };
  const setGeocodeInCache = (address, latLng) => {
    if (!address || !latLng) return;
    const cache = readCache();
    cache[address] = { lat: latLng.lat, lng: latLng.lng, ts: Date.now() };
    writeCache(cache);
  };

  // Geocode with backoff
  const geocodeWithBackoff = async (geocoder, address) => {
    const MAX_RETRY = 4;
    const delays = [150, 300, 600, 1200];
    for (let i = 0; i < MAX_RETRY; i++) {
      try {
        const res = await geocoder.geocode({ address });
        const r = res?.results?.[0]?.geometry?.location;
        if (r) return { lat: r.lat(), lng: r.lng() };
      } catch (e) {
        const msg = (e && e.message) || '';
        if (!/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED/i.test(msg) && i === MAX_RETRY - 1) throw e;
      }
      await new Promise(r => setTimeout(r, delays[i]));
    }
    return null;
  };

  // HQ distance (Haversine)
  const computeDistanceKm = (a, b) => {
    const lat1 = a.lat, lng1 = a.lng, lat2 = b.lat, lng2 = b.lng;
    const R = 6371, toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lng2 - lng1);
    const s1 = Math.sin(dLat/2), s2 = Math.sin(dLon/2);
    const A = s1*s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2*s2;
    const c = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
    return R * c;
  };

  // SVG pin
  const makePinSvg = (color = '#2563eb') => ({
    url: `data:image/svg+xml;utf-8,${encodeURIComponent(`<?xml version="1.0" ?><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5"><path d="M12 22s8-4.5 8-12a8 8 0 1 0-16 0c0 7.5 8 12 8 12z" fill="${color}" stroke="${color}"/></svg>`)}`,
    scaledSize: new window.google.maps.Size(32, 32),
    anchor: new window.google.maps.Point(16, 30),
  });

  // InfoWindow content
  const buildDealerInfo = (d, distKm) => {
    const rows = [];
    const push = (label, value) => {
      if (value == null || value === '' || value === 'NULL') return;
      rows.push(`<div><span style="color:#64748b">${label}:</span> <strong style="color:#111827">${String(value)}</strong></div>`);
    };
    push('Ragione Sociale', d.RagioneSociale || d.ragioneSociale || d.Dealer || d.NomeDealer || d.dealer);
    push('Cellulare', d.RecapitoCell || d.cell || d.Cell || d.RecapitoCellulare);
    push('StationCode', d.StationCode || d.stationCode);
    push('COMSY1', d.COMSY1);
    push('COMSY2', d.COMSY2);
    push('Agente', d.Agente || d.agente || d.NOME_AGENTE || d.nomeAgente);
    if (typeof distKm === 'number') {
      const distStr = distKm < 10 ? distKm.toFixed(2) : distKm.toFixed(1);
      rows.push(`<div><span style=\"color:#64748b\">Distanza</span>: <strong style=\"color:#111827\">${distStr} km da KIM srls</strong></div>`);
    }
    const title = d.RagioneSociale || d.Dealer || d.NomeDealer || 'Dealer';
    return `
      <div style="font-size:12px; line-height:1.3; max-width:260px">
        <div style="font-weight:600; color:#111827; margin-bottom:4px">${title}</div>
        ${rows.join('')}
      </div>
    `;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setLoadStatus({ step: 1, msg: 'Caricamento…', progress: 10 });
        // 1) Fetch API key and map id
        const cfg = await getProtectedData('/config/maps-key');
        if (!mounted) return;
        setLoadStatus({ step: 2, msg: 'Sto preparando la mappa…', progress: 20 });
        const apiKey = cfg?.apiKey || cfg?.key;
        const mapId = cfg?.mapId || undefined;
        if (!apiKey) throw new Error('API key Google Maps non configurata');

        // 2) Load Google Maps JS API (v=weekly)
        await loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`);
        // Marker Clusterer
        await loadScript('https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js');
        if (!mounted) return;
        setLoadStatus({ step: 3, msg: 'Sto caricando i dealers…', progress: 35 });

        // 3) Create container if not exists
        let container = document.getElementById(mapContainerId);
        if (!container) {
          container = document.createElement('div');
          container.id = mapContainerId;
          container.style.width = '100%';
          container.style.height = '70vh';
          const holder = document.getElementById(`${mapContainerId}-holder`);
          if (holder) holder.appendChild(container);
        }

        // 4) Fetch dealers locations
        const dealers = await getProtectedData('/dealers/locations');
        if (!mounted) return;
        setLoadStatus({ step: 4, msg: 'Sto posizionando i dealers sulla mappa…', progress: 45 });
        const geocoder = new window.google.maps.Geocoder();
        // HQ
        const HQ_ADDR = 'Via Appia 324, 72100 Brindisi, Italia';
        let hq = getGeocodeFromCache(HQ_ADDR);
        if (!hq) {
          const r = await geocodeWithBackoff(geocoder, HQ_ADDR);
          if (r) { hq = r; setGeocodeInCache(HQ_ADDR, r); }
        }

        // Prepare points with fallback to geocode
        const points = [];
        const list = Array.isArray(dealers) ? dealers : [];
        const total = list.length || 1;
        let processed = 0;
        for (const d of list) {
          let ll = pickLatLng(d);
          if (!ll) {
            const addr = buildAddress(d);
            if (addr) {
              ll = getGeocodeFromCache(addr) || await geocodeWithBackoff(geocoder, addr);
              if (ll) setGeocodeInCache(addr, ll);
            }
          }
          if (ll) points.push({ d, ll });
          processed += 1;
          if (mounted && processed % 3 === 0) {
            const frac = Math.min(processed / total, 1);
            const prog = Math.floor(45 + frac * 40);
            setLoadStatus(s => ({ ...s, progress: prog }));
          }
        }

        // 5) Init map
        const center = points[0]?.ll || { lat: 41.1171, lng: 16.8719 }; // default Bari
        const map = new window.google.maps.Map(container, {
          center,
          zoom: 6,
          mapId,
        });
        if (mounted) setLoadStatus({ step: 5, msg: 'Quasi pronto…', progress: 90 });

        // 6) Add markers + cluster + HQ marker
        const bounds = new window.google.maps.LatLngBounds();
        const sharedInfoWindow = new window.google.maps.InfoWindow();
        let pinnedMarker = null;
        let hoverOpenTimer = null;
        let hoverCloseTimer = null;
        const openInfo = (marker, html) => {
          try { sharedInfoWindow.setContent(html); } catch {}
          sharedInfoWindow.open({ anchor: marker, map });
        };
        const closeInfo = () => { try { sharedInfoWindow.close(); } catch {} };
        map.addListener('click', () => { pinnedMarker = null; closeInfo(); });

        const markers = points.map(({ d, ll }) => {
          const hasComsy = !!(d.COMSY || d.Comsy || d.comsy || d.COMSY1 || d.COMSY2);
          const icon = makePinSvg(hasComsy ? '#f97316' : '#2563eb');
          const m = new window.google.maps.Marker({ position: ll, icon });
          const dist = hq ? computeDistanceKm(ll, hq) : null;
          const html = buildDealerInfo(d, dist);
          m.addListener('mouseover', () => {
            if (pinnedMarker && pinnedMarker !== m) return;
            if (hoverCloseTimer) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null; }
            hoverOpenTimer = setTimeout(() => openInfo(m, html), 120);
          });
          m.addListener('mouseout', () => {
            if (pinnedMarker === m) return;
            if (hoverOpenTimer) { clearTimeout(hoverOpenTimer); hoverOpenTimer = null; }
            hoverCloseTimer = setTimeout(() => closeInfo(), 200);
          });
          m.addListener('click', () => {
            if (pinnedMarker === m) { pinnedMarker = null; closeInfo(); }
            else { pinnedMarker = m; openInfo(m, html); }
          });
          bounds.extend(ll);
          return m;
        });

        if (hq) {
          const hqm = new window.google.maps.Marker({ position: hq, map, title: 'HQ • KIM srls', icon: makePinSvg('#16a34a') });
          bounds.extend(hq);
        }

        try {
          const MC = window.markerClusterer?.MarkerClusterer || window.MarkerClusterer;
          if (MC) new MC({ map, markers });
          else markers.forEach(m => m.setMap(map));
        } catch { markers.forEach(m => m.setMap(map)); }

        if (!bounds.isEmpty && (typeof bounds.isEmpty !== 'function' || !bounds.isEmpty())) {
          map.fitBounds(bounds);
        }

        if (!mounted) return;
        setError(points.length ? '' : 'Nessun dealer con coordinate disponibili.');
        setLoadStatus({ step: 6, msg: 'Fatto!', progress: 100 });
      } catch (e) {
        console.error('[SuperMaster][Geo] Errore mappa:', e);
        if (mounted) setError(e.message || 'Errore nella mappa');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <SuperMasterTopbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Geolocalizzazione Dealer</h1>
          <NavLink to="/supermaster" className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Torna a SuperMaster</NavLink>
        </div>

        <Card title="Mappa" subtitle="Dealer su Google Maps (cluster, info e distanza da HQ)">
          {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
          {loading && (
            <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
              <span>{loadStatus.msg}</span>
              <div className="w-40 h-2 bg-gray-200 rounded overflow-hidden">
                <div className="h-2 bg-blue-600 transition-all duration-300" style={{ width: `${Math.min(loadStatus.progress, 100)}%` }} />
              </div>
            </div>
          )}
          <div id={`${mapContainerId}-holder`} className="bg-white border border-gray-200 rounded-lg shadow-sm p-2">
            {!loading && <div className="text-xs text-gray-400 px-2 pb-2">Mappa interattiva</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
