import { useEffect, useMemo, useState } from 'react';
import SuperMasterTopbar from '../components/supermaster/Topbar';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/common/Card';
import { getProtectedData, postFormData, postProtectedData } from '../services/api';
import toast from 'react-hot-toast';

function Field({ label, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function FieldGroup({ title, children, className = '', columns = 3 }) {
  const parts = ['grid-cols-1'];
  if (columns >= 2) parts.push('sm:grid-cols-2');
  if (columns >= 3) parts.push('lg:grid-cols-3');
  if (columns >= 4) parts.push('xl:grid-cols-4');
  if (columns >= 5) parts.push('2xl:grid-cols-5');
  if (columns >= 6) parts.push('3xl:grid-cols-6');
  const columnClass = parts.join(' ');
  return (
    <div className={`border border-gray-200 rounded-lg bg-white/70 p-3 flex flex-col gap-3 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className={`grid ${columnClass} gap-3`}>
        {children}
      </div>
    </div>
  );
}

function PianiIncentiviUploadSection(){
  const { user } = useAuth();
  const role = (user?.role || '').toString().trim().toLowerCase();
  const isSM = role === 'supermaster' || role === 'admin';
  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();
  const firstDay = `${defaultYear}-${String(defaultMonth).padStart(2,'0')}-01`;
  const lastDayDate = new Date(defaultYear, defaultMonth, 0);
  const lastDay = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth()+1).padStart(2,'0')}-${String(lastDayDate.getDate()).padStart(2,'0')}`;

  const [mese, setMese] = useState(defaultMonth);
  const [anno, setAnno] = useState(defaultYear);
  const [validitaDal, setValiditaDal] = useState(firstDay);
  const [validitaAl, setValiditaAl] = useState(lastDay);
  const [operatore, setOperatore] = useState('SKY');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);

  async function loadRows(){
    try {
      const res = await getProtectedData('/supermaster/piani-incentivi');
      setRows(Array.isArray(res) ? res : []);
    } catch (e) { /* no-op */ }
  }
  useEffect(()=>{ if (isSM) loadRows(); }, [isSM]);

  useEffect(()=>{
    // aggiorna default validità quando mese/anno cambiano
    const fd = `${anno}-${String(mese).padStart(2,'0')}-01`;
    const ldDate = new Date(anno, mese, 0);
    const ld = `${ldDate.getFullYear()}-${String(ldDate.getMonth()+1).padStart(2,'0')}-${String(ldDate.getDate()).padStart(2,'0')}`;
    setValiditaDal(fd); setValiditaAl(ld);
  }, [mese, anno]);

  if (!isSM) return null;

  async function onSubmit(e){
    e?.preventDefault?.();
    setError('');
    try {
      if (!file) { setError('Seleziona un file'); return; }
      setSubmitting(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mese', String(mese));
      fd.append('anno', String(anno));
      fd.append('validita_dal', validitaDal || '');
      fd.append('validita_al', validitaAl || '');
      fd.append('operatore', operatore || 'GENERIC');
      await postFormData('/supermaster/piani-incentivi', fd);
      setFile(null);
      await loadRows();
      alert('Piano inserito');
    } catch (e) {
      setError(e?.message || 'Errore inserimento');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div className="text-sm font-medium text-gray-900 mb-2">Upload (solo SuperMaster)</div>
      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Operatore">
          <input className="border rounded-md px-2 py-1 text-sm" value={operatore} onChange={e=>setOperatore(e.target.value)} placeholder="SKY / FASTWEB / ILIAD…" />
        </Field>
        <Field label="Mese">
          <select className="border rounded-md px-2 py-1 text-sm" value={mese} onChange={e=>setMese(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i+1).map(m=> <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
          </select>
        </Field>
        <Field label="Anno">
          <input type="number" className="border rounded-md px-2 py-1 text-sm" value={anno} onChange={e=>setAnno(Number(e.target.value))} />
        </Field>
        <Field label="Validità dal">
          <input type="date" className="border rounded-md px-2 py-1 text-sm" value={validitaDal} onChange={e=>setValiditaDal(e.target.value)} />
        </Field>
        <Field label="Validità al">
          <input type="date" className="border rounded-md px-2 py-1 text-sm" value={validitaAl} onChange={e=>setValiditaAl(e.target.value)} />
        </Field>
        <Field label="File (PDF)">
          <input type="file" accept=".pdf" className="text-sm" onChange={e=>setFile(e.target.files?.[0]||null)} />
        </Field>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={submitting} className="px-3 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-60">{submitting ? 'Inserisco…' : 'Inserisci'}</button>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      </form>

      <div className="mt-4">
        <div className="text-xs text-gray-600 mb-1">Ultimi inserimenti</div>
        <div className="overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-2 py-1">Periodo</th>
                <th className="text-left px-2 py-1">Operatore</th>
                <th className="text-left px-2 py-1">Nome file</th>
                <th className="text-left px-2 py-1">Validità</th>
                <th className="text-left px-2 py-1">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(rows||[]).slice(0,10).map((r,i)=> (
                <tr key={i}>
                  <td className="px-2 py-1 whitespace-nowrap">{String(r.periodo_label || `${String(r.mese).padStart(2,'0')}/${r.anno}`)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.operatore}</td>
                  <td className="px-2 py-1">{r.nome_file}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.validita_dal} → {r.validita_al || '-'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.url_s3 ? <a className="text-blue-600 underline" href={r.url_s3} target="_blank" rel="noreferrer">Apri</a> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StrumentiNews() {
  const { user } = useAuth();
  const role = (user?.role || '').toString().trim().toLowerCase();
  const isSM = role === 'supermaster' || role === 'admin';
  // Filtri ridotti: solo "Solo attive"
  const [activeOnly, setActiveOnly] = useState(true);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    // scope fisso a 'dealer'
    dealerId: '',
    dealerName: '',
    dealerQuery: '',
    sendToAllDealers: true,
    titolo: '',
    messaggio: '',
    validFrom: '',
    validTo: '',
    active: true,
    attachmentUrl: '',
    attachmentName: '',
    attachmentKey: '',
  });
  const [dealerFormOptions, setDealerFormOptions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (activeOnly) p.set('active', 'true');
    return `?${p.toString()}`;
  }, [activeOnly]);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const data = await getProtectedData(`/supermaster/news${qs}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Errore caricamento news');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [qs]);

  // (Filtri destinatario rimossi)

  // Autocomplete Dealers - Form creazione (solo Dealer)
  useEffect(() => {
    let abort = false;
    const q = (form.dealerQuery || '').trim();
    if (!isSM) return; // solo SM possono cercare dealer
    if (!q) { setDealerFormOptions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await getProtectedData(`/supermaster/dealers/search?q=${encodeURIComponent(q)}`);
        if (!abort) setDealerFormOptions(Array.isArray(res) ? res : []);
      } catch { if (!abort) setDealerFormOptions([]); }
    }, 200);
    return () => { abort = true; clearTimeout(t); };
  }, [form.dealerQuery, isSM]);

  function onChange(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function onUploadFile(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await postFormData('/supermaster/news/upload', fd);
    onChange('attachmentUrl', res.url || '');
    onChange('attachmentName', res.originalName || file.name);
    onChange('attachmentKey', res.key || '');
  }

  async function onCreate(e) {
    e?.preventDefault?.();
    try {
      setSubmitting(true);
      setError('');
      const body = { ...form, scope: 'dealer' };
      // Broadcast a tutti i dealer se selezionato
      if (body.sendToAllDealers) {
        body.dealerId = null;
      } else {
        body.dealerId = body.dealerId ? Number(body.dealerId) : null;
      }
      // normalizza active -> boolean
      body.active = !!body.active;
      await postProtectedData('/supermaster/news', body);
      // reset veloce, mantiene scope predefinito
      setForm(f => ({ ...f, dealerId: '', dealerName: '', dealerQuery: '', sendToAllDealers: true, titolo: '', messaggio: '', validFrom: '', validTo: '', attachmentUrl: '', attachmentName: '', attachmentKey: '' }));
      await load();
    } catch (e) {
      setError(e?.message || 'Errore creazione news');
    } finally {
      setSubmitting(false);
    }
  }

  async function onToggleActive(row) {
    try {
      await fetch(`/api/supermaster/news/${row.ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !row.Active })
      }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      await load();
    } catch (e) {
      setError(e?.message || 'Errore aggiornamento stato');
    }
  }

  async function onDelete(row) {
    if (!confirm('Eliminare questa news?')) return;
    try {
      await fetch(`/api/supermaster/news/${row.ID}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); });
      await load();
    } catch (e) {
      setError(e?.message || 'Errore eliminazione');
    }
  }

  return (
    <Card title="News" subtitle="Gestione comunicazioni a Dealer e Agenti">
      {/* Filtri */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} /> Solo attive
        </label>
        <button onClick={load} className="ml-auto px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50">Aggiorna</button>
      </div>

      {/* Form nuova News (scope fisso Dealer) */}
      {isSM && (
      <form onSubmit={onCreate} className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Dealer (Ragione Sociale)">
            <div className="relative">
              <input
                value={form.dealerQuery}
                onChange={(e) => onChange('dealerQuery', e.target.value)}
                className="border rounded-md px-2 py-1 text-sm w-full"
                placeholder="Digita per cercare…"
              />
              {dealerFormOptions.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 border border-gray-200 rounded-md bg-white max-h-48 overflow-auto z-20">
                  {dealerFormOptions.map(opt => (
                    <button
                      key={opt.DealerID}
                      type="button"
                      onClick={() => { onChange('dealerId', String(opt.DealerID)); onChange('dealerName', opt.RagioneSociale); onChange('dealerQuery', opt.RagioneSociale); setDealerFormOptions([]); }}
                      className="block w-full text-left px-2 py-1 hover:bg-gray-50 text-sm"
                    >
                      {opt.RagioneSociale} <span className="text-[11px] text-gray-400">(ID {opt.DealerID})</span>
                    </button>
                  ))}
                </div>
              )}
              {form.dealerName && form.dealerId && (
                <div className="text-[11px] text-gray-500 mt-1">Selezionato: {form.dealerName} (ID {form.dealerId})</div>
              )}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-gray-700 mt-2">
              <input type="checkbox" checked={form.sendToAllDealers} onChange={(e) => onChange('sendToAllDealers', e.target.checked)} /> Invia a tutti i Dealer
            </label>
          </Field>
          <Field label="Titolo">
            <input value={form.titolo} onChange={e => onChange('titolo', e.target.value)} className="border rounded-md px-2 py-1 text-sm" required />
          </Field>
          <Field label="Validità dal">
            <input type="date" value={form.validFrom} onChange={e => onChange('validFrom', e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
          </Field>
          <Field label="Validità al">
            <input type="date" value={form.validTo} onChange={e => onChange('validTo', e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
          </Field>
          <Field label="Allegato (pdf, jpg, png)">
            <div className="flex items-center gap-2">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => onUploadFile(e.target.files?.[0])} className="text-sm" />
              {form.attachmentUrl && (
                <a href={form.attachmentUrl} target="_blank" rel="noreferrer" className="text-blue-600 text-sm underline">Vedi allegato</a>
              )}
            </div>
          </Field>
          <div className="flex items-center gap-2 mt-6">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.active} onChange={e => onChange('active', e.target.checked)} /> Attiva
            </label>
          </div>
        </div>
        <Field label="Messaggio">
          <textarea value={form.messaggio} onChange={e => onChange('messaggio', e.target.value)} className="border rounded-md px-2 py-1 text-sm w-full min-h-[80px]" required />
        </Field>
        <div className="flex items-center gap-2 mt-3">
          <button disabled={submitting} className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">{submitting ? 'Salvataggio…' : 'Crea News'}</button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>
      )}

      {/* Lista News */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-2 pr-3">Titolo</th>
              <th className="py-2 pr-3">Scope</th>
              <th className="py-2 pr-3">Dealer/Agente</th>
              <th className="py-2 pr-3">Validità</th>
              <th className="py-2 pr-3">Allegato</th>
              <th className="py-2 pr-3">Attiva</th>
              <th className="py-2 pr-3">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="py-3 text-gray-500" colSpan={7}>Caricamento…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="py-3 text-gray-500" colSpan={7}>Nessuna news</td></tr>
            ) : (
              rows.map(r => (
                <tr key={r.ID} className="border-t border-gray-100">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-gray-800">{r.Titolo}</div>
                    <div className="text-xs text-gray-500 line-clamp-1">{r.Messaggio}</div>
                  </td>
                  <td className="py-2 pr-3">{String(r.Scope).toUpperCase()}</td>
                  <td className="py-2 pr-3">{r.Scope === 'dealer' ? (r.DealerID ?? '—') : (r.Agente ?? '—')}</td>
                  <td className="py-2 pr-3">{(r.ValidFrom || '—')} {(r.ValidTo ? `→ ${r.ValidTo}` : '')}</td>
                  <td className="py-2 pr-3">{r.AttachmentUrl ? <a className="text-blue-600 underline" href={r.AttachmentUrl} target="_blank" rel="noreferrer">Apri</a> : '—'}</td>
                  <td className="py-2 pr-3">{r.Active ? 'Sì' : 'No'}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onToggleActive(r)} className="px-2 py-1 border rounded text-xs hover:bg-gray-50">{r.Active ? 'Disattiva' : 'Attiva'}</button>
                      <button onClick={() => onDelete(r)} className="px-2 py-1 border border-red-200 text-red-600 rounded text-xs hover:bg-red-50">Elimina</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Strumenti() {
  return (
    <>
      <SuperMasterTopbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Sezione Piani Incentivi (link dedicato, niente TOTP qui) */}
      <Card title="Piani Incentivi" subtitle="Inserisce i Piani Incentivi per Dealers e Agenti">
        <PianiIncentiviUploadSection />
      </Card>

      {/* Sezione News */}
      <StrumentiNews />

      {/* Sezione Obiettivi Agenti */}
      <ObiettiviAgentiSection />
      </div>
    </>
  );
}

function ObiettiviAgentiSection(){
  const { user } = useAuth();
  const role = (user?.role || '').toString().trim().toLowerCase();
  const isSM = role === 'supermaster' || role === 'admin';
  const AGENTI = ['GABRIELE','GIACOMO','LUIGI','RAFFAELE'];
  const now = new Date();
  const [anno, setAnno] = useState(now.getFullYear());
  const [mese, setMese] = useState(now.getMonth()+1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form upsert
  const [agente, setAgente] = useState(AGENTI[0]);
  const [fissoTotale, setFissoTotale] = useState(0);
  const [mobileTotale, setMobileTotale] = useState(0);
  const [energyTotale, setEnergyTotale] = useState(0);
  const [fissoStart, setFissoStart] = useState(0);
  const [fissoPro, setFissoPro] = useState(0);
  const [fissoUltra, setFissoUltra] = useState(0);
  const [mobileStart, setMobileStart] = useState(0);
  const [mobilePro, setMobilePro] = useState(0);
  const [mobileUltra, setMobileUltra] = useState(0);
  const [mobilePercentRA, setMobilePercentRA] = useState(0);
  const [mobileConvergenze, setMobileConvergenze] = useState(0);
  const [energyCore, setEnergyCore] = useState(0);
  const [energyFlex, setEnergyFlex] = useState(0);
  const [energyFix, setEnergyFix] = useState(0);
  const [energyEni, setEnergyEni] = useState(0);
  const [energyPercentFastweb, setEnergyPercentFastweb] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(){
    try{
      setLoading(true); setError('');
      const qs = new URLSearchParams();
      if (anno) qs.set('anno', String(anno));
      if (mese) qs.set('mese', String(mese));
      const data = await getProtectedData(`/supermaster/obiettivi-agenti?${qs.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    }catch(e){ setError(e?.message || 'Errore caricamento obiettivi'); setRows([]);} finally { setLoading(false); }
  }

  useEffect(()=>{ if (isSM) load(); }, [anno, mese, isSM]);

  async function onSave(){
    try{
      setSaving(true); setError('');
      const body = {
        Agente: String(agente || '').toUpperCase(),
        Anno: Number(anno),
        Mese: Number(mese),
        Note: note || null,
        FissoTotale: Number(fissoTotale) || 0,
        MobileTotale: Number(mobileTotale) || 0,
        EnergyTotale: Number(energyTotale) || 0,
        FissoStart: Number(fissoStart) || 0,
        FissoPro: Number(fissoPro) || 0,
        FissoUltra: Number(fissoUltra) || 0,
        MobileStart: Number(mobileStart) || 0,
        MobilePro: Number(mobilePro) || 0,
        MobileUltra: Number(mobileUltra) || 0,
        MobilePercentRA: Number(mobilePercentRA) || 0,
        MobileConvergenze: Number(mobileConvergenze) || 0,
        EnergyCore: Number(energyCore) || 0,
        EnergyFlex: Number(energyFlex) || 0,
        EnergyFix: Number(energyFix) || 0,
        EnergyEni: Number(energyEni) || 0,
        EnergyPercentFastweb: Number(energyPercentFastweb) || 0,
      };
      await postProtectedData('/supermaster/obiettivi-agenti', body);
      toast.success('Obiettivo aggiornato con successo');
      await load();
    }catch(e){ setError(e?.message || 'Errore salvataggio'); } finally { setSaving(false); }
  }

  if (!isSM) return (
    <Card title="Obiettivi Agenti" subtitle="Accesso riservato al SuperMaster">
      <div className="text-sm text-gray-600">Contatta l'amministratore per impostare i tuoi obiettivi.</div>
    </Card>
  );

  const monthLabels = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

  return (
    <Card title="Obiettivi Agenti" subtitle="Imposta i target mensili per Fisso, Mobile (RA) ed Energy per singolo Agente">
      {/* Filtro periodo */}
      <div className="flex items-center gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Mese</label>
          <select value={mese} onChange={e=>setMese(Number(e.target.value))} className="border-gray-300 rounded-md text-sm">
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{monthLabels[m-1]} ({String(m).padStart(2,'0')})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Anno</label>
          <input type="number" value={anno} onChange={e=>setAnno(Number(e.target.value))} className="border-gray-300 rounded-md text-sm w-24" />
        </div>
        <button onClick={load} className="ml-auto px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50">Aggiorna</button>
      </div>

      {/* Form upsert */}
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <Field label="Agente" className="lg:col-span-2">
            <select value={agente} onChange={e=>setAgente(e.target.value)} className="border-gray-300 rounded-md text-sm">
              {AGENTI.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Note" className="lg:col-span-3">
            <input value={note} onChange={e=>setNote(e.target.value)} className="border rounded-md px-2 py-1 text-sm" placeholder="Opzionale" />
          </Field>
          <div className="lg:col-span-1 flex items-end">
            <button onClick={onSave} disabled={saving} className="w-full px-3 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-60">{saving ? 'Salvo…' : 'Aggiorna Obiettivi'}</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <FieldGroup title="Fissi" columns={4}>
            <Field label="Totali">
              <input type="number" min="0" value={fissoTotale} onChange={e=>setFissoTotale(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Start">
              <input type="number" min="0" value={fissoStart} onChange={e=>setFissoStart(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Pro">
              <input type="number" min="0" value={fissoPro} onChange={e=>setFissoPro(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Ultra">
              <input type="number" min="0" value={fissoUltra} onChange={e=>setFissoUltra(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
          </FieldGroup>

          <FieldGroup title="Mobili" columns={6}>
            <Field label="Totali">
              <input type="number" min="0" value={mobileTotale} onChange={e=>setMobileTotale(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Start">
              <input type="number" min="0" value={mobileStart} onChange={e=>setMobileStart(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Pro">
              <input type="number" min="0" value={mobilePro} onChange={e=>setMobilePro(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Ultra">
              <input type="number" min="0" value={mobileUltra} onChange={e=>setMobileUltra(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="% RA richiesta">
              <input type="number" min="0" max="100" step="0.01" value={mobilePercentRA} onChange={e=>setMobilePercentRA(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Convergenze">
              <input type="number" min="0" value={mobileConvergenze} onChange={e=>setMobileConvergenze(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
          </FieldGroup>

          <FieldGroup title="Energy" columns={6}>
            <Field label="Totali">
              <input type="number" min="0" value={energyTotale} onChange={e=>setEnergyTotale(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Core (FW)">
              <input type="number" min="0" value={energyCore} onChange={e=>setEnergyCore(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Flex (FW)">
              <input type="number" min="0" value={energyFlex} onChange={e=>setEnergyFlex(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="Fix (FW)">
              <input type="number" min="0" value={energyFix} onChange={e=>setEnergyFix(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="ENI">
              <input type="number" min="0" value={energyEni} onChange={e=>setEnergyEni(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
            </Field>
            <Field label="% FW minima">
              <input type="number" min="0" max="100" step="0.01" value={energyPercentFastweb} onChange={e=>setEnergyPercentFastweb(e.target.value)} className="border rounded-md px-2 py-1 text-sm" placeholder="es. 20" />
            </Field>
          </FieldGroup>
        </div>

        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>

      {/* Tabella obiettivi correnti */}
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-2 py-1" rowSpan={2}>Agente</th>
              <th className="text-center px-2 py-1" colSpan={4}>Fissi</th>
              <th className="text-center px-2 py-1" colSpan={6}>Mobili</th>
              <th className="text-center px-2 py-1" colSpan={6}>Energy</th>
              <th className="px-2 py-1" rowSpan={2}>Note</th>
              <th className="px-2 py-1" rowSpan={2}>Ultima Modifica</th>
            </tr>
            <tr className="bg-gray-100 text-xs text-gray-600">
              <th className="text-right px-2 py-1">Totali</th>
              <th className="text-right px-2 py-1">Start</th>
              <th className="text-right px-2 py-1">Pro</th>
              <th className="text-right px-2 py-1">Ultra</th>
              <th className="text-right px-2 py-1">Totali</th>
              <th className="text-right px-2 py-1">Start</th>
              <th className="text-right px-2 py-1">Pro</th>
              <th className="text-right px-2 py-1">Ultra</th>
              <th className="text-right px-2 py-1">% RA</th>
              <th className="text-right px-2 py-1">Convergenze</th>
              <th className="text-right px-2 py-1">Totali</th>
              <th className="text-right px-2 py-1">Core</th>
              <th className="text-right px-2 py-1">Flex</th>
              <th className="text-right px-2 py-1">Fix</th>
              <th className="text-right px-2 py-1">ENI</th>
              <th className="text-right px-2 py-1">% FW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td className="px-2 py-3 text-center text-gray-500" colSpan={17}>Caricamento…</td></tr>
            ) : (rows && rows.length ? rows.map((r,i)=> (
              <tr key={i}>
                <td className="px-2 py-1 whitespace-nowrap">{r.Agente}</td>
                <td className="px-2 py-1 text-right">{r.FissoTotale ?? r.ObiettivoPDAFisso ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.FissoStart ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.FissoPro ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.FissoUltra ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.MobileTotale ?? r.ObiettivoPDAMobileRA ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.MobileStart ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.MobilePro ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.MobileUltra ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.MobilePercentRA != null ? Number(r.MobilePercentRA).toFixed(2) + '%' : '0%'}</td>
                <td className="px-2 py-1 text-right">{r.MobileConvergenze ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.EnergyTotale ?? r.ObiettivoPDAEnergy ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.EnergyCore ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.EnergyFlex ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.EnergyFix ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.EnergyEni ?? 0}</td>
                <td className="px-2 py-1 text-right">{r.EnergyPercentFastweb != null ? Number(r.EnergyPercentFastweb).toFixed(2) + '%' : '0%'}</td>
                <td className="px-2 py-1">{r.Note || '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{r.DataUltimaModifica || '-'}</td>
              </tr>
            )) : (
              <tr><td className="px-2 py-3 text-center text-gray-500" colSpan={19}>Nessun obiettivo per il periodo selezionato</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
