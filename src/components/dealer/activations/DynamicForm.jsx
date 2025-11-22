import React, { useMemo, useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import api, { upload } from '../../../api/client';

const ENI_NAME_KEY = 'cognome_nome';
const ENI_CF_KEY = 'codice_fiscale';
const ENI_TEMPLATE_REGEX = /eni/i;
const NAME_WORD_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ'’\-]+$/;

const isLikelyFullName = (value = '') => {
  const trimmed = value.trim();
  if (trimmed.length < 5) return false;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part) => part.length >= 2 && NAME_WORD_REGEX.test(part));
};

const isValidFiscalCodeFormat = (value = '') => /^[A-Z0-9]{16}$/.test(value);

function normalizeOptions(opzioni = []) {
  return opzioni.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

export default function DynamicForm({ template, idOfferta, onSuccess, onError }) {
  const campi = template?.campi || [];
  const documenti = template?.documenti || [];
  const templateName = template?.template || '';
  const isEniTemplate = ENI_TEMPLATE_REGEX.test(templateName);

  const initial = useMemo(() => {
    const base = {};
    campi.forEach((c) => { base[c.key] = c.tipo === 'checkbox' ? false : ''; });
    documenti.forEach((d) => { base[d.key] = null; });
    return base;
  }, [campi, documenti]);

  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const refs = useRef({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false); // Previene doppi invii
  const [showFirmeGuida, setShowFirmeGuida] = useState(false); // Mostra/nascondi esempi firme

  const setField = (key, val) => {
    let nextVal = val;
    if (typeof nextVal === 'string') {
      if (key === ENI_CF_KEY) {
        nextVal = nextVal.toUpperCase();
      } else if (key === ENI_NAME_KEY) {
        nextVal = nextVal.replace(/\s+/g, ' ');
      }
    }
    setValues((s) => ({ ...s, [key]: nextVal }));
    setErrors((s) => ({ ...s, [key]: null }));
  };

  // === Helpers per numero di cellulare (NUMERO_DA_PASSARE) ===
  const isValidMobile = (raw) => {
    if (raw == null || raw === '') return true; // validazione soft in live; il required è gestito da required/html5
    const s = String(raw).trim();
    if (!/^[0-9 ]+$/.test(s)) return false; // solo cifre e spazio
    const digits = s.replace(/\s+/g, '');
    if (!(digits.length === 9 || digits.length === 10)) return false;
    if (digits[0] === '0') return false;
    if (/^([0-9])\1+$/.test(digits)) return false; // tutte uguali
    if (s.includes(' ') && !/^\d{3}\s\d{6,7}$/.test(s)) return false;
    return true;
  };

  const formatMobileInput = (raw) => {
    if (raw == null) return '';
    const d = String(raw).replace(/[^0-9]/g, '').slice(0, 10); // max 10 cifre
    if (d.length <= 3) return d;
    return `${d.slice(0, 3)} ${d.slice(3)}`;
  };

  // Reset stato quando cambia offerta
  useEffect(() => {
    setSubmitted(false);
    setValues(initial);
  }, [idOfferta, initial]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    
    // Previeni doppio invio
    if (submitting || submitted) {
      console.log('Invio già in corso o completato, ignorato');
      return;
    }
    
    try {
      setSubmitting(true);
      // Validazioni client-side specifiche
      const needsNum = campi.find((c) => c.key === 'NUMERO_DA_PASSARE');
      if (needsNum) {
        const num = values['NUMERO_DA_PASSARE'] || '';
        const ok = isValidMobile(num);
        if (!ok || (needsNum.obbligatorio && !String(num).trim())) {
          setErrors((s) => ({ ...s, NUMERO_DA_PASSARE: 'Inserisci un numero di cellulare valido (es. 123 4567890).' }));
          try { refs.current['NUMERO_DA_PASSARE']?.focus(); } catch {}
          toast.error('Numero di cellulare non valido.');
          setSubmitting(false);
          return;
        }
      }
      const submissionValues = { ...values };
      const validationErrors = {};

      if (isEniTemplate) {
        const nameValue = typeof submissionValues[ENI_NAME_KEY] === 'string'
          ? submissionValues[ENI_NAME_KEY].trim().replace(/\s+/g, ' ')
          : '';
        const cfValue = typeof submissionValues[ENI_CF_KEY] === 'string'
          ? submissionValues[ENI_CF_KEY].trim().toUpperCase()
          : '';

        if (campi.some((c) => c.key === ENI_NAME_KEY) && !isLikelyFullName(nameValue)) {
          validationErrors[ENI_NAME_KEY] = 'Inserisci cognome e nome (es. Rossi Mario).';
        } else {
          submissionValues[ENI_NAME_KEY] = nameValue;
        }

        if (campi.some((c) => c.key === ENI_CF_KEY) && !isValidFiscalCodeFormat(cfValue)) {
          validationErrors[ENI_CF_KEY] = 'Il codice fiscale deve contenere 16 caratteri alfanumerici.';
        } else {
          submissionValues[ENI_CF_KEY] = cfValue;
        }
      }

      if (Object.keys(validationErrors).length) {
        setErrors((prev) => ({ ...prev, ...validationErrors }));
        const firstKey = Object.keys(validationErrors)[0];
        try { if (firstKey) refs.current[firstKey]?.focus(); } catch {}
        toast.error('Controlla i campi evidenziati.');
        setSubmitting(false);
        return;
      }

      const fd = new FormData();
      // Campi testuali
      Object.entries(submissionValues).forEach(([k, v]) => {
        if (v == null) return;
        if (v instanceof File) return; // gestiti sotto
        fd.append(k, v);
      });
      // File
      documenti.forEach((d) => {
        const file = values[d.key];
        if (file) fd.append(d.key, file);
      });
      // ⚡ CORREZIONE CRITICA: Costruisci payload reali invece di oggetti vuoti
      const intestatarioData = {};
      const altriDatiData = {};
      
      // Separa i campi in base al tipo (intestatario vs ordine)
      Object.entries(submissionValues).forEach(([key, value]) => {
        if (value == null || value === '' || value instanceof File) return;
        
        const keyUpper = key.toUpperCase();
        const isIntestatario = ['NOME_E_COGNOME', 'CODICE_FISCALE', 'CF_', 'DATA_DI_NASCITA', 
                                'LUOGO_DI_NASCITA', 'INDIRIZZO', 'CAP', 'CITTA', 
                                'PROVINCIA', 'EMAIL', 'TELEFONO', 'PEC'].some(prefix => 
                                keyUpper.includes(prefix));
        
        if (isIntestatario) {
          intestatarioData[key] = value;
        } else {
          altriDatiData[key] = value;
        }
      });
      
      // ⚡ VALIDAZIONE FRONTEND: Blocca invio se entrambi i payload sono vuoti
      const hasIntestario = Object.keys(intestatarioData).length > 0;
      const hasAltriDati = Object.keys(altriDatiData).length > 0;
      
      if (!hasIntestario && !hasAltriDati) {
        toast.error('Errore: Nessun dato inserito nel form. Compila almeno un campo.');
        setSubmitting(false);
        return;
      }
      
      console.log('[FORM-DEBUG] Payload intestatario:', intestatarioData);
      console.log('[FORM-DEBUG] Payload altriDati:', altriDatiData);
      
      // Obbligatori backend
      fd.set('idOfferta', String(idOfferta));
      try {
        const email = localStorage.getItem('email');
        if (email) fd.set('utente', email);
      } catch {}
      fd.set('intestatario', JSON.stringify(intestatarioData));
      fd.set('altriDati', JSON.stringify(altriDatiData));

      const res = await upload('/api/attivazioni', fd);
      setSubmitted(true); // Marca come inviato con successo
      toast.success('Attivazione inviata con successo');
      onSuccess?.(res.data);
    } catch (err) {
      const n = err.normalized || err;
      toast.error(n?.message || 'Errore durante l\'invio');
      onError?.(n);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Istruzioni / download */}
      {template?.istruzioni && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          {template.istruzioni}
        </div>
      )}
      
      {/* Guida firme ENI PLENITUDE */}
      {template?.firmeGuida && template.firmeGuida.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowFirmeGuida(!showFirmeGuida)}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <svg 
              className={`w-4 h-4 transition-transform ${showFirmeGuida ? 'rotate-90' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            📋 Vedi dove apporre le firme
          </button>
          
          {showFirmeGuida && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
              {template.firmeGuida.map((img, idx) => (
                <div key={idx} className="space-y-2">
                  <p className="text-xs font-medium text-gray-700">{img.label || `Pagina ${idx + 1}`}</p>
                  <a href={img.url} target="_blank" rel="noreferrer">
                    <img 
                      src={img.url} 
                      alt={img.label || `Esempio firme ${idx + 1}`}
                      className="w-full h-auto rounded-lg border border-gray-300 hover:border-blue-500 transition-colors cursor-pointer shadow-sm hover:shadow-md"
                    />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {(template?.linkDownload || template?.downloadUrl) && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <a
              href={(template.linkDownload?.url) || template.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
            >
              {/* Icona PDF */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM8 13h2a2 2 0 0 0 0-4H8v4zm6 0h-2v4h2a2 2 0 0 0 0-4zm-4-2h1a1 1 0 1 1 0 2H10v-2zm4 4h1a1 1 0 1 1 0 2h-1v-2zM13 9V3.5L18.5 9H13z" />
              </svg>
              <span>{(template.linkDownload?.label) || template.downloadLabel || 'SCARICA E COMPILA IL MODULO DI RILANCIO'}</span>
            </a>
            <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">PDF</span>
          </div>
          {template.linkDownload?.descrizione && (
            <p className="text-xs text-gray-600">{template.linkDownload.descrizione}</p>
          )}
        </div>
      )}
      {template?.downloadUrl2 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <a
              href={template.downloadUrl2}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
            >
              {/* Icona PDF */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM8 13h2a2 2 0 0 0 0-4H8v4zm6 0h-2v4h2a2 2 0 0 0 0-4zm-4-2h1a1 1 0 1 1 0 2H10v-2zm4 4h1a1 1 0 1 1 0 2h-1v-2zM13 9V3.5L18.5 9H13z" />
              </svg>
              <span>{template.downloadLabel2 || 'SCARICA DOCUMENTO AGGIUNTIVO'}</span>
            </a>
            <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">PDF</span>
          </div>
        </div>
      )}

      {/* Campi dinamici */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {campi.map((c) => {
          const common = {
            id: c.key,
            name: c.key,
            required: !!c.obbligatorio,
            className:
              'w-full rounded-xl border border-gray-200 bg-white py-3 px-4 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
            value: c.tipo === 'checkbox' ? undefined : values[c.key] ?? '',
            onChange: (e) => {
              const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
              if (c.key === 'NUMERO_DA_PASSARE') {
                const formatted = formatMobileInput(v);
                setField(c.key, formatted);
                const ok = isValidMobile(formatted);
                setErrors((s) => ({ ...s, [c.key]: ok ? null : 'Numero non valido (es. 123 4567890).' }));
              } else {
                setField(c.key, v);
              }
            },
          };
          const placeholder = c.placeholder || (c.key === 'NUMERO_DA_PASSARE' ? '123 4567890' : undefined);
          return (
            <div key={c.key} className="space-y-2">
              <label htmlFor={c.key} className="text-sm font-medium text-gray-700">
                {c.label}
                {c.obbligatorio ? <span className="text-red-500"> *</span> : null}
              </label>
              {c.tipo === 'select' ? (
                <select {...common}>
                  <option value="">Seleziona...</option>
                  {normalizeOptions(c.opzioni).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : c.tipo === 'checkbox' ? (
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={!!values[c.key]} onChange={common.onChange} className="h-4 w-4" />
                  <span className="text-sm text-gray-700">{c.label}</span>
                </div>
              ) : (
                <>
                  <input
                    ref={(el) => { refs.current[c.key] = el; }}
                    type={c.tipo || 'text'}
                    {...common}
                    placeholder={placeholder}
                    onBlur={() => {
                      if (c.key === 'NUMERO_DA_PASSARE') {
                        const ok = isValidMobile(values[c.key]);
                        setErrors((s) => ({ ...s, [c.key]: ok ? null : 'Numero non valido (es. 123 4567890).' }));
                      }
                    }}
                  />
                  {errors[c.key] ? (
                    <p className="text-xs text-red-600 mt-1">{errors[c.key]}</p>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Upload documenti */}
      {documenti.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Documenti</h3>
          {documenti.map((d) => (
            <div key={d.key} className="space-y-2">
              <label className="text-sm text-gray-700">
                {d.label}
                {d.obbligatorio ? <span className="text-red-500"> *</span> : null}
              </label>
              <input
                type="file"
                onChange={(e) => setField(d.key, e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border file:border-gray-200 file:bg-white file:px-3 file:py-2 file:text-sm file:text-gray-700 hover:file:bg-gray-50"
                required={!!d.obbligatorio}
                accept={d.accept || undefined}
              />
            </div>)
          )}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={submitting || submitted}
          className={`inline-flex items-center justify-center rounded-xl px-5 py-3 text-white font-medium shadow-sm transition-colors ${
            submitted 
              ? 'bg-green-600 hover:bg-green-700' 
              : submitting 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
          } disabled:opacity-75`}
        >
          {submitted ? (
            <>
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Attivazione inviata
            </>
          ) : submitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Invio in corso...
            </>
          ) : (
            'Invia attivazione'
          )}
        </button>
        
        {submitted && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-green-800 font-medium">
                Attivazione inviata con successo! Puoi selezionare una nuova offerta per continuare.
              </span>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
