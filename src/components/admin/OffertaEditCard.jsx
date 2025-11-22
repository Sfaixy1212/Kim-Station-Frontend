import { useState } from 'react';
import { putProtectedData } from '../../services/api';
import toast from 'react-hot-toast';

export default function OffertaEditCard({ offerta, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Campi editabili
  const [formData, setFormData] = useState({
    ValidaDal: offerta.ValidaDal ? offerta.ValidaDal.split('T')[0] : '',
    ValidaAl: offerta.ValidaAl ? offerta.ValidaAl.split('T')[0] : '',
    Crediti: (offerta.Crediti || 0) / 100, // Converti da centesimi a euro
    Titolo: offerta.Titolo || '',
    DescrizioneBreve: offerta.DescrizioneBreve || ''
  });

  // Calcola se offerta è attiva
  const isAttiva = new Date(offerta.ValidaAl) >= new Date();

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    // Ripristina valori originali
    setFormData({
      ValidaDal: offerta.ValidaDal ? offerta.ValidaDal.split('T')[0] : '',
      ValidaAl: offerta.ValidaAl ? offerta.ValidaAl.split('T')[0] : '',
      Crediti: (offerta.Crediti || 0) / 100, // Converti da centesimi a euro
      Titolo: offerta.Titolo || '',
      DescrizioneBreve: offerta.DescrizioneBreve || ''
    });
    setIsEditing(false);
  };

  const handleSave = async () => {
    // Validazioni
    if (!formData.ValidaDal || !formData.ValidaAl) {
      toast.error('Date validità obbligatorie');
      return;
    }
    if (new Date(formData.ValidaDal) > new Date(formData.ValidaAl)) {
      toast.error('Data "Valida Dal" deve essere precedente a "Valida Al"');
      return;
    }
    if (formData.Crediti < 0) {
      toast.error('Crediti non possono essere negativi');
      return;
    }
    if (!formData.Titolo.trim()) {
      toast.error('Titolo obbligatorio');
      return;
    }

    setSaving(true);
    const loadingId = toast.loading('Salvataggio in corso...');
    
    try {
      // Converti crediti da euro a centesimi prima di inviare
      const dataToSend = {
        ...formData,
        Crediti: Math.round(formData.Crediti * 100)
      };
      await putProtectedData(`/admin/offerte/${offerta.IDOfferta}`, dataToSend);
      toast.success('Offerta aggiornata con successo');
      setIsEditing(false);
      onUpdate(); // Ricarica lista
    } catch (e) {
      console.error('[SAVE OFFERTA][ERR]', e);
      toast.error(e?.message || 'Errore durante il salvataggio');
    } finally {
      toast.dismiss(loadingId);
      setSaving(false);
    }
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transition-all ${
        isEditing ? 'ring-2 ring-blue-500' : ''
      } ${!isAttiva ? 'opacity-75' : ''}`}
    >
      {/* Header con Logo e Badge */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {offerta.LogoOperatore && (
            <img
              src={offerta.LogoOperatore}
              alt={offerta.NomeOperatore}
              className="h-8 w-auto object-contain"
            />
          )}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {offerta.NomeOperatore}
          </span>
        </div>
        <span
          className={`px-2 py-1 text-xs font-semibold rounded ${
            isAttiva
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}
        >
          {isAttiva ? 'ATTIVA' : 'SCADUTA'}
        </span>
      </div>

      {/* Body - Campi */}
      <div className="p-4 space-y-3">
        {/* Titolo */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Titolo
          </label>
          {isEditing ? (
            <input
              type="text"
              value={formData.Titolo}
              onChange={(e) => handleChange('Titolo', e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded px-2 py-1 text-sm"
              maxLength={200}
            />
          ) : (
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {offerta.Titolo}
            </p>
          )}
        </div>

        {/* Descrizione Breve */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Descrizione Breve
          </label>
          {isEditing ? (
            <textarea
              value={formData.DescrizioneBreve}
              onChange={(e) => handleChange('DescrizioneBreve', e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded px-2 py-1 text-sm"
              rows={3}
              maxLength={500}
            />
          ) : (
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
              {offerta.DescrizioneBreve || '—'}
            </p>
          )}
        </div>

        {/* Crediti */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Crediti (€)
          </label>
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              value={formData.Crediti}
              onChange={(e) => handleChange('Crediti', parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded px-2 py-1 text-sm"
            />
          ) : (
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              € {(parseFloat(offerta.Crediti || 0) / 100).toFixed(2)}
            </p>
          )}
        </div>

        {/* Date Validità */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Valida Dal
            </label>
            {isEditing ? (
              <input
                type="date"
                value={formData.ValidaDal}
                onChange={(e) => handleChange('ValidaDal', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded px-2 py-1 text-xs"
              />
            ) : (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {new Date(offerta.ValidaDal).toLocaleDateString('it-IT')}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Valida Al
            </label>
            {isEditing ? (
              <input
                type="date"
                value={formData.ValidaAl}
                onChange={(e) => handleChange('ValidaAl', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded px-2 py-1 text-xs"
              />
            ) : (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {new Date(offerta.ValidaAl).toLocaleDateString('it-IT')}
              </p>
            )}
          </div>
        </div>

        {/* Info aggiuntive (readonly) */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Tipo:</span>
            <span className="font-medium">{offerta.Tipo}</span>
          </div>
          <div className="flex justify-between">
            <span>Segmento:</span>
            <span className="font-medium">{offerta.Segmento}</span>
          </div>
          <div className="flex justify-between">
            <span>Template:</span>
            <span className="font-medium text-xs truncate ml-2">{offerta.TemplateDatiOfferta}</span>
          </div>
        </div>
      </div>

      {/* Footer - Pulsanti */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        {!isEditing ? (
          <button
            onClick={handleEdit}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Modifica
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
