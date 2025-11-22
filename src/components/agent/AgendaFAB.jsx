import { useState, useEffect } from 'react';
import { Calendar, X, MapPin, Clock, User, FileText, Plus, Building2 } from 'lucide-react';
import { getProtectedData, postProtectedData } from '../../services/api';
import GooglePlacesAutocomplete from './GooglePlacesAutocomplete';

export default function AgendaFAB({ onVisitaCreated }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dealers, setDealers] = useState([]);
  const [filteredDealers, setFilteredDealers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visiteOggi, setVisiteOggi] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingDealers, setLoadingDealers] = useState(false);
  const [isNuovoPoint, setIsNuovoPoint] = useState(false); // Toggle affiliato/nuovo
  const [formData, setFormData] = useState({
    idDealer: '',
    ragioneSocialeDealer: '',
    dataVisita: new Date().toISOString().split('T')[0],
    oraInizio: new Date().toTimeString().slice(0, 5),
    durataMinuti: 60,
    referente: '',
    argomento: '',
    note: '',
    statoVisita: 'COMPLETATA' // Default: visita già effettuata
  });
  
  // Dati per nuovo point non affiliato
  const [nuovoPointData, setNuovoPointData] = useState({
    ragioneSociale: '',
    indirizzoCompleto: '',
    cap: '',
    citta: '',
    provincia: '',
    latitudine: null,
    longitudine: null,
    note: ''
  });

  useEffect(() => {
    loadDealers();
    loadVisiteOggi();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredDealers(dealers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredDealers(
        dealers.filter(d => 
          d.RagioneSociale?.toLowerCase().includes(query) ||
          d.Citta?.toLowerCase().includes(query) ||
          d.Provincia?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, dealers]);

  const loadDealers = async () => {
    setLoadingDealers(true);
    try {
      console.log('[AgendaFAB] Caricamento dealer...');
      const response = await getProtectedData('/agente/miei-dealer');
      console.log('[AgendaFAB] Response:', response);
      
      // L'endpoint restituisce { dealers: [...], idAgente: X }
      const dealersList = response?.dealers || [];
      console.log('[AgendaFAB] Dealer ricevuti:', dealersList);
      
      // Trasforma il formato per compatibilità
      const formattedDealers = dealersList.map(d => ({
        IDDealer: d.id,
        RagioneSociale: d.ragioneSociale,
        Citta: d.citta || '',
        Provincia: d.provincia || '',
        Indirizzo: d.indirizzo || ''
      }));
      
      setDealers(formattedDealers);
      setFilteredDealers(formattedDealers);
    } catch (err) {
      console.error('[AgendaFAB] Errore caricamento dealer:', err);
    } finally {
      setLoadingDealers(false);
    }
  };

  const loadVisiteOggi = async () => {
    try {
      const today = new Date();
      const data = await getProtectedData(`/agente/agenda/visite?month=${today.getMonth() + 1}&year=${today.getFullYear()}`);
      const oggi = data.filter(v => v.DataVisita === new Date().toISOString().split('T')[0]);
      setVisiteOggi(oggi || []);
    } catch (err) {
      console.error('Errore caricamento visite:', err);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setTimeout(() => setVisible(true), 10);
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => setOpen(false), 300);
  };

  const handleDealerChange = (e) => {
    const dealerId = e.target.value;
    const dealer = dealers.find(d => d.IDDealer === parseInt(dealerId));
    setFormData({
      ...formData,
      idDealer: dealerId,
      ragioneSocialeDealer: dealer?.RagioneSociale || ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validazione
    if (isNuovoPoint) {
      if (!nuovoPointData.ragioneSociale || !nuovoPointData.citta || !nuovoPointData.provincia) {
        alert('⚠️ Compila almeno: Ragione Sociale, Città e Provincia');
        return;
      }
    } else {
      if (!formData.idDealer) {
        alert('⚠️ Seleziona un point affiliato');
        return;
      }
    }
    
    setLoading(true);

    try {
      // Coordinate "puntuali" del luogo della visita
      let puntoLatitudine = isNuovoPoint ? nuovoPointData.latitudine : null;
      let puntoLongitudine = isNuovoPoint ? nuovoPointData.longitudine : null;

      // Coordinate del dispositivo al momento del salvataggio
      let dispositivoLatitudine = null;
      let dispositivoLongitudine = null;

      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          dispositivoLatitudine = position.coords.latitude;
          dispositivoLongitudine = position.coords.longitude;
        } catch (geoErr) {
          console.warn('Geolocalizzazione non disponibile:', geoErr);
        }
      }

      // Se stiamo creando un nuovo point e non abbiamo coordinate precise
      if (isNuovoPoint && (!puntoLatitudine || !puntoLongitudine) && dispositivoLatitudine && dispositivoLongitudine) {
        puntoLatitudine = dispositivoLatitudine;
        puntoLongitudine = dispositivoLongitudine;
      }

      // Prepara payload
      const payload = {
        ...formData,
        isNuovoPoint,
        nuovoPoint: isNuovoPoint ? nuovoPointData : null,
        latitudine: puntoLatitudine,
        longitudine: puntoLongitudine,
        latitudineDispositivo: dispositivoLatitudine,
        longitudineDispositivo: dispositivoLongitudine,
        statoVisita: formData.statoVisita
      };

      await postProtectedData('/agente/agenda/visite', payload);

      // Reset form
      setFormData({
        idDealer: '',
        ragioneSocialeDealer: '',
        dataVisita: new Date().toISOString().split('T')[0],
        oraInizio: new Date().toTimeString().slice(0, 5),
        durataMinuti: 60,
        referente: '',
        argomento: '',
        note: '',
        statoVisita: 'COMPLETATA'
      });
      
      setNuovoPointData({
        ragioneSociale: '',
        indirizzoCompleto: '',
        cap: '',
        citta: '',
        provincia: '',
        latitudine: null,
        longitudine: null,
        note: ''
      });
      
      setIsNuovoPoint(false);

      loadVisiteOggi();
      
      // Ricarica i dati nella pagina principale e passa la data della visita
      if (onVisitaCreated) {
        onVisitaCreated({
          dataVisita: formData.dataVisita,
          statoVisita: formData.statoVisita
        });
      }
      
      const messaggio = formData.statoVisita === 'PROGRAMMATA' 
        ? '✅ Appuntamento programmato con successo!' 
        : '✅ Visita registrata con successo!';
      alert(messaggio);
      handleClose();
    } catch (err) {
      console.error('Errore salvataggio visita:', err);
      alert('❌ Errore nel salvataggio della visita');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
        title="Registra Visita"
      >
        <Calendar className="w-6 h-6" />
        {visiteOggi.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {visiteOggi.length}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${
              visible ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={handleClose}
          />

          {/* Drawer Content */}
          <div
            className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
              visible ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700 text-white">
              <div className="flex items-center space-x-3">
                <Calendar className="w-6 h-6" />
                <div>
                  <h2 className="text-lg font-bold">Agenda Visite</h2>
                  <p className="text-sm text-blue-100">Registra o programma una visita</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Visite Oggi */}
              {visiteOggi.length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-900">
                      {visiteOggi.length} {visiteOggi.length === 1 ? 'visita' : 'visite'} oggi
                    </span>
                  </div>
                  <div className="space-y-2">
                    {visiteOggi.slice(0, 3).map(v => (
                      <div key={v.ID} className="text-xs text-blue-700">
                        • {v.RagioneSocialeDealer} - {v.OraInizio?.slice(0, 5)}
                      </div>
                    ))}
                  </div>
                  <a
                    href="/agente/agenda"
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-2 inline-block"
                  >
                    Vedi tutte →
                  </a>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Toggle Point Affiliato / Nuovo Point */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Tipo Point</span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsNuovoPoint(false)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        !isNuovoPoint
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <MapPin className="w-4 h-4 inline mr-1" />
                      Point Affiliato
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsNuovoPoint(true)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isNuovoPoint
                          ? 'bg-green-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Building2 className="w-4 h-4 inline mr-1" />
                      Nuovo Point
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {isNuovoPoint 
                      ? '🆕 Stai visitando un point non ancora affiliato' 
                      : '✅ Seleziona dalla tua scuderia'}
                  </p>
                </div>

                {/* Form Point Affiliato */}
                {!isNuovoPoint && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      Point Affiliato *
                    </label>
                    
                  {/* Campo Ricerca */}
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cerca per nome, città o provincia..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />

                  {/* Select Dealer */}
                  <select
                    required
                    value={formData.idDealer}
                    onChange={handleDealerChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loadingDealers}
                  >
                    <option value="">
                      {loadingDealers ? 'Caricamento...' : `Seleziona un point... (${filteredDealers.length} disponibili)`}
                    </option>
                    {filteredDealers.map(d => (
                      <option key={d.IDDealer} value={d.IDDealer}>
                        {d.RagioneSociale} - {d.Citta} ({d.Provincia})
                      </option>
                    ))}
                  </select>

                  {filteredDealers.length === 0 && !loadingDealers && dealers.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Nessun dealer trovato con "{searchQuery}"
                    </p>
                  )}

                  {dealers.length === 0 && !loadingDealers && (
                    <p className="text-xs text-red-500 mt-1">
                      ⚠️ Nessun dealer disponibile nella tua scuderia
                    </p>
                  )}
                  </div>
                )}

                {/* Form Nuovo Point */}
                {isNuovoPoint && (
                  <div className="space-y-3 bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Building2 className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold text-green-900">Dati Nuovo Point</h3>
                    </div>

                    {/* Ragione Sociale */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ragione Sociale *
                      </label>
                      <input
                        type="text"
                        required
                        value={nuovoPointData.ragioneSociale}
                        onChange={(e) => setNuovoPointData({ ...nuovoPointData, ragioneSociale: e.target.value })}
                        placeholder="Es: Bar Centrale di Rossi Mario"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>

                    {/* Indirizzo con Google Autocomplete */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Indirizzo Completo
                      </label>
                      <GooglePlacesAutocomplete
                        value={nuovoPointData.indirizzoCompleto}
                        onChange={(value) => setNuovoPointData({ ...nuovoPointData, indirizzoCompleto: value })}
                        onPlaceSelected={(place) => {
                          setNuovoPointData({
                            ...nuovoPointData,
                            indirizzoCompleto: place.indirizzoCompleto,
                            cap: place.cap,
                            citta: place.citta,
                            provincia: place.provincia,
                            latitudine: place.latitudine,
                            longitudine: place.longitudine
                          });
                        }}
                        placeholder="Cerca indirizzo su Google Maps..."
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        💡 Usa l'autocomplete per compilare automaticamente CAP, Città e Provincia
                      </p>
                    </div>

                    {/* CAP, Città, Provincia */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">CAP</label>
                        <input
                          type="text"
                          value={nuovoPointData.cap}
                          onChange={(e) => setNuovoPointData({ ...nuovoPointData, cap: e.target.value })}
                          placeholder="00100"
                          maxLength={5}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Città *</label>
                        <input
                          type="text"
                          required
                          value={nuovoPointData.citta}
                          onChange={(e) => setNuovoPointData({ ...nuovoPointData, citta: e.target.value })}
                          placeholder="Roma"
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">PR *</label>
                        <input
                          type="text"
                          required
                          value={nuovoPointData.provincia}
                          onChange={(e) => setNuovoPointData({ ...nuovoPointData, provincia: e.target.value.toUpperCase() })}
                          placeholder="RM"
                          maxLength={2}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500 uppercase"
                        />
                      </div>
                    </div>

                    {/* Note Point */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Note / Feedback Point
                      </label>
                      <textarea
                        value={nuovoPointData.note}
                        onChange={(e) => setNuovoPointData({ ...nuovoPointData, note: e.target.value })}
                        placeholder="Es: Interessato a partnership, contattare tra 2 settimane..."
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Tipo Visita */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo Visita *
                  </label>
                  <select
                    required
                    value={formData.statoVisita}
                    onChange={(e) => setFormData({ ...formData, statoVisita: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="COMPLETATA">✅ Visita già effettuata</option>
                    <option value="PROGRAMMATA">📅 Appuntamento da fare</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.statoVisita === 'PROGRAMMATA' 
                      ? 'Stai programmando un appuntamento futuro' 
                      : 'Stai registrando una visita già completata'}
                  </p>
                </div>

                {/* Data e Ora */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.dataVisita}
                      onChange={(e) => setFormData({ ...formData, dataVisita: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Clock className="w-4 h-4 inline mr-1" />
                      Ora *
                    </label>
                    <input
                      type="time"
                      required
                      value={formData.oraInizio}
                      onChange={(e) => setFormData({ ...formData, oraInizio: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Durata */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Durata *
                  </label>
                  <select
                    required
                    value={formData.durataMinuti}
                    onChange={(e) => setFormData({ ...formData, durataMinuti: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={15}>15 minuti</option>
                    <option value={30}>30 minuti</option>
                    <option value={45}>45 minuti</option>
                    <option value={60}>1 ora</option>
                    <option value={90}>1 ora e 30 min</option>
                    <option value={120}>2 ore</option>
                    <option value={180}>3 ore</option>
                    <option value={240}>4 ore+</option>
                  </select>
                </div>

                {/* Referente */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <User className="w-4 h-4 inline mr-1" />
                    Referente
                  </label>
                  <input
                    type="text"
                    value={formData.referente}
                    onChange={(e) => setFormData({ ...formData, referente: e.target.value })}
                    placeholder="Nome del referente..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Argomento */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Argomento
                  </label>
                  <input
                    type="text"
                    value={formData.argomento}
                    onChange={(e) => setFormData({ ...formData, argomento: e.target.value })}
                    placeholder="Es: Formazione prodotti, Supporto tecnico..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Note */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note
                  </label>
                  <textarea
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    placeholder="Note aggiuntive..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>

                {/* Buttons */}
                <div className="flex items-center space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {loading ? (
                      <span>Salvataggio...</span>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Registra</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
