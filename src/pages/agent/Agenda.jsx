import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { getProtectedData, putProtectedData, deleteProtectedData } from '../../services/api';
import { Calendar, Clock, MapPin, User, FileText, Edit2, Trash2, X, TrendingUp, BarChart3 } from 'lucide-react';
import AgendaFAB from '../../components/agent/AgendaFAB';

export default function AgendaPage() {
  const [visite, setVisite] = useState([]);
  const [statistiche, setStatistiche] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingVisit, setEditingVisit] = useState(null);

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [visiteData, statsData] = await Promise.all([
        getProtectedData(`/agente/agenda/visite?month=${selectedMonth}&year=${selectedYear}`),
        getProtectedData(`/agente/agenda/statistiche?month=${selectedMonth}&year=${selectedYear}`)
      ]);
      setVisite(visiteData || []);
      setStatistiche(statsData || null);
    } catch (err) {
      console.error('Errore caricamento dati:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Sei sicuro di voler eliminare questa visita?')) return;
    
    try {
      await deleteProtectedData(`/agente/agenda/visite/${id}`);
      loadData();
    } catch (err) {
      console.error('Errore eliminazione:', err);
      alert('Errore nell\'eliminazione della visita');
    }
  };

  const handleEdit = (visita) => {
    setEditingVisit(visita);
  };

  const handleSaveEdit = async (updatedData) => {
    try {
      await putProtectedData(`/agente/agenda/visite/${editingVisit.ID}`, updatedData);
      setEditingVisit(null);
      loadData();
    } catch (err) {
      console.error('Errore aggiornamento:', err);
      alert('Errore nell\'aggiornamento della visita');
    }
  };

  // Calendario: giorni del mese con visite
  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Giorni vuoti prima del primo giorno
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    // Giorni del mese
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const visiteGiorno = visite.filter(v => v.DataVisita === dateStr);
      days.push({
        day,
        date: dateStr,
        visite: visiteGiorno,
        isToday: dateStr === new Date().toISOString().split('T')[0]
      });
    }

    return days;
  }, [selectedYear, selectedMonth, visite]);

  const visiteGiornoSelezionato = useMemo(() => {
    return visite.filter(v => v.DataVisita === selectedDate).sort((a, b) => {
      return (a.OraInizio || '').localeCompare(b.OraInizio || '');
    });
  }, [visite, selectedDate]);

  const getColorByDuration = (minuti) => {
    if (minuti < 60) return 'bg-green-100 text-green-700 border-green-200';
    if (minuti <= 120) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-red-100 text-red-700 border-red-200';
  };

  const formatDuration = (minuti) => {
    const ore = Math.floor(minuti / 60);
    const min = minuti % 60;
    if (ore === 0) return `${min}min`;
    if (min === 0) return `${ore}h`;
    return `${ore}h ${min}min`;
  };

  const formatTimeValue = (value) => {
    if (!value) return 'N/D';
    if (typeof value === 'string') {
      const clean = value.trim();
      const hhmm = clean.match(/^(\d{2}):(\d{2})/);
      if (hhmm) {
        return `${hhmm[1]}:${hhmm[2]}`;
      }
      const parsed = new Date(clean);
      if (!isNaN(parsed)) {
        return parsed.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      const parsed = new Date(value);
      if (!isNaN(parsed)) {
        return parsed.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      }
    }
    return 'N/D';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📅 Agenda Visite</h1>
            <p className="text-sm text-gray-600">Gestisci le tue visite ai dealer</p>
          </div>
          
          {/* Selettore Mese/Anno */}
          <div className="flex items-center space-x-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              {['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Statistiche */}
        {statistiche && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium">Visite Totali</p>
                  <p className="text-2xl font-bold text-blue-900">{statistiche.statistiche?.TotaleVisite || 0}</p>
                </div>
                <Calendar className="w-8 h-8 text-blue-600 opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-600 font-medium">Completate</p>
                  <p className="text-2xl font-bold text-green-900">{statistiche.statistiche?.VisiteCompletate || 0}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-600 opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-600 font-medium">Dealer Visitati</p>
                  <p className="text-2xl font-bold text-purple-900">{statistiche.statistiche?.DealerVisitati || 0}</p>
                </div>
                <MapPin className="w-8 h-8 text-purple-600 opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-orange-600 font-medium">Ore Totali</p>
                  <p className="text-2xl font-bold text-orange-900">
                    {Math.round((statistiche.statistiche?.MinutiTotali || 0) / 60)}h
                  </p>
                </div>
                <Clock className="w-8 h-8 text-orange-600 opacity-50" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl p-4 border border-pink-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-pink-600 font-medium">Programmate</p>
                  <p className="text-2xl font-bold text-pink-900">{statistiche.statistiche?.VisiteProgrammate || 0}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-pink-600 opacity-50" />
              </div>
            </div>
          </div>
        )}

        {/* Layout Principale */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendario */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Calendario</h2>
              
              {/* Giorni settimana */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'].map(day => (
                  <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Giorni mese */}
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((dayData, idx) => {
                  if (!dayData) {
                    return <div key={`empty-${idx}`} className="aspect-square" />;
                  }

                  const isSelected = dayData.date === selectedDate;
                  const hasVisite = dayData.visite.length > 0;

                  return (
                    <button
                      key={dayData.date}
                      onClick={() => setSelectedDate(dayData.date)}
                      className={`aspect-square rounded-lg border-2 transition-all relative ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : dayData.isToday
                          ? 'border-blue-300 bg-blue-50/50'
                          : hasVisite
                          ? 'border-green-200 bg-green-50 hover:border-green-300'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">{dayData.day}</div>
                      {hasVisite && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                        </div>
                      )}
                      {dayData.visite.length > 1 && (
                        <div className="absolute top-1 right-1 text-[10px] bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                          {dayData.visite.length}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Lista Visite Giorno Selezionato */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                Visite del {new Date(selectedDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
              </h2>

              {loading ? (
                <div className="text-sm text-gray-500">Caricamento...</div>
              ) : visiteGiornoSelezionato.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-8">
                  Nessuna visita programmata
                </div>
              ) : (
                <div className="space-y-3">
                  {visiteGiornoSelezionato.map(visita => (
                    <div
                      key={visita.ID}
                      className={`border-2 rounded-lg p-3 ${getColorByDuration(visita.DurataMinuti)}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1 text-xs text-gray-600">
                            <Clock className="w-4 h-4" />
                            <span className="font-semibold text-sm text-gray-900">
                              {formatTimeValue(visita.OraInizio)}
                            </span>
                            <span>({formatDuration(visita.DurataMinuti)})</span>
                            <span className="text-[11px] text-gray-500">
                              {new Date(visita.DataVisita).toLocaleDateString('it-IT', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs mb-1">
                            <MapPin className="w-3 h-3" />
                            <span className="font-medium">{visita.RagioneSocialeDealer}</span>
                          </div>
                          {visita.Referente && (
                            <div className="flex items-center space-x-2 text-xs mb-1">
                              <User className="w-3 h-3" />
                              <span>{visita.Referente}</span>
                            </div>
                          )}
                          {visita.Argomento && (
                            <div className="flex items-center space-x-2 text-xs">
                              <FileText className="w-3 h-3" />
                              <span>{visita.Argomento}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleEdit(visita)}
                            className="p-1 hover:bg-white/50 rounded transition-colors"
                            title="Modifica"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(visita.ID)}
                            className="p-1 hover:bg-white/50 rounded transition-colors"
                            title="Elimina"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {visita.Note && (
                        <div className="text-xs mt-2 pt-2 border-t border-current/20">
                          {visita.Note}
                        </div>
                      )}
                      <div className="mt-2 pt-2 border-t border-current/20">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          visita.StatoVisita === 'COMPLETATA' 
                            ? 'bg-green-200 text-green-800' 
                            : 'bg-yellow-200 text-yellow-800'
                        }`}>
                          {visita.StatoVisita}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top Dealer e Argomenti */}
        {statistiche && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Dealer */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">🏆 Top Dealer Visitati</h2>
              {statistiche.topDealers?.length > 0 ? (
                <div className="space-y-3">
                  {statistiche.topDealers.map((dealer, idx) => (
                    <div key={dealer.IDDealer} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-medium text-sm text-gray-900">{dealer.RagioneSocialeDealer}</div>
                          <div className="text-xs text-gray-500">{formatDuration(dealer.MinutiTotali || 0)} totali</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-blue-600">{dealer.NumVisite}</div>
                        <div className="text-xs text-gray-500">visite</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-8">Nessun dato disponibile</div>
              )}
            </div>

            {/* Top Argomenti */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">💬 Argomenti Più Trattati</h2>
              {statistiche.topArgomenti?.length > 0 ? (
                <div className="space-y-3">
                  {statistiche.topArgomenti.map((arg, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold text-sm">
                          {idx + 1}
                        </div>
                        <div className="font-medium text-sm text-gray-900">{arg.Argomento}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-purple-600">{arg.NumVisite}</div>
                        <div className="text-xs text-gray-500">volte</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-8">Nessun dato disponibile</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Modifica (opzionale - da implementare se necessario) */}
      {editingVisit && (
        <EditVisitModal
          visita={editingVisit}
          onClose={() => setEditingVisit(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* FAB per inserimento rapido visite */}
      <AgendaFAB 
        onVisitaCreated={(visitaData) => {
          // Se viene passata la data della visita, aggiorna il mese visualizzato
          if (visitaData?.dataVisita) {
            const date = new Date(visitaData.dataVisita);
            setSelectedMonth(date.getMonth() + 1);
            setSelectedYear(date.getFullYear());
            setSelectedDate(visitaData.dataVisita);
          }
          // Ricarica i dati (loadData verrà chiamato automaticamente dal useEffect)
        }} 
      />
    </DashboardLayout>
  );
}

// Modal Modifica Visita (componente semplificato)
function EditVisitModal({ visita, onClose, onSave }) {
  const [formData, setFormData] = useState({
    dataVisita: visita.DataVisita,
    oraInizio: visita.OraInizio?.slice(0, 5),
    durataMinuti: visita.DurataMinuti,
    referente: visita.Referente || '',
    argomento: visita.Argomento || '',
    note: visita.Note || '',
    statoVisita: visita.StatoVisita
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 m-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Modifica Visita</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input
                type="date"
                value={formData.dataVisita}
                onChange={(e) => setFormData({ ...formData, dataVisita: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ora</label>
              <input
                type="time"
                value={formData.oraInizio}
                onChange={(e) => setFormData({ ...formData, oraInizio: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Durata</label>
            <select
              value={formData.durataMinuti}
              onChange={(e) => setFormData({ ...formData, durataMinuti: parseInt(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value={15}>15 minuti</option>
              <option value={30}>30 minuti</option>
              <option value={45}>45 minuti</option>
              <option value={60}>1 ora</option>
              <option value={90}>1 ora e 30 min</option>
              <option value={120}>2 ore</option>
              <option value={180}>3 ore</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Referente</label>
            <input
              type="text"
              value={formData.referente}
              onChange={(e) => setFormData({ ...formData, referente: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Argomento</label>
            <input
              type="text"
              value={formData.argomento}
              onChange={(e) => setFormData({ ...formData, argomento: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
            <select
              value={formData.statoVisita}
              onChange={(e) => setFormData({ ...formData, statoVisita: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="PROGRAMMATA">Programmata</option>
              <option value="COMPLETATA">Completata</option>
              <option value="ANNULLATA">Annullata</option>
            </select>
          </div>

          <div className="flex items-center space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
