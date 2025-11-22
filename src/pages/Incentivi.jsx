import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { useElevatedToken } from '../hooks/useElevatedToken';
import { usePianiIncentivi } from '../hooks/usePianiIncentivi';
import { mfaEnroll, mfaVerifyEnrollment, mfaStatus, mfaReset } from '../services/api';

function fmtPeriod(p) {
  if (p?.periodo_label) return p.periodo_label;
  const m = p?.mese ? String(p.mese).padStart(2, '0') : null;
  const y = p?.anno ?? null;
  return m && y ? `${m}/${y}` : '—';
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('it-IT'); } catch { return String(d); }
}

function OperatoreSelect({ operators = [], value, onChange }) {
  return (
    <select className="border rounded-md px-2 py-1 text-sm" value={value} onChange={(e)=>onChange(e.target.value)}>
      <option value="">Tutti gli operatori</option>
      {operators.map(op => <option key={op} value={op}>{op}</option>)}
    </select>
  );
}

function PeriodoSelect({ value, onChange, options }) {
  const opts = Array.isArray(options) ? options : [];
  return (
    <select className="border rounded-md px-2 py-1 text-sm" value={value} onChange={(e)=>onChange(e.target.value)}>
      {opts.map(lbl => <option key={lbl} value={lbl}>{lbl}</option>)}
    </select>
  );
}

function MonthSelect({ value, onChange, options }) {
  const labels = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const opts = Array.isArray(options) && options.length ? options : Array.from({length:12}, (_,i)=>i+1);
  return (
    <select className="border rounded-md px-2 py-1 text-sm" value={value} onChange={(e)=>onChange(Number(e.target.value))}>
      {opts.map(m => <option key={m} value={m}>{labels[m-1]} ({String(m).padStart(2,'0')})</option>)}
    </select>
  );
}

function YearSelect({ value, onChange, options }) {
  const yearNow = new Date().getFullYear();
  const fallback = [yearNow-1, yearNow, yearNow+1];
  const opts = Array.isArray(options) && options.length ? options : fallback;
  return (
    <select className="border rounded-md px-2 py-1 text-sm" value={value} onChange={(e)=>onChange(Number(e.target.value))}>
      {opts.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}

function DocumentoCard({ piano }) {
  return (
    <div className="rounded-lg border border-gray-100 p-4 flex flex-col">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-gray-500">Periodo</div>
          <div className="text-sm font-medium text-gray-900">{fmtPeriod(piano)}</div>
        </div>
        <div className="text-blue-600">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M6 2a2 2 0 0 0-2 2v16l8-4 8 4V4a2 2 0 0 0-2-2H6Z"/></svg>
        </div>
      </div>
      <div className="mt-2 text-sm text-gray-700 line-clamp-2">{piano?.nome_file || 'Documento'}</div>
      <div className="mt-2 text-xs text-gray-500">Validità: {fmtDate(piano?.validita_dal)} → {fmtDate(piano?.validita_al)}</div>
      <div className="mt-auto pt-3">
        <a className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm" href={piano?.url_s3 || '#'} target="_blank" rel="noopener noreferrer">
          Apri / Scarica
        </a>
      </div>
    </div>
  );
}

function IncentiviGrid({ items = [] }) {
  if (!items.length) return <div className="text-sm text-gray-500 py-6">Nessun piano disponibile per l'operatore selezionato.</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((p, idx) => <DocumentoCard key={idx} piano={p} />)}
    </div>
  );
}

function MFATotpModal({ open, onSubmit, onCancel, onNeedEnroll, loading, enrolled }) {
  const [code, setCode] = useState('');
  const [loadingReset, setLoadingReset] = useState(false);
  useEffect(()=>{ if (!open) setCode(''); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-lg w-full max-w-sm p-5">
        <div className="text-lg font-semibold text-gray-900">Verifica TOTP</div>
        <div className="text-sm text-gray-600 mt-1">
          Inserisci il codice OTP a 6 cifre per accedere ai Piani Incentivi.
        </div>
        <div className="mt-2 text-xs text-gray-600 flex items-center gap-3">
          <button type="button" className="underline" onClick={()=>onNeedEnroll?.()}>Non hai ancora configurato l’OTP? Abilitalo ora</button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            className={`underline ${enrolled ? 'text-rose-700' : 'text-gray-400 cursor-not-allowed'}`}
            disabled={!enrolled}
            onClick={async ()=>{
              try { await mfaReset(); onNeedEnroll?.(); } catch { alert('Errore durante il reset OTP'); }
            }}
          >Hai dimenticato l’OTP? Reimposta</button>
        </div>
        {!enrolled && (
          <div className="mt-2 rounded-md bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
            <div className="font-medium mb-1">Come attivare l’OTP</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>Installa un’app Authenticator (Google, Microsoft, Authy, 1Password…)</li>
              <li>Clicca su <button type="button" className="underline font-medium" onClick={()=>onNeedEnroll?.()}>Abilita OTP</button> per aprire il QR Code</li>
              <li>Nell’app, “Aggiungi account” → “Scansiona QR” e conferma</li>
              <li>Inserisci qui il codice a 6 cifre mostrato dall’app</li>
            </ol>
          </div>
        )}
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e)=>setCode(e.target.value.replace(/\D/g,''))}
          className="mt-4 w-full border rounded-md px-3 py-2 text-center tracking-widest text-lg"
          placeholder="••••••"
        />
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm border rounded-md">Annulla</button>
          <div className="flex items-center gap-2">
            {enrolled && (
              <button
                type="button"
                disabled={loadingReset}
                onClick={async ()=>{
                  try {
                    setLoadingReset(true);
                    await mfaReset();
                    // Apri enrollment per rifare l'associazione
                    onNeedEnroll?.();
                  } catch (e) {
                    alert('Errore durante il reset OTP');
                  } finally { setLoadingReset(false); }
                }}
                className="px-3 py-1.5 text-sm border rounded-md text-rose-700 border-rose-200 hover:bg-rose-50 disabled:opacity-60"
                title="Reimposta OTP e rifai associazione"
              >{loadingReset ? 'Reimposto…' : 'Reimposta OTP'}</button>
            )}
            {!enrolled && (
              <button type="button" onClick={()=>onNeedEnroll?.()} className="px-3 py-1.5 text-sm border rounded-md">
                Abilita OTP
              </button>
            )}
            <button disabled={loading || code.length!==6} onClick={()=>onSubmit(code)} className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white disabled:opacity-60">
            {loading ? 'Verifica…' : 'Verifica'}
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
}

function MFAEnrollModal({ open, onClose }) {
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null); // { otpauth, secret }
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoading(true);
        const res = await mfaEnroll();
        setData(res);
      } catch (e) {
        console.error('Enroll MFA error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg w-full max-w-md p-5">
        <div className="text-lg font-semibold text-gray-900">Abilita OTP (TOTP)</div>
        {loading ? (
          <div className="py-8 text-sm text-gray-500">Caricamento…</div>
        ) : (
          <>
            <div className="mt-2 text-sm text-gray-600">Scansiona il QR con l'app Authenticator e inserisci il codice di verifica.</div>
            <div className="mt-3 flex items-center gap-4">
              <img src={`/api/mfa/totp/qr?otpauth=${encodeURIComponent(data?.otpauth || '')}`} alt="QR TOTP" className="w-40 h-40 border rounded" />
              <div className="text-xs text-gray-600">
                <div className="font-medium text-gray-900">Secret</div>
                <div className="select-all break-all">{data?.secret || '-'}</div>
              </div>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e)=>setCode(e.target.value.replace(/\D/g,''))}
              className="mt-4 w-full border rounded-md px-3 py-2 text-center tracking-widest text-lg"
              placeholder="••••••"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md">Chiudi</button>
              <button
                className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-60"
                disabled={code.length!==6}
                onClick={async ()=>{
                  try {
                    setLoading(true);
                    const res = await mfaVerifyEnrollment(code);
                    if (res?.ok) setEnrolled(true);
                  } catch (e) {
                    console.error('Verify enrollment error', e);
                  } finally {
                    setLoading(false);
                  }
                }}
              >Verifica</button>
            </div>
            {enrolled && <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">Verifica riuscita! OTP abilitato.</div>}
          </>
        )}
      </div>
    </div>
  );
}

