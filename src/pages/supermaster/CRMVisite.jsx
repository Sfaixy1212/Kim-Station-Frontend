import { useState, useEffect, useMemo } from 'react';
import SuperMasterTopbar from '../../components/supermaster/Topbar';
import { getProtectedData, postProtectedData } from '../../services/api';
import { Calendar, MapPin, User, FileText, MessageSquare, Filter, Download, TrendingUp, Map as MapIcon, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, List, CalendarDays } from 'lucide-react';
import { ExternalLink } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix per icone Leaflet in Vite/React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Funzione helper per formattare l'ora
const formatTime = (timeValue) => {
  if (!timeValue) return '';
  
  // Se è già una stringa HH:mm, restituiscila
  if (typeof timeValue === 'string' && timeValue.includes(':')) {
    return timeValue.slice(0, 5);
  }
  
  // Se è un oggetto Date, estrai solo l'ora
  if (timeValue instanceof Date || typeof timeValue === 'object') {
    const date = new Date(timeValue);
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  
  return String(timeValue).slice(0, 5);
};

const formatPointLocation = (visita) => {
  if (!visita) return '';

  const chunks = [];
  if (visita.IndirizzoPoint) {
    chunks.push(visita.IndirizzoPoint.trim());
  }

  if (visita.CittaPoint || visita.ProvinciaPoint) {
    const city = (visita.CittaPoint || '').trim();
    const prov = (visita.ProvinciaPoint || '').trim();
    const cityProv = city && prov ? `${city} (${prov})` : city || prov;
    if (cityProv) {
      chunks.push(cityProv);
    }
  }

  if (visita.CapPoint) {
    chunks.push(`CAP ${String(visita.CapPoint).trim()}`);
  }

  return chunks.join(' - ');
};

const renderPointLocation = (visita) => {
  const location = formatPointLocation(visita);
  if (!location) return null;
  return (
    <div className="flex items-center space-x-2 text-xs md:text-sm text-gray-500 mt-1 truncate">
      <MapPin className="w-4 h-4" />
      <span className="truncate">{location}</span>
    </div>
  );
};

export default function CRMVisite() {
  const [visite, setVisite] = useState([]);
  const [statistiche, setStatistiche] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVisita, setSelectedVisita] = useState(null);
  const [showDettaglio, setShowDettaglio] = useState(false);
  
  // Filtri - inizialmente senza filtri per mostrare tutte le visite
  const [filtroAgente, setFiltroAgente] = useState('');
  const [filtroDealer, setFiltroDealer] = useState('');
  const [filtroMese, setFiltroMese] = useState('');
  const [filtroAnno, setFiltroAnno] = useState('');
  const [filtroStato, setFiltroStato] = useState('');
  const [filtroArgomento, setFiltroArgomento] = useState('');
  
  // Liste per i dropdown (caricate dal backend)
  const [agentiList, setAgentiList] = useState([]);
  const [dealersList, setDealersList] = useState([]);
  
  // Percorso giornaliero con km
  const [percorsoGiornaliero, setPercorsoGiornaliero] = useState(null);
  const [dataSelezionata, setDataSelezionata] = useState(null);
  const [mostraMappa, setMostraMappa] = useState(false);
  const [loadingPercorso, setLoadingPercorso] = useState(false);
  const [distanzeVisite, setDistanzeVisite] = useState({});
  
  // Vista calendario settimanale
  const [vistaCalendario, setVistaCalendario] = useState(true);
  const [settimanaCorrente, setSettimanaCorrente] = useState(new Date());

  useEffect(() => {
    loadData();
    // Reset percorso quando cambiano i filtri
    setPercorsoGiornaliero(null);
    setDataSelezionata(null);
    setMostraMappa(false);
  }, [filtroAgente, filtroDealer, filtroMese, filtroAnno, filtroStato, filtroArgomento]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroAgente) params.append('idAgente', filtroAgente);
      if (filtroDealer) params.append('idDealer', filtroDealer);
      if (filtroMese) params.append('month', filtroMese);
      if (filtroAnno) params.append('year', filtroAnno);
      if (filtroStato) params.append('stato', filtroStato);
      if (filtroArgomento) params.append('argomento', filtroArgomento);

      // Carica visite e statistiche
      const visiteData = await getProtectedData(`/supermaster/crm-visite?${params.toString()}`);
      setVisite(visiteData || []);
      
      // Estrai agenti e dealer unici dalle visite per popolare i dropdown
      if (visiteData && visiteData.length > 0) {
        const agentiSet = new Map();
        const dealersSet = new Map();
        
        visiteData.forEach(v => {
          if (v.IDAgente && v.NomeAgente) {
            agentiSet.set(v.IDAgente, v.NomeAgente);
          }
          if (v.IDDealer && v.RagioneSocialeDealer) {
            dealersSet.set(v.IDDealer, v.RagioneSocialeDealer);
          }
        });
        
        setAgentiList(Array.from(agentiSet, ([id, nome]) => ({ id, nome })));
        setDealersList(Array.from(dealersSet, ([id, nome]) => ({ id, nome })));
      }
      
      // Carica statistiche solo se ci sono filtri di periodo
      if (filtroMese && filtroAnno) {
        const statsData = await getProtectedData(`/supermaster/crm-visite/statistiche?month=${filtroMese}&year=${filtroAnno}`);
        setStatistiche(statsData || null);
      } else {
        setStatistiche(null);
      }
    } catch (err) {
      console.error('Errore caricamento dati CRM:', err);
    } finally {
      setLoading(false);
    }
  };


  const formatDuration = (minuti) => {
    const ore = Math.floor(minuti / 60);
    const min = minuti % 60;
    if (ore === 0) return `${min}min`;
    if (min === 0) return `${ore}h`;
    return `${ore}h ${min}min`;
  };

  const getColorByDuration = (minuti) => {
    if (minuti < 60) return 'bg-green-50 border-green-200 text-green-700';
    if (minuti <= 120) return 'bg-yellow-50 border-yellow-200 text-yellow-700';
    return 'bg-red-50 border-red-200 text-red-700';
  };

  const handleDettaglio = async (visita) => {
    try {
      const dettaglio = await getProtectedData(`/supermaster/crm-visite/${visita.ID}`);
      setSelectedVisita(dettaglio);
      setShowDettaglio(true);
    } catch (err) {
      console.error('Errore caricamento dettaglio:', err);
    }
  };

  const loadPercorso = async (idAgente, data) => {
    if (!idAgente || !data) return;
    
    setLoadingPercorso(true);
    try {
      const percorso = await getProtectedData(`/supermaster/crm-visite/percorso/${idAgente}?data=${data}`);
      setPercorsoGiornaliero(percorso);

      const nuoveDistanze = {};
      percorso?.percorso?.forEach(step => {
        if (step.tipo === 'VISITA' && step.visitaId) {
          nuoveDistanze[step.visitaId] = {
            kmDaPrecedente: step.kmDaPrecedente,
            kmProgressivi: step.kmProgressivi
          };
        }
      });
      setDistanzeVisite(nuoveDistanze);
    } catch (err) {
      console.error('Errore caricamento percorso:', err);
      setPercorsoGiornaliero(null);
      setDistanzeVisite({});
    } finally {
      setLoadingPercorso(false);
    }
  };

  // Calcola inizio e fine settimana
  const getWeekDays = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lunedì come primo giorno
    const monday = new Date(d.setDate(diff));
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    return days;
  };
  
  const weekDays = useMemo(() => getWeekDays(settimanaCorrente), [settimanaCorrente]);
  
  // Raggruppa visite per giorno
  const visitePerGiorno = useMemo(() => {
    const grouped = {};
    visite.forEach(v => {
      // Usa solo la parte data senza conversione timezone
      let data = v.DataVisita.split('T')[0];
      
      // Se la data è in formato ISO, è già corretta
      if (!grouped[data]) {
        grouped[data] = [];
      }
      grouped[data].push(v);
    });
    
    // Ordina le visite di ogni giorno per ora
    Object.keys(grouped).forEach(data => {
      grouped[data].sort((a, b) => {
        const oraA = a.OraInizio || '00:00';
        const oraB = b.OraInizio || '00:00';
        return oraA.localeCompare(oraB);
      });
    });
    
    return grouped;
  }, [visite]);
  
  // Visite per settimana corrente
  const visiteSettimana = useMemo(() => {
    const weekVisits = {};
    weekDays.forEach(day => {
      const dateStr = day.toISOString().split('T')[0];
      weekVisits[dateStr] = visitePerGiorno[dateStr] || [];
    });
    return weekVisits;
  }, [weekDays, visitePerGiorno]);
  
  const navigaSettimana = (direzione) => {
    const nuovaData = new Date(settimanaCorrente);
    nuovaData.setDate(nuovaData.getDate() + (direzione * 7));
    setSettimanaCorrente(nuovaData);
  };

  const handleExport = () => {
    if (visite.length === 0) {
      alert('Nessuna visita da esportare');
      return;
    }

    // Prepara i dati per l'export
    const csvData = visite.map(v => ({
      'Data': new Date(v.DataVisita).toLocaleDateString('it-IT'),
      'Ora': v.OraInizio?.slice(0, 5) || '',
      'Agente': v.NomeAgente || '',
      'Dealer': v.RagioneSocialeDealer || '',
      'Durata (min)': v.DurataMinuti || 0,
      'Referente': v.Referente || '',
      'Argomento': v.Argomento || '',
      'Stato': v.StatoVisita || '',
      'Note': v.Note || '',
      'Latitudine': v.Latitudine || '',
      'Longitudine': v.Longitudine || ''
    }));

    // Converti in CSV
    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(';'),
      ...csvData.map(row => headers.map(h => `"${row[h]}"`).join(';'))
    ].join('\n');

    // Crea e scarica il file
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const filename = `visite_crm_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperMasterTopbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🗺️ CRM Visite Agenti</h1>
            <p className="text-sm text-gray-600">Monitora e gestisci tutte le visite degli agenti ai dealer</p>
          </div>
          <button 
            onClick={handleExport}
            disabled={visite.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Esporta Report CSV</span>
          </button>
        </div>

        {/* Statistiche KPI */}
        {statistiche && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium">Visite Totali</p>
                  <p className="text-2xl font-bold text-blue-900">{statistiche.globali?.TotaleVisite || 0}</p>
                </div>
                <Calendar className="w-8 h-8 text-blue-600 opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-600 font-medium">Completate</p>
                  <p className="text-2xl font-bold text-green-900">{statistiche.globali?.VisiteCompletate || 0}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-600 opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-600 font-medium">Agenti Attivi</p>
                  <p className="text-2xl font-bold text-purple-900">{statistiche.globali?.AgentiAttivi || 0}</p>
                </div>
                <User className="w-8 h-8 text-purple-600 opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-orange-600 font-medium">Dealer Visitati</p>
                  <p className="text-2xl font-bold text-orange-900">{statistiche.globali?.DealerVisitati || 0}</p>
                </div>
                <MapPin className="w-8 h-8 text-orange-600 opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl p-4 border border-pink-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-pink-600 font-medium">Ore Totali</p>
                  <p className="text-2xl font-bold text-pink-900">
                    {Math.round((statistiche.globali?.MinutiTotali || 0) / 60)}h
                  </p>
                </div>
                <FileText className="w-8 h-8 text-pink-600 opacity-50" />
              </div>
            </div>
          </div>
        )}

        {/* Filtri */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-bold text-gray-900">Filtri</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agente</label>
              <select
                value={filtroAgente}
                onChange={(e) => setFiltroAgente(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tutti</option>
                {agentiList.map(a => (
                  <option key={a.id} value={a.id}>{a.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dealer</label>
              <select
                value={filtroDealer}
                onChange={(e) => setFiltroDealer(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tutti</option>
                {dealersList.map(d => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mese</label>
              <select
                value={filtroMese}
                onChange={(e) => setFiltroMese(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tutti</option>
                {['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'].map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anno</label>
              <select
                value={filtroAnno}
                onChange={(e) => setFiltroAnno(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tutti</option>
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
              <select
                value={filtroStato}
                onChange={(e) => setFiltroStato(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tutti</option>
                <option value="PROGRAMMATA">Programmata</option>
                <option value="COMPLETATA">Completata</option>
                <option value="ANNULLATA">Annullata</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Argomento</label>
              <input
                type="text"
                value={filtroArgomento}
                onChange={(e) => setFiltroArgomento(e.target.value)}
                placeholder="Cerca..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Toggle Vista Calendario / Lista */}
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setVistaCalendario(true)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                vistaCalendario 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>Vista Calendario</span>
            </button>
            <button
              onClick={() => setVistaCalendario(false)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                !vistaCalendario 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <List className="w-4 h-4" />
              <span>Vista Lista</span>
            </button>
          </div>
          
          {vistaCalendario && (
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigaSettimana(-1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Settimana precedente"
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <span className="text-sm font-medium text-gray-700">
                {weekDays[0]?.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} - {weekDays[6]?.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => navigaSettimana(1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Settimana successiva"
              >
                <ChevronRight className="w-5 h-5 text-gray-700" />
              </button>
              <button
                onClick={() => setSettimanaCorrente(new Date())}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Oggi
              </button>
            </div>
          )}
        </div>

        {/* Vista Calendario Settimanale */}
        {vistaCalendario ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-7 gap-3">
              {weekDays.map((day, idx) => {
                const dateStr = day.toISOString().split('T')[0];
                const visiteGiorno = visiteSettimana[dateStr] || [];
                const isToday = dateStr === new Date().toISOString().split('T')[0];
                const dayName = day.toLocaleDateString('it-IT', { weekday: 'short' });
                const dayNum = day.getDate();
                
                return (
                  <div key={idx} className={`flex flex-col border rounded-lg overflow-hidden ${isToday ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'}`}>
                    {/* Header giorno */}
                    <div className={`p-3 text-center ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-50'}`}>
                      <div className="text-xs font-medium uppercase">{dayName}</div>
                      <div className="text-2xl font-bold">{dayNum}</div>
                      {visiteGiorno.length > 0 && (
                        <div className={`text-xs mt-1 ${isToday ? 'text-blue-100' : 'text-gray-600'}`}>
                          {visiteGiorno.length} visit{visiteGiorno.length !== 1 ? 'e' : 'a'}
                        </div>
                      )}
                    </div>
                    
                    {/* Visite del giorno */}
                    <div className="flex-1 p-2 space-y-2 bg-gray-50 min-h-[300px] max-h-[500px] overflow-y-auto">
                      {visiteGiorno.length === 0 ? (
                        <div className="text-center text-xs text-gray-400 mt-4">Nessuna visita</div>
                      ) : (
                        visiteGiorno.map(visita => (
                          <div
                            key={visita.ID}
                            onClick={() => handleDettaglio(visita)}
                            className={`p-2 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                              visita.StatoVisita === 'COMPLETATA' 
                                ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                                : visita.StatoVisita === 'ANNULLATA'
                                ? 'bg-red-50 border-red-200 hover:bg-red-100'
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <span className="text-xs font-bold text-gray-900">
                                {formatTime(visita.OraInizio)}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                visita.StatoVisita === 'COMPLETATA' 
                                  ? 'bg-green-100 text-green-700' 
                                  : visita.StatoVisita === 'ANNULLATA'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {visita.StatoVisita === 'COMPLETATA' ? '✓' : visita.StatoVisita === 'ANNULLATA' ? '✗' : '○'}
                              </span>
                            </div>
                            <div className="text-xs font-medium text-gray-900 line-clamp-2 mb-1">
                              {visita.RagioneSocialeDealer}
                            </div>
                            {visita.CittaPoint && (
                              <div className="text-[10px] text-gray-600 flex items-center">
                                <MapPin className="w-3 h-3 mr-1" />
                                {visita.CittaPoint}
                              </div>
                            )}
                            {visita.NomeAgente && (
                              <div className="text-[10px] text-gray-500 mt-1">
                                👤 {visita.NomeAgente}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Lista Visite - Raggruppate per giorno se agente selezionato */
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                Visite ({visite.length})
                {filtroAgente && Object.keys(visitePerGiorno).length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-600">
                    • {Object.keys(visitePerGiorno).length} giorni
                  </span>
                )}
              </h2>
            </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Caricamento...</div>
          ) : visite.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Nessuna visita trovata</div>
          ) : filtroAgente ? (
            // Vista raggruppata per giorno (quando agente selezionato)
            <div className="divide-y divide-gray-200">
              {Object.keys(visitePerGiorno).sort().reverse().map(data => {
                const visiteGiorno = visitePerGiorno[data];
                // Parse della data senza timezone issues
                const [year, month, day] = data.split('-').map(Number);
                const dataObj = new Date(year, month - 1, day);
                
                return (
                  <div key={data} className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Calendar className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-bold text-gray-900">
                          {dataObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </h3>
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                          {visiteGiorno.length} {visiteGiorno.length === 1 ? 'visita' : 'visite'}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setDataSelezionata(data);
                          loadPercorso(filtroAgente, data);
                        }}
                        className="flex items-center space-x-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <MapPin className="w-4 h-4" />
                        <span>Calcola Percorso</span>
                      </button>
                    </div>

                    {/* Percorso con km (se caricato per questo giorno) */}
                    {percorsoGiornaliero && dataSelezionata === data && (
                      <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-green-900">📍 Percorso Giornaliero</h4>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setMostraMappa(!mostraMappa)}
                              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-green-300 rounded-lg hover:bg-green-50 transition-colors"
                            >
                              <MapIcon className="w-4 h-4" />
                              {mostraMappa ? 'Nascondi' : 'Mostra'} Mappa
                              {mostraMappa ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <span className="text-lg font-bold text-green-700">
                              {percorsoGiornaliero.kmTotali} km totali
                            </span>
                          </div>
                        </div>
                        
                        {/* Mappa interattiva */}
                        {mostraMappa && (
                          <div className="mb-4 rounded-lg overflow-hidden border border-green-300" style={{ height: '400px' }}>
                            <MapContainer
                              bounds={percorsoGiornaliero.percorso
                                .filter(t => t.latitudine && t.longitudine)
                                .map(t => [t.latitudine, t.longitudine])}
                              scrollWheelZoom={true}
                              style={{ height: '100%', width: '100%' }}
                            >
                              <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                              />
                              
                              {/* Polyline del percorso stradale (se disponibile) o linea retta */}
                              {percorsoGiornaliero.routeGeometry && percorsoGiornaliero.routeGeometry.length > 0 ? (
                                <Polyline
                                  positions={percorsoGiornaliero.routeGeometry.map(coord => [coord[1], coord[0]])}
                                  color="#16a34a"
                                  weight={4}
                                  opacity={0.8}
                                />
                              ) : (
                                <Polyline
                                  positions={percorsoGiornaliero.percorso
                                    .filter(t => t.latitudine && t.longitudine)
                                    .map(t => [t.latitudine, t.longitudine])}
                                  color="#16a34a"
                                  weight={3}
                                  opacity={0.7}
                                  dashArray="5, 10"
                                />
                              )}
                              
                              {/* Marker per ogni tappa */}
                              {percorsoGiornaliero.percorso.map((tappa, idx) => {
                                if (!tappa.latitudine || !tappa.longitudine) return null;
                                
                                return (
                                  <Marker
                                    key={idx}
                                    position={[tappa.latitudine, tappa.longitudine]}
                                  >
                                    <Popup>
                                      <div className="text-sm">
                                        <div className="font-bold text-green-700 mb-1">
                                          {idx}. {tappa.tipo === 'VISITA' ? (tappa.citta || tappa.descrizione) : tappa.descrizione}
                                        </div>
                                        {tappa.tipo === 'VISITA' && (
                                          <>
                                            {tappa.ragioneSociale && (
                                              <div className="text-gray-600 text-xs mb-1">{tappa.ragioneSociale}</div>
                                            )}
                                            {tappa.indirizzo && (
                                              <div className="text-gray-500 text-xs mb-1">{tappa.indirizzo}</div>
                                            )}
                                            {tappa.ora && (
                                              <div className="text-gray-600 text-xs">🕐 {tappa.ora}</div>
                                            )}
                                            {tappa.referente && (
                                              <div className="text-gray-600 text-xs">👤 {tappa.referente}</div>
                                            )}
                                          </>
                                        )}
                                        <div className="text-green-600 font-medium text-xs mt-1">
                                          {tappa.kmDaPrecedente > 0 && `+${tappa.kmDaPrecedente} km`}
                                        </div>
                                      </div>
                                    </Popup>
                                  </Marker>
                                );
                              })}
                            </MapContainer>
                          </div>
                        )}
                        <div className="space-y-2">
                          {percorsoGiornaliero.percorso.map((tappa, idx) => (
                            <div key={idx} className="flex items-center space-x-3 text-sm">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                                {idx}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">
                                  {tappa.tipo === 'VISITA' ? (
                                    <>
                                      {tappa.citta || tappa.descrizione}
                                      {tappa.ragioneSociale && tappa.citta && (
                                        <span className="text-gray-600 font-normal text-xs ml-2">
                                          → {tappa.ragioneSociale}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    tappa.descrizione
                                  )}
                                </p>
                                {tappa.tipo === 'VISITA' && tappa.indirizzo && (
                                  <p className="text-gray-500 text-xs mt-0.5">{tappa.indirizzo}</p>
                                )}
                                {tappa.ora && <p className="text-gray-600">🕐 {tappa.ora}</p>}
                                {tappa.warning && (
                                  <p className="text-orange-600 text-xs mt-1">⚠️ {tappa.warning}</p>
                                )}
                              </div>
                              <div className="text-right">
                                {tappa.kmDaPrecedente > 0 && (
                                  <p className="text-green-700 font-medium">+{tappa.kmDaPrecedente} km</p>
                                )}
                                <p className="text-gray-600 text-xs">{tappa.kmProgressivi} km tot</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lista visite del giorno */}
                    <div className="space-y-2">
                      {visiteGiorno.map(visita => (
                        <div
                          key={visita.ID}
                          onClick={() => handleDettaglio(visita)}
                          className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <span className="font-semibold text-gray-900">{visita.RagioneSocialeDealer}</span>
                              </div>
                              {renderPointLocation(visita)}

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div className="flex items-center space-x-2 text-gray-600">
                                  <FileText className="w-4 h-4" />
                                  <span>{formatTime(visita.OraInizio)} ({formatDuration(visita.DurataMinuti)})</span>
                                </div>
                                
                                {visita.Referente && (
                                  <div className="flex items-center space-x-2 text-gray-600">
                                    <User className="w-4 h-4" />
                                    <span>{visita.Referente}</span>
                                  </div>
                                )}
                                
                                {visita.NumCommenti > 0 && (
                                  <div className="flex items-center space-x-2 text-blue-600">
                                    <MessageSquare className="w-4 h-4" />
                                    <span>{visita.NumCommenti} commenti</span>
                                  </div>
                                )}
                              </div>
                              
                              {visita.Argomento && (
                                <div className="mt-2 text-sm text-gray-600">
                                  💬 {visita.Argomento}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex flex-col items-end space-y-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                visita.StatoVisita === 'COMPLETATA' 
                                  ? 'bg-green-100 text-green-700' 
                                  : visita.StatoVisita === 'ANNULLATA'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {visita.StatoVisita}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Vista lista normale (quando nessun agente selezionato)
            <div className="divide-y divide-gray-200">
              {visite.map(visita => (
                <div
                  key={visita.ID}
                  onClick={() => handleDettaglio(visita)}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="font-semibold text-gray-900">{visita.NomeAgente}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-gray-700">{visita.RagioneSocialeDealer}</span>
                      </div>
                      {renderPointLocation(visita)}
                      {distanzeVisite[visita.ID] && (
                        <div className="text-xs md:text-sm text-green-600 mt-1">
                          +{distanzeVisite[visita.ID].kmDaPrecedente} km • {distanzeVisite[visita.ID].kmProgressivi} km totali
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="flex items-center space-x-2 text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(visita.DataVisita).toLocaleDateString('it-IT')}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 text-gray-600">
                          <FileText className="w-4 h-4" />
                          <span>{formatTime(visita.OraInizio)} ({formatDuration(visita.DurataMinuti)})</span>
                        </div>
                        
                        {visita.Referente && (
                          <div className="flex items-center space-x-2 text-gray-600">
                            <User className="w-4 h-4" />
                            <span>{visita.Referente}</span>
                          </div>
                        )}
                        
                        {visita.NumCommenti > 0 && (
                          <div className="flex items-center space-x-2 text-blue-600">
                            <MessageSquare className="w-4 h-4" />
                            <span>{visita.NumCommenti} commenti</span>
                          </div>
                        )}
                      </div>
                      
                      {visita.Argomento && (
                        <div className="mt-2 text-sm text-gray-600">
                          💬 {visita.Argomento}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col items-end space-y-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        visita.StatoVisita === 'COMPLETATA' 
                          ? 'bg-green-100 text-green-700' 
                          : visita.StatoVisita === 'ANNULLATA'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {visita.StatoVisita}
                      </span>
                      
                      <span className={`px-2 py-1 rounded text-xs ${getColorByDuration(visita.DurataMinuti)}`}>
                        {formatDuration(visita.DurataMinuti)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        )}

        {/* Modale Dettaglio */}
        {showDettaglio && selectedVisita && (
          <DettaglioVisitaModal
            visita={selectedVisita}
            onClose={() => {
              setShowDettaglio(false);
              setSelectedVisita(null);
              loadData(); // Ricarica per aggiornare i commenti
            }}
          />
        )}
      </div>
    </div>
  );
}

// Modale Dettaglio Visita (placeholder)
function DettaglioVisitaModal({ visita, onClose }) {
  const [commento, setCommento] = useState('');
  const [tipoCommento, setTipoCommento] = useState('NOTA');
  const [loading, setLoading] = useState(false);

  const deviceLat = visita.visita.LatitudineDispositivo;
  const deviceLon = visita.visita.LongitudineDispositivo;
  const deviceLocationAvailable = deviceLat && deviceLon;
  const deviceMapUrl = deviceLocationAvailable
    ? `https://www.google.com/maps?q=${deviceLat},${deviceLon}`
    : null;

  const handleAggiungiCommento = async () => {
    if (!commento.trim()) return;
    
    setLoading(true);
    try {
      await postProtectedData(`/supermaster/crm-visite/${visita.visita.ID}/commenti`, {
        commento,
        tipoCommento
      });
      
      setCommento('');
      alert('Commento aggiunto con successo!');
      onClose(); // Chiude e ricarica
    } catch (err) {
      console.error('Errore aggiunta commento:', err);
      alert('Errore nell\'aggiunta del commento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 rounded-t-xl">
          <h2 className="text-xl font-bold">Dettaglio Visita</h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Info Visita */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Agente:</span>
              <p className="font-semibold">{visita.visita.NomeAgente}</p>
            </div>
            <div>
              <span className="text-gray-600">Dealer:</span>
              <p className="font-semibold">{visita.visita.RagioneSocialeDealer}</p>
            </div>
            <div>
              <span className="text-gray-600">Data:</span>
              <p className="font-semibold">{new Date(visita.visita.DataVisita).toLocaleDateString('it-IT')}</p>
            </div>
            <div>
              <span className="text-gray-600">Ora:</span>
              <p className="font-semibold">{formatTime(visita.visita.OraInizio)}</p>
            </div>
            {visita.visita.Referente && (
              <div>
                <span className="text-gray-600">Referente:</span>
                <p className="font-semibold">{visita.visita.Referente}</p>
              </div>
            )}
            {visita.visita.Argomento && (
              <div className="col-span-2">
                <span className="text-gray-600">Argomento:</span>
                <p className="font-semibold">{visita.visita.Argomento}</p>
              </div>
            )}
            {visita.visita.Note && (
              <div className="col-span-2">
                <span className="text-gray-600">Note:</span>
                <p className="text-gray-700">{visita.visita.Note}</p>
              </div>
            )}
          </div>

          {/* Posizione registrazione dispositivo */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <MapPin className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-semibold text-gray-900">Posizione registrazione dispositivo</span>
            </div>
            {deviceLocationAvailable ? (
              <div className="text-sm text-gray-700 space-y-1">
                <p>Latitudine: <span className="font-mono">{Number(deviceLat).toFixed(6)}</span></p>
                <p>Longitudine: <span className="font-mono">{Number(deviceLon).toFixed(6)}</span></p>
                <a
                  href={deviceMapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1 text-blue-600 hover:underline text-sm"
                >
                  <span>Apri su Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Posizione non registrata per questa visita.</p>
            )}
          </div>

          {/* Commenti Esistenti */}
          {visita.commenti && visita.commenti.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-3">Commenti ({visita.commenti.length})</h3>
              <div className="space-y-3">
                {visita.commenti.map(c => (
                  <div key={c.ID} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{c.NomeUtente}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        c.TipoCommento === 'REMINDER' ? 'bg-yellow-100 text-yellow-700' :
                        c.TipoCommento === 'FEEDBACK' ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {c.TipoCommento}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{c.Commento}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(c.CreatoIl).toLocaleString('it-IT')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aggiungi Commento */}
          <div>
            <h3 className="font-bold text-gray-900 mb-3">Aggiungi Commento</h3>
            <div className="space-y-3">
              <select
                value={tipoCommento}
                onChange={(e) => setTipoCommento(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="NOTA">Nota</option>
                <option value="REMINDER">Reminder</option>
                <option value="FEEDBACK">Feedback</option>
              </select>
              
              <textarea
                value={commento}
                onChange={(e) => setCommento(e.target.value)}
                placeholder="Scrivi un commento..."
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 resize-none"
              />
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Chiudi
                </button>
                <button
                  onClick={handleAggiungiCommento}
                  disabled={loading || !commento.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Salvataggio...' : 'Aggiungi Commento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
