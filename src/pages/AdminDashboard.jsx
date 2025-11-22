import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/common/Card';
import { useAuth } from '../contexts/AuthContext';
import { getProtectedData, deleteProtectedData, postProtectedData } from '../services/api';
import toast from 'react-hot-toast';
import AdminTopbar from '../components/admin/Topbar';

// Dashboard Admin minimale: solo card di creazione utente
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [suggest, setSuggest] = useState([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [dealerId, setDealerId] = useState('');
  const [ragSoc, setRagSoc] = useState('');
  const [force, setForce] = useState(false);
  const [phrase, setPhrase] = useState('');
  const typingRef = useRef(null);
  const [deps, setDeps] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Debounce ricerca
  useEffect(() => {
    if (!q || q.trim().length < 2) { setSuggest([]); return; }
    setLoadingSuggest(true);
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(async () => {
      try {
        const res = await getProtectedData(`/admin/dealers/search?q=${encodeURIComponent(q.trim())}`);
        setSuggest(Array.isArray(res) ? res : []);
      } catch (e) {
        console.error(e);
        toast.error('Errore ricerca dealer');
      } finally {
        setLoadingSuggest(false);
      }
    }, 300);
    return () => clearTimeout(typingRef.current);
  }, [q]);

  async function handleReactivate() {
    const id = parseInt(dealerId, 10);
    if (!Number.isInteger(id) || id <= 0) { toast.error('IDDealer non valido'); return; }
    const loadingId = toast.loading('Riattivazione in corso...');
    try {
      const res = await postProtectedData(`/admin/users/${id}/reactivate`, {});
      toast.success('Utente riattivato');
      // Reset parziale
      setPhrase(''); setForce(false);
      console.log('[REACTIVATE][OK]', res);
    } catch (e) {
      console.error('[REACTIVATE][ERR]', e);
      toast.error('Errore durante la riattivazione');
    } finally {
      toast.dismiss(loadingId);
    }
  }

  async function handleSoftDelete() {
    const id = parseInt(dealerId, 10);
    if (!Number.isInteger(id) || id <= 0) { toast.error('IDDealer non valido'); return; }
    const loadingId = toast.loading('Disattivazione in corso...');
    try {
      const res = await postProtectedData(`/admin/users/${id}/soft-delete`, {});
      toast.success('Utente disattivato (soft delete)');
      // Reset parziale
      setPhrase(''); setForce(false);
      console.log('[SOFT_DELETE][OK]', res);
    } catch (e) {
      console.error('[SOFT_DELETE][ERR]', e);
      toast.error('Errore durante la disattivazione');
    } finally {
      toast.dismiss(loadingId);
    }
  }

  function handlePick(d) {
    setDealerId(String(d.IDDealer || ''));
    setRagSoc(String(d.RagioneSociale || ''));
    setQ('');
    setSuggest([]);
    setPhrase(`DELETE DEALER ${d.IDDealer}`);
  }

  async function handleHardDelete() {
    const id = parseInt(dealerId, 10);
    if (!Number.isInteger(id) || id <= 0) { toast.error('IDDealer non valido'); return; }
    const expected = `DELETE DEALER ${id}`;
    if (phrase !== expected) { toast.error('Frase di conferma non corretta'); return; }
    // 1) Preleva deps e mostra conferma
    try {
      const d = await getProtectedData(`/admin/users/${id}/deps`);
      setDeps(d?.deps || { ordini: 0, transazioni: 0, agenti: 0 });
      setShowConfirm(true);
    } catch (e) {
      console.error('[DEPS][ERR]', e);
      toast.error('Errore nel recupero dipendenze');
    }
  }

  async function confirmHardDelete() {
    const id = parseInt(dealerId, 10);
    const loadingId = toast.loading('Eliminazione in corso...');
    try {
      const res = await deleteProtectedData(`/admin/users/${id}/hard-delete?force=${force ? 'true' : 'false'}`, {
        confirm: true,
        phrase
      });
      toast.success('Utente eliminato definitivamente');
      // Reset form
      setDealerId(''); setRagSoc(''); setPhrase(''); setForce(false); setDeps(null); setShowConfirm(false);
      console.log('[HARD_DELETE][OK]', res);
    } catch (e) {
      console.error('[HARD_DELETE][ERR]', e);
      const msg = String(e?.message || 'Errore').toLowerCase();
      if (msg.includes('409')) {
        toast.error('Dipendenze presenti (ordini/transazioni). Abilita Force per procedere.');
      } else {
        toast.error('Errore durante l\'eliminazione');
      }
    } finally {
      toast.dismiss(loadingId);
    }
  }
  return (
    <>
      <AdminTopbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Dashboard Admin</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Pannello di amministrazione e gestione utenti</p>
        </div>

        <Card title="Creazione Utente Station" subtitle="Crea rapidamente un Dealer o un Agente">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Compila il form dedicato per inserire i dati e assegnare il ruolo corretto (Dealer o Agente).
          </div>
          <NavLink to="/admin/users/create" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow text-sm">Apri form</NavLink>
        </div>
      </Card>

      <div className="mt-6" />
      <Card title="Import Dati" subtitle="FW Energia, RA e TLC giornaliero">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Gestisci tutti gli import da un'unica interfaccia con tab dedicati per FW Energia, Import RA e TLC giornaliero (INSERITO KIM).
          </div>
          <NavLink to="/admin/imports" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow text-sm">Apri Import</NavLink>
        </div>
      </Card>

      <div className="mt-6" />
      <Card title="Elimina Utente (Hard Delete)" subtitle="Operazione irreversibile. Richiede doppia conferma.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cerca per Ragione Sociale</label>
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Inserisci almeno 2 caratteri..." className="w-full border rounded px-3 py-2" />
            {loadingSuggest && <div className="text-xs text-gray-500 mt-1">Ricerca...</div>}
            {!!suggest.length && (
              <div className="mt-2 border rounded divide-y overflow-hidden">
                {suggest.map((d)=> (
                  <button key={d.IDDealer} type="button" onClick={()=>handlePick(d)} className="w-full text-left px-3 py-2 hover:bg-gray-50">
                    <div className="text-sm font-medium text-gray-900">{d.RagioneSociale}</div>
                    <div className="text-xs text-gray-600">IDDealer: {d.IDDealer} • {d.RecapitoEmail}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IDDealer</label>
              <input value={dealerId} onChange={(e)=>setDealerId(e.target.value)} className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ragione Sociale (solo informativa)</label>
              <input value={ragSoc} onChange={(e)=>setRagSoc(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="Facoltativo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frase di conferma</label>
              <input value={phrase} onChange={(e)=>setPhrase(e.target.value)} className="w-full border rounded px-3 py-2" placeholder={dealerId ? `DELETE DEALER ${dealerId}` : 'DELETE DEALER <ID>'} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={force} onChange={(e)=>setForce(e.target.checked)} />
              Forza eliminazione (se esistono ordini/transazioni)
            </label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleHardDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded shadow text-sm">Elimina definitivamente</button>
              <button type="button" onClick={handleSoftDelete} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded shadow text-sm">Soft delete</button>
              <button type="button" onClick={handleReactivate} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded shadow text-sm">Riattiva utente</button>
            </div>
          </div>
        </div>
      </Card>

      {/* Modale di conferma */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="px-5 py-4 border-b">
              <h3 className="text-base font-semibold text-gray-900">Conferma eliminazione definitiva</h3>
              <p className="text-xs text-gray-500">IDDealer: {dealerId} • {ragSoc || '—'}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-sm text-gray-700">Dipendenze rilevate:</div>
              <ul className="text-sm text-gray-800 list-disc pl-6">
                <li>Ordini: {deps?.ordini ?? 0}</li>
                <li>Transazioni: {deps?.transazioni ?? 0}</li>
                <li>Agenti: {deps?.agenti ?? 0}</li>
              </ul>
              <div className="text-xs text-gray-500">Questa operazione è irreversibile. Gli ordini e le transazioni non saranno cancellati.</div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={force} onChange={(e)=>setForce(e.target.checked)} />
                Forza eliminazione (se esistono ordini/transazioni)
              </label>
              <div className="text-sm text-gray-700">
                Digita la frase di conferma: <code className="px-1 py-0.5 bg-gray-100 rounded">DELETE DEALER {dealerId}</code>
              </div>
              <input value={phrase} onChange={(e)=>setPhrase(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
              <button onClick={()=>{ setShowConfirm(false); }} className="px-3 py-2 text-sm rounded bg-gray-100 hover:bg-gray-200">Annulla</button>
              <button onClick={confirmHardDelete} className="px-3 py-2 text-sm rounded bg-red-600 hover:bg-red-700 text-white">Conferma elimina</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