export default function Incentivi() {
  const { user, logout } = useAuth();
  const role = (user?.role || '').toString().toLowerCase();
  const isDealer = role === 'dealer';
  const isAllowed = isDealer || role === 'agente' || role === 'agent' || role === 'attivazioni' || role === 'masterprodotti' || role === 'master_prodotti' || role === 'master' || role === 'supermaster';
  const { elevatedToken, hasValidToken, checking, request } = useElevatedToken();
  const { piani, loading, error, load, operators } = usePianiIncentivi();

  const [selectedOperator, setSelectedOperator] = useState('');
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1..12
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [showTotp, setShowTotp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);

  // Load persisted filters on mount
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem('incentivi_filters');
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (typeof saved.operator === 'string') setSelectedOperator(saved.operator);
        if (saved.month) setSelectedMonth(Number(saved.month));
        if (saved.year) setSelectedYear(Number(saved.year));
      }
    } catch (e) {
      // ignore parsing errors
    }
  }, []);

  // Persist filters on change
  useEffect(() => {
    try {
      const payload = { operator: selectedOperator, month: selectedMonth, year: selectedYear };
      localStorage.setItem('incentivi_filters', JSON.stringify(payload));
    } catch (e) {
      // ignore storage errors
    }
  }, [selectedOperator, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!isAllowed) {
      window.location.href = '/login';
      return;
    }
  }, [isAllowed]);

  useEffect(() => {
    // Dealer: enforce TOTP step-up; Others: load with base token
    (async () => {
      if (checking) return;
      try {
        if (isDealer) {
          // interroga lo stato enrollment per mostrare/nascondere il bottone Abilita OTP
          try {
            const st = await mfaStatus();
            setMfaEnrolled(!!st?.enrolled);
          } catch {}
          if (!hasValidToken) {
            setShowTotp(true);
            return;
          }
          await load(elevatedToken);
        } else {
          // Agents/Attivazioni can call with base token (backend must allow)
          await load(null);
        }
      } catch (e) {
        console.error('Load piani error:', e);
      }
    })();
  }, [checking, hasValidToken, elevatedToken, isDealer, load]);

  const welcomeName = useMemo(() => {
    return user?.dealerName || user?.agenteNome || user?.name || user?.email || 'Utente';
  }, [user]);

  const monthOptions = useMemo(() => {
    const set = new Set();
    for (const p of piani) {
      if (p?.mese) set.add(Number(p.mese));
    }
    const arr = Array.from(set).sort((a,b)=>a-b);
    if (!arr.includes(selectedMonth)) arr.push(selectedMonth);
    return arr.sort((a,b)=>a-b);
  }, [piani, selectedMonth]);

  const yearOptions = useMemo(() => {
    const set = new Set();
    for (const p of piani) {
      if (p?.anno) set.add(Number(p.anno));
    }
    const arr = Array.from(set).sort((a,b)=>a-b);
    if (!arr.includes(selectedYear)) arr.push(selectedYear);
    return arr.sort((a,b)=>a-b);
  }, [piani, selectedYear]);

  const fmtPeriodoLabel = (m, y) => `${String(m).padStart(2,'0')}/${y}`;

  const periodoOptions = useMemo(() => {
    const set = new Set();
    for (const p of piani) {
      const lbl = p?.periodo_label || (p?.mese && p?.anno ? fmtPeriodoLabel(p.mese, p.anno) : null);
      if (lbl) set.add(String(lbl));
    }
    // ensure current month/year appears
    set.add(fmtPeriodoLabel(selectedMonth, selectedYear));
    const arr = Array.from(set);
    // sort by YYYY then MM DESC (most recent first)
    arr.sort((a,b) => {
      const [am, ay] = a.split('/').map(Number);
      const [bm, by] = b.split('/').map(Number);
      if (ay !== by) return by - ay;
      return bm - am;
    });
    return arr;
  }, [piani, selectedMonth, selectedYear]);

  const selectedPeriodoLabel = useMemo(() => fmtPeriodoLabel(selectedMonth, selectedYear), [selectedMonth, selectedYear]);

  const filtered = useMemo(() => {
    let list = piani;
    if (selectedOperator) list = list.filter(p => p?.operatore === selectedOperator);
    if (selectedMonth) list = list.filter(p => Number(p?.mese) === Number(selectedMonth));
    if (selectedYear) list = list.filter(p => Number(p?.anno) === Number(selectedYear));
    return list;
  }, [piani, selectedOperator, selectedMonth, selectedYear]);

  return (
    <DashboardLayout title="Piani Incentivi">
      {/* Header */}
      <div className="rounded-2xl bg-white p-4 sm:p-6 shadow-sm mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Piani Incentivi</h1>
              {isDealer && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${mfaEnrolled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                  title={mfaEnrolled ? 'OTP attivo sul tuo account' : 'OTP non configurato'}
                >{mfaEnrolled ? 'OTP attivo' : 'OTP non configurato'}</span>
              )}
              
            </div>
            <p className="text-sm text-gray-600">Benvenuto, <span className="font-medium text-gray-900">{welcomeName}</span></p>
          </div>
          <div className="flex items-center gap-2">
            {isDealer && (
              <>
                <button className="text-sm px-3 py-1.5 border rounded-md" onClick={()=>setShowEnroll(true)}>Abilita OTP</button>
              </>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <OperatoreSelect operators={operators} value={selectedOperator} onChange={setSelectedOperator} />
            <PeriodoSelect
              value={selectedPeriodoLabel}
              onChange={(label) => {
                const [mm, yyyy] = String(label).split('/');
                const m = Number(mm);
                const y = Number(yyyy);
                if (!Number.isNaN(m)) setSelectedMonth(m);
                if (!Number.isNaN(y)) setSelectedYear(y);
              }}
              options={periodoOptions}
            />
          </div>
          <div className="text-xs text-gray-500">{filtered.length} elementi</div>
        </div>

        {/* Loading / Error */}
        {loading && <div className="py-8 text-sm text-gray-500">Caricamento…</div>}
        {error && !loading && <div className="py-8 text-sm text-red-600">{error}</div>}

        {/* Grid */}
        {!loading && !error && (
          <IncentiviGrid items={filtered} />
        )}
      </div>

      {/* Modals */}
      <MFATotpModal
        open={showTotp}
        loading={verifying}
        onCancel={()=>{ setShowTotp(false); window.location.href = '/login'; }}
        onNeedEnroll={()=>{ setShowTotp(false); setShowEnroll(true); }}
        enrolled={mfaEnrolled}
        onSubmit={async (code)=>{
          try {
            setVerifying(true);
            await request(code);
            setShowTotp(false);
            // load after verify
            await load(localStorage.getItem('token_incentivi'));
          } catch (e) {
            console.error('TOTP verify error', e);
            alert('Codice non valido');
          } finally {
            setVerifying(false);
          }
        }}
      />

      <MFAEnrollModal open={showEnroll} onClose={()=>setShowEnroll(false)} />
    </DashboardLayout>
  );
}
