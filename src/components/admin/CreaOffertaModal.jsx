import { useState, useEffect } from 'react';
import { getProtectedData, postProtectedData } from '../../services/api';
import toast from 'react-hot-toast';

export default function CreaOffertaModal({ isOpen, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('base'); // 'base' | 'pricing' | 'sim' | 'avanzate'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Dati per dropdown
  const [operatori, setOperatori] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [valoriDropdown, setValoriDropdown] = useState({
    tipoOfferta: [],
    segmento: [],
    tipo: [],
    simType: []
  });

  // Form data
  const [formData, setFormData] = useState({
    // Info Base
    idOperatore: '',
    Titolo: '',
    DescrizioneBreve: '',
    Descrizione: '',
    Tipo: '',
    Segmento: '',
    tipoOfferta: '',
    ValidaDal: '',
    ValidaAl: '',
    TemplateDatiOfferta: '',
    
    // Pricing
    Crediti: 0,
    SpeseSpedizione: 0,
    FixedDiscountPct: 0,
    
    // SIM
    SIMTYPE: '',
    SIMCOUNT: 1,
    LimiteSIM: 0,
    
    // Avanzate
    LogoLink: '',
    FullLink: '',
    isConvergenza: false,
    IDOffertaCollegata: 0,
    Offerta_Inviata: false,
    OnlyFor: '',
    RequireCode: false,
    CodePrefix: '',
    CodeLen: null
  });

  // Carica dati iniziali
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [operatoriData, templatesData, valoriData] = await Promise.all([
        getProtectedData('/admin/operatori'),
        getProtectedData('/admin/templates'),
        getProtectedData('/admin/offerte/valori-dropdown')
      ]);
      
      setOperatori(operatoriData || []);
      setTemplates(templatesData || []);
      setValoriDropdown(valoriData || { tipoOfferta: [], segmento: [], tipo: [], simType: [] });
      
      // Imposta valori di default
      if (operatoriData && operatoriData.length > 0) {
        setFormData(prev => ({ ...prev, idOperatore: operatoriData[0].IDOperatore }));
      }
    } catch (e) {
      console.error('[LOAD INITIAL DATA][ERR]', e);
      toast.error('Errore caricamento dati iniziali');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Validazioni
    if (!formData.idOperatore || !formData.Titolo || !formData.DescrizioneBreve || !formData.Tipo || 
        !formData.Segmento || !formData.tipoOfferta || !formData.ValidaDal || !formData.ValidaAl || 
        !formData.TemplateDatiOfferta) {
      toast.error('Compila tutti i campi obbligatori');
      return;
    }

    if (new Date(formData.ValidaDal) > new Date(formData.ValidaAl)) {
      toast.error('Data "Valida Dal" deve essere precedente a "Valida Al"');
      return;
    }

    setSaving(true);
    const loadingId = toast.loading('Creazione offerta in corso...');
    
    try {
      // Converti crediti da euro a centesimi prima di inviare
      const dataToSend = {
        ...formData,
        Crediti: Math.round(formData.Crediti * 100),
        SpeseSpedizione: Math.round(formData.SpeseSpedizione * 100)
      };
      await postProtectedData('/admin/offerte', dataToSend);
      toast.success('Offerta creata con successo!');
      onSuccess();
      onClose();
      resetForm();
    } catch (e) {
      console.error('[CREATE OFFERTA][ERR]', e);
      toast.error(e?.message || 'Errore durante la creazione');
    } finally {
      toast.dismiss(loadingId);
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      idOperatore: operatori[0]?.IDOperatore || '',
      Titolo: '',
      DescrizioneBreve: '',
      Descrizione: '',
      Tipo: '',
      Segmento: '',
      tipoOfferta: '',
      ValidaDal: '',
      ValidaAl: '',
      TemplateDatiOfferta: '',
      Crediti: 0,
      SpeseSpedizione: 0,
      FixedDiscountPct: 0,
      SIMTYPE: '',
      SIMCOUNT: 1,
      LimiteSIM: 0,
      LogoLink: '',
      FullLink: '',
      isConvergenza: false,
      IDOffertaCollegata: 0,
      Offerta_Inviata: false,
      OnlyFor: '',
      RequireCode: false,
      CodePrefix: '',
      CodeLen: null
    });
    setActiveTab('base');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose}></div>
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Crea Nuova Offerta
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex -mb-px px-6">
              {[
                { id: 'base', label: 'Info Base' },
                { id: 'pricing', label: 'Pricing' },
                { id: 'sim', label: 'SIM' },
                { id: 'avanzate', label: 'Avanzate' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-red-600 text-red-600 dark:text-red-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Caricamento...</p>
              </div>
            ) : (
              <>
                {/* TAB 1: Info Base */}
                {activeTab === 'base' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Operatore */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Operatore <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.idOperatore}
                          onChange={(e) => handleChange('idOperatore', parseInt(e.target.value))}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        >
                          {operatori.map(op => (
                            <option key={op.IDOperatore} value={op.IDOperatore}>{op.Denominazione}</option>
                          ))}
                        </select>
                      </div>

                      {/* Tipo */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Tipo <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.Tipo}
                          onChange={(e) => handleChange('Tipo', e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">Seleziona...</option>
                          {valoriDropdown.tipo.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Titolo */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Titolo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.Titolo}
                        onChange={(e) => handleChange('Titolo', e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        maxLength={200}
                      />
                    </div>

                    {/* Descrizione Breve */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Descrizione Breve <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={formData.DescrizioneBreve}
                        onChange={(e) => handleChange('DescrizioneBreve', e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        rows={3}
                        maxLength={500}
                      />
                    </div>

                    {/* Descrizione Completa */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Descrizione Completa
                      </label>
                      <textarea
                        value={formData.Descrizione}
                        onChange={(e) => handleChange('Descrizione', e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        rows={4}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Segmento */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Segmento <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.Segmento}
                          onChange={(e) => handleChange('Segmento', e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">Seleziona...</option>
                          {valoriDropdown.segmento.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* Tipo Offerta */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Tipo Offerta <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.tipoOfferta}
                          onChange={(e) => handleChange('tipoOfferta', e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">Seleziona...</option>
                          {valoriDropdown.tipoOfferta.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Valida Dal */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Valida Dal <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={formData.ValidaDal}
                          onChange={(e) => handleChange('ValidaDal', e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        />
                      </div>

                      {/* Valida Al */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Valida Al <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={formData.ValidaAl}
                          onChange={(e) => handleChange('ValidaAl', e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    {/* Template */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Template Dati Offerta <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.TemplateDatiOfferta}
                        onChange={(e) => handleChange('TemplateDatiOfferta', e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="">Seleziona template...</option>
                        {templates.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* TAB 2: Pricing */}
                {activeTab === 'pricing' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Crediti */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Crediti (€)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.Crediti}
                          onChange={(e) => handleChange('Crediti', parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                          placeholder="Es: 7.00 per 7 euro"
                        />
                      </div>

                      {/* Spese Spedizione */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Spese Spedizione (€)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.SpeseSpedizione}
                          onChange={(e) => handleChange('SpeseSpedizione', parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        />
                      </div>

                      {/* Sconto Fisso % */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Sconto Fisso (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.FixedDiscountPct}
                          onChange={(e) => handleChange('FixedDiscountPct', parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: SIM */}
                {activeTab === 'sim' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* SIM Type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Tipo SIM
                        </label>
                        <select
                          value={formData.SIMTYPE}
                          onChange={(e) => handleChange('SIMTYPE', e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">Seleziona...</option>
                          {valoriDropdown.simType.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* SIM Count */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Numero SIM
                        </label>
                        <input
                          type="number"
                          value={formData.SIMCOUNT}
                          onChange={(e) => handleChange('SIMCOUNT', parseInt(e.target.value) || 1)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        />
                      </div>

                      {/* Limite SIM */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Limite SIM
                        </label>
                        <input
                          type="number"
                          value={formData.LimiteSIM}
                          onChange={(e) => handleChange('LimiteSIM', parseInt(e.target.value) || 0)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: Avanzate */}
                {activeTab === 'avanzate' && (
                  <div className="space-y-4">
                    {/* Logo Link */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Logo Link (URL)
                      </label>
                      <input
                        type="text"
                        value={formData.LogoLink}
                        onChange={(e) => handleChange('LogoLink', e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        placeholder="https://..."
                      />
                    </div>

                    {/* Full Link */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Full Link (URL)
                      </label>
                      <input
                        type="text"
                        value={formData.FullLink}
                        onChange={(e) => handleChange('FullLink', e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        placeholder="https://..."
                      />
                    </div>

                    {/* Convergenza */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isConvergenza"
                        checked={formData.isConvergenza}
                        onChange={(e) => handleChange('isConvergenza', e.target.checked)}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <label htmlFor="isConvergenza" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        È Convergenza
                      </label>
                    </div>

                    {/* ID Offerta Collegata */}
                    {formData.isConvergenza && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          ID Offerta Collegata
                        </label>
                        <input
                          type="number"
                          value={formData.IDOffertaCollegata}
                          onChange={(e) => handleChange('IDOffertaCollegata', parseInt(e.target.value) || 0)}
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                    )}

                    {/* Only For */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Solo Per (IDGruppo)
                      </label>
                      <input
                        type="text"
                        value={formData.OnlyFor}
                        onChange={(e) => handleChange('OnlyFor', e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                      />
                    </div>

                    {/* Require Code */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="RequireCode"
                        checked={formData.RequireCode}
                        onChange={(e) => handleChange('RequireCode', e.target.checked)}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <label htmlFor="RequireCode" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Richiede Codice Promo
                      </label>
                    </div>

                    {/* Codice Promo Settings */}
                    {formData.RequireCode && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Prefisso Codice
                          </label>
                          <input
                            type="text"
                            value={formData.CodePrefix}
                            onChange={(e) => handleChange('CodePrefix', e.target.value)}
                            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                            maxLength={10}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Lunghezza Codice
                          </label>
                          <input
                            type="number"
                            value={formData.CodeLen || ''}
                            onChange={(e) => handleChange('CodeLen', parseInt(e.target.value) || null)}
                            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* Offerta Inviata */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="Offerta_Inviata"
                        checked={formData.Offerta_Inviata}
                        onChange={(e) => handleChange('Offerta_Inviata', e.target.checked)}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <label htmlFor="Offerta_Inviata" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Offerta Inviata
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? 'Creazione...' : 'Crea Offerta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
