import React, { useEffect } from 'react';
import moduloEniBg from '../../../assets/modulo_eni_luce_page1.png';

export default function EniPdfForm({ values, setField, errors }) {
  
  // Inizializza campi obbligatori nascosti o default per validazione
  useEffect(() => {
    if (!values.tipo_contratto) setField('tipo_contratto', 'Switch');
    if (!values.uso_domestico) setField('uso_domestico', 'Domestico');
    if (!values.tipologia_abitazione) setField('tipologia_abitazione', 'Residenza');
    if (!values.modalita_fattura) setField('modalita_fattura', 'Digitale');
    if (!values.modalita_pagamento) setField('modalita_pagamento', 'RID bancario');
    if (!values.data_firma) {
      const today = new Date().toLocaleDateString('it-IT');
      setField('data_firma', today);
    }
  }, []);

  // Helper per input posizionati
  const PdfInput = ({ top, left, width, height, name, type = 'text', placeholder = '', className = '', style = {}, onChange }) => {
    const isCheckbox = type === 'checkbox';
    const val = values[name];
    
    const handleChange = (e) => {
      const v = isCheckbox ? e.target.checked : e.target.value;
      setField(name, v);
      if (onChange) onChange(v);
    };
    
    return (
      <input
        type={type}
        name={name}
        value={isCheckbox ? undefined : (val ?? '')}
        checked={isCheckbox ? !!val : undefined}
        onChange={handleChange}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={`absolute bg-white/50 border border-gray-300 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[10px] sm:text-xs px-1 outline-none ${className} ${errors?.[name] ? 'border-red-500 bg-red-50/50' : ''}`}
        style={{
          top,
          left,
          width,
          height,
          ...style
        }}
      />
    );
  };

  // Helper per checkbox
  const PdfCheckbox = ({ top, left, width, height, name, onChange }) => (
    <PdfInput type="checkbox" top={top} left={left} width={width} height={height} name={name} onChange={onChange} className="cursor-pointer opacity-50 hover:opacity-100" />
  );

  return (
    <div className="relative w-full max-w-[1000px] mx-auto border shadow-lg bg-white overflow-hidden rounded-lg">
      <img src={moduloEniBg} alt="Modulo ENI" className="w-full h-auto select-none pointer-events-none" />
      
      {/* --- DATI DEL CLIENTE --- */}
      <PdfInput name="cognome_nome" top="21.5%" left="3.5%" width="81.5%" height="2.2%" placeholder="COGNOME E NOME" />
      <PdfCheckbox name="sesso_m" top="21.5%" left="92.0%" width="1.5%" height="2.0%" onChange={(v) => { if(v) setField('sesso_f', false); }} />
      <PdfCheckbox name="sesso_f" top="21.5%" left="94.5%" width="1.5%" height="2.0%" onChange={(v) => { if(v) setField('sesso_m', false); }} />

      <PdfInput name="codice_fiscale" top="24.2%" left="3.5%" width="44%" height="2.2%" placeholder="CODICE FISCALE" />
      
      <PdfCheckbox name="tipo_doc_ci" top="24.4%" left="59.2%" width="1.5%" height="1.5%" onChange={(v) => { if(v) { setField('tipo_documento', "Carta d'Identità"); setField('tipo_doc_patente', false); setField('tipo_doc_altro', false); }}} />
      <PdfCheckbox name="tipo_doc_patente" top="24.4%" left="70.5%" width="1.5%" height="1.5%" onChange={(v) => { if(v) { setField('tipo_documento', "Patente"); setField('tipo_doc_ci', false); setField('tipo_doc_altro', false); }}} />
      <PdfCheckbox name="tipo_doc_altro" top="24.4%" left="78.2%" width="1.5%" height="1.5%" onChange={(v) => { if(v) { setField('tipo_documento', "Altro"); setField('tipo_doc_ci', false); setField('tipo_doc_patente', false); }}} />

      <PdfInput name="luogo_di_nascita" top="26.9%" left="3.5%" width="34%" height="2.2%" placeholder="NATO A" />
      <PdfInput name="data_di_nascita" top="26.9%" left="40.5%" width="12%" height="2.2%" placeholder="GG/MM/AAAA" />
      <PdfInput name="comune" top="26.9%" left="66.5%" width="23.5%" height="2.2%" placeholder="COMUNE" />
      <PdfInput name="provincia" top="26.9%" left="91.0%" width="5%" height="2.2%" placeholder="PR" />

      <PdfInput name="numero_documento" top="29.6%" left="3.5%" width="34%" height="2.2%" placeholder="NUMERO DOC" />
      <PdfInput name="ente_rilascio_documento" top="29.6%" left="40.5%" width="12%" height="2.2%" placeholder="ENTE" />
      <PdfInput name="data_rilascio_documento" top="29.6%" left="55.5%" width="10%" height="2.2%" placeholder="DATA" />
      
      <PdfInput name="indirizzo_residenza" top="29.6%" left="72.5%" width="13.5%" height="2.2%" placeholder="VIA" />
      <PdfInput name="indirizzo_residenza_civico" top="29.6%" left="87.0%" width="4%" height="2.2%" placeholder="N" />
      <PdfInput name="cap" top="29.6%" left="92.0%" width="6%" height="2.2%" placeholder="CAP" />

      {/* Riga 5: Telefono, Cellulare, Email, Indirizzo residenza dettagli */}
      <PdfInput name="telefono" top="32.3%" left="3.5%" width="34%" height="2.2%" placeholder="TELEFONO" />
      <PdfInput name="cellulare" top="32.3%" left="40.5%" width="25%" height="2.2%" placeholder="CELLULARE" />
      <PdfInput name="email" top="32.3%" left="66.5%" width="29.5%" height="2.2%" placeholder="EMAIL" />

      {/* --- INDIRIZZO FORNITURA --- */}
      <PdfInput name="indirizzo_fornitura" top="37.0%" left="18.5%" width="47%" height="2.2%" placeholder="VIA/PIAZZA" />
      <PdfInput name="indirizzo_fornitura_civico" top="37.0%" left="66.5%" width="12%" height="2.2%" />
      <PdfCheckbox name="abitazione_residenza_si" top="37.2%" left="92.0%" width="1.5%" height="1.5%" onChange={(v) => { if(v) setField('abitazione_residenza_no', false); }} />
      <PdfCheckbox name="abitazione_residenza_no" top="37.2%" left="94.5%" width="1.5%" height="1.5%" onChange={(v) => { if(v) setField('abitazione_residenza_si', false); }} />

      {/* Riga 2: CAP, Comune, Provincia */}
      <PdfInput name="cap_fornitura" top="39.7%" left="18.5%" width="8%" height="2.2%" placeholder="CAP" />
      <PdfInput name="comune_fornitura" top="39.7%" left="27.5%" width="51%" height="2.2%" placeholder="COMUNE" />
      <PdfInput name="provincia_fornitura" top="39.7%" left="82.5%" width="13.5%" height="2.2%" placeholder="PROV" />

      {/* --- INDIRIZZO INVIO FATTURE --- */}
      <PdfInput name="indirizzo_fattura" top="44.4%" left="18.5%" width="47%" height="2.2%" />
      <PdfInput name="indirizzo_fattura_civico" top="44.4%" left="82.5%" width="13.5%" height="2.2%" />
      <PdfInput name="cap_fattura" top="47.1%" left="18.5%" width="8%" height="2.2%" />
      <PdfInput name="comune_fattura" top="47.1%" left="27.5%" width="51%" height="2.2%" />
      <PdfInput name="provincia_fattura" top="47.1%" left="82.5%" width="13.5%" height="2.2%" />

      {/* --- GAS --- */}
      <PdfInput name="pdr" top="51.8%" left="3.5%" width="30%" height="2.2%" placeholder="PDR" />
      <PdfInput name="matricola_gas" top="51.8%" left="43.5%" width="14%" height="2.2%" />
      <PdfInput name="codice_offerta_gas" top="51.8%" left="70.0%" width="26%" height="2.2%" />
      
      {/* Uso Gas Checkboxes */}
      <PdfCheckbox name="uso_cottura" top="54.5%" left="12.0%" width="1.5%" height="1.5%" />
      <PdfCheckbox name="uso_riscaldamento" top="54.5%" left="17.5%" width="1.5%" height="1.5%" />
      <PdfCheckbox name="uso_acqua" top="54.5%" left="26.5%" width="1.5%" height="1.5%" />
      <PdfCheckbox name="uso_altri" top="54.5%" left="34.5%" width="1.5%" height="1.5%" />
      <PdfInput name="consumo_annuo_gas" top="54.5%" left="43.5%" width="14%" height="2.2%" />

      {/* Tipo Abitazione Gas */}
      <PdfCheckbox name="tipo_abitazione_condominio" top="54.5%" left="74.5%" width="1.5%" height="1.5%" onChange={(v) => { if(v) setField('tipo_abitazione_unifamiliare', false); }} />
      <PdfCheckbox name="tipo_abitazione_unifamiliare" top="54.5%" left="81.0%" width="1.5%" height="1.5%" onChange={(v) => { if(v) setField('tipo_abitazione_condominio', false); }} />

      {/* Fornitore Attuale Gas */}
      <PdfInput name="fornitore_attuale_gas" top="57.2%" left="34.0%" width="62%" height="2.2%" />

      {/* --- ENERGIA ELETTRICA --- */}
      <PdfInput name="pod" top="62.5%" left="3.5%" width="30%" height="2.2%" placeholder="POD" />
      
      {/* Uso Luce */}
      <PdfCheckbox name="uso_luce_abitazione" top="62.5%" left="46.5%" width="1.5%" height="1.5%" onChange={(v) => { if(v) { setField('uso_domestico', 'Domestico'); setField('uso_luce_pertinenza', false); }}} />
      <PdfCheckbox name="uso_luce_pertinenza" top="62.5%" left="51.5%" width="1.5%" height="1.5%" onChange={(v) => { if(v) { setField('uso_domestico', 'Non domestico'); setField('uso_luce_abitazione', false); }}} />
      
      <PdfInput name="codice_offerta_luce" top="62.5%" left="69.0%" width="27%" height="2.2%" />

      <PdfInput name="potenza_impegnata" top="65.2%" left="43.5%" width="14%" height="2.2%" />
      <PdfInput name="consumo_annuo_luce" top="65.2%" left="66.0%" width="8%" height="2.2%" />
      <PdfCheckbox name="opzione_bioraria" top="65.2%" left="74.0%" width="1.5%" height="1.5%" />

      <PdfInput name="fornitore_attuale_luce" top="67.9%" left="34.0%" width="62%" height="2.2%" />

      {/* --- ESECUZIONE ANTICIPATA --- */}
      <PdfCheckbox name="esecuzione_anticipata" top="70.6%" left="3.5%" width="1.5%" height="1.5%" />

      {/* --- COMUNICAZIONI E BOLLETTA DIGITALE --- */}
      <PdfCheckbox name="bolletta_digitale" top="73.3%" left="3.5%" width="1.5%" height="1.5%" onChange={(v) => setField('modalita_fattura', v ? 'Digitale' : 'Cartacea')} />
      <PdfInput name="email_bolletta" top="74.5%" left="48.0%" width="48%" height="2.2%" placeholder="EMAIL PER BOLLETTA" />

      {/* --- ADDEBITO SEPA --- */}
      <PdfCheckbox name="addebito_sepa_check" top="78.0%" left="3.5%" width="1.5%" height="1.5%" onChange={(v) => { if(v) setField('modalita_pagamento', 'RID bancario'); }} />
      <PdfInput name="titolare_conto" top="78.5%" left="16.0%" width="42%" height="2.2%" placeholder="TITOLARE CONTO" />
      <PdfInput name="cf_titolare_conto" top="78.5%" left="74.0%" width="22%" height="2.2%" placeholder="CF TITOLARE" />
      <PdfInput name="iban" top="81.2%" left="16.0%" width="80%" height="2.2%" className="tracking-widest font-mono" placeholder="IBAN" />
      
      {/* --- CONSENSI PRIVACY --- */}
      <PdfCheckbox name="privacy_promo_si" top="89.0%" left="52.2%" width="1.5%" height="1.2%" onChange={(v) => { if(v) setField('privacy_promo_no', false); }} />
      <PdfCheckbox name="privacy_promo_no" top="89.0%" left="54.2%" width="1.5%" height="1.2%" onChange={(v) => { if(v) setField('privacy_promo_si', false); }} />
      
      <PdfCheckbox name="privacy_analisi_si" top="90.5%" left="52.2%" width="1.5%" height="1.2%" onChange={(v) => { if(v) setField('privacy_analisi_no', false); }} />
      <PdfCheckbox name="privacy_analisi_no" top="90.5%" left="54.2%" width="1.5%" height="1.2%" onChange={(v) => { if(v) setField('privacy_analisi_si', false); }} />
      
      <PdfCheckbox name="privacy_future_si" top="92.0%" left="52.2%" width="1.5%" height="1.2%" onChange={(v) => { if(v) setField('privacy_future_no', false); }} />
      <PdfCheckbox name="privacy_future_no" top="92.0%" left="54.2%" width="1.5%" height="1.2%" onChange={(v) => { if(v) setField('privacy_future_si', false); }} />

      {/* --- DATA E FIRMA --- */}
      <PdfInput name="data_firma" top="94.5%" left="8.0%" width="20%" height="2.0%" placeholder="DATA" />
      
      {/* Disclaimer o note */}
      <div className="absolute bottom-1 left-2 text-[10px] text-gray-500 bg-white/80 px-2">
        Compila i campi direttamente sul modulo. I dati saranno salvati automaticamente.
      </div>
    </div>
  );
}
