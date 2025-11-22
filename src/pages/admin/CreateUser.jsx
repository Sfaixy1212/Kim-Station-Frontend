import { useState } from 'react';
import { postProtectedData } from '../../services/api';
import toast from 'react-hot-toast';
import AdminTopbar from '../../components/admin/Topbar';

// Piccolo form Admin per creare utenti Station (Dealer o Agente)
// - Dealer: crea record in tbDealers e associa ruolo Identity DEALER
// - Agente: crea record in tbAgenti legato a un Dealer e associa ruolo Identity AGENTE/DEALER in base al ruolo dominio
export default function CreateUser() {
  const [type, setType] = useState('dealer'); // 'dealer' | 'agente'

  // Campi comuni
  const [ragioneSociale, setRagioneSociale] = useState('');
  const [recapitoEmail, setRecapitoEmail] = useState('');
  const [recapitoCell, setRecapitoCell] = useState('');
  // Credenziali Identity
  const [identityEmail, setIdentityEmail] = useState('');
  const [identityPassword, setIdentityPassword] = useState('');

  // Dealer fields
  const [indirizzo, setIndirizzo] = useState('');
  const [cap, setCap] = useState('');
  const [citta, setCitta] = useState('');
  const [provincia, setProvincia] = useState('');
  const [piva, setPiva] = useState('');
  const [riferimento, setRiferimento] = useState('');
  const [tmpPasswd, setTmpPasswd] = useState('');
  const [comsy1, setComsy1] = useState('');
  const [comsy2, setComsy2] = useState('');
  const [agenteVal, setAgenteVal] = useState('');
  const [nomeAgente, setNomeAgente] = useState('ARMANDO');

  // Agente fields
  const [idDealer, setIdDealer] = useState('');
  const [cognome, setCognome] = useState('');
  const [nome, setNome] = useState('');
  const [ruoloAgente, setRuoloAgente] = useState('AGENTE'); // 'AGENTE' | 'OPERATOR' | 'OPERATOR_DEALER'

  const nomeAgenteOptions = ['ARMANDO', 'GIACOMO', 'LUIGI', 'RAFFAELE', 'GABRIELE'];

  const resetForm = () => {
    setRagioneSociale('');
    setRecapitoEmail('');
    setRecapitoCell('');
    setIndirizzo(''); setCap(''); setCitta(''); setProvincia(''); setPiva(''); setRiferimento('');
    setTmpPasswd(''); setComsy1(''); setComsy2(''); setAgenteVal(''); setNomeAgente('ARMANDO');
    setIdDealer(''); setCognome(''); setNome(''); setRuoloAgente('AGENTE');
    setIdentityEmail(''); setIdentityPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (type === 'dealer') {
        // Validazioni minime
        if (!ragioneSociale || !indirizzo || !cap || !citta || !provincia || !piva || !recapitoCell || !recapitoEmail || !tmpPasswd) {
          toast.error('Compila tutti i campi obbligatori del Dealer.');
          return;
        }
        // Email/password Identity: default all'email dealer + tmpPasswd se non specificate
        const emailId = (identityEmail || recapitoEmail || '').trim();
        const pwId = (identityPassword || tmpPasswd || '').trim();
        if (!emailId || !pwId) {
          toast.error('Email e Password Identity sono obbligatorie (usa Password Temporanea se vuoi).');
          return;
        }
        const payload = {
          // Endpoint backend esistente: /api/admin/users
          email: emailId,
          password: pwId,
          role: 'DEALER',
          ragioneSociale,
          cognome,
          nome,
          indirizzo,
          cap,
          citta,
          provincia,
          piva,
          recapitoCell,
          tipologia: 1,
          agente: nomeAgente, // mappa NOME_AGENTE
          idGruppo: 2,
          // campi extra richiesti business
          comsy1,
          comsy2,
          agenteVal,
        };
        const res = await postProtectedData('/admin/users', payload);
        toast.success('Dealer creato con successo');
        resetForm();
      } else {
        // Agente
        if (!idDealer || !ragioneSociale || !cognome || !nome || !recapitoCell || !recapitoEmail || !ruoloAgente) {
          toast.error('Compila tutti i campi obbligatori dell\'Agente.');
          return;
        }
        const emailId = (identityEmail || recapitoEmail || '').trim();
        // Genera password temporanea se non inserita
        const pwId = identityPassword || ('Tmp-' + Math.random().toString(36).slice(2, 8) + 'Aa!');
        const roleIdentity = (ruoloAgente === 'AGENTE') ? 'AGENTE' : 'DEALER';
        const payload = {
          email: emailId,
          password: pwId,
          role: roleIdentity,
          ragioneSociale,
          indirizzo: '',
          cap: '',
          citta: '',
          provincia: '',
          piva: '',
          recapitoCell,
          tipologia: 1,
          agente: nomeAgente,
          idGruppo: 2,
          // Specifici agente
          cognome,
          nome,
          tipologiaAgente: 2,
          ruoloAgente,
        };
        const res = await postProtectedData('/admin/users', payload);
        toast.success('Agente creato con successo');
        resetForm();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Errore durante la creazione');
    }
  };

  return (
    <>
      <AdminTopbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Crea Utente Station</h1>
        <p className="text-sm text-gray-500 mb-6">Accesso riservato Admin. Seleziona il tipo di utente e compila i campi obbligatori.</p>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo Utente</label>
          <div className="flex gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="type" value="dealer" checked={type==='dealer'} onChange={() => setType('dealer')} />
              <span>Dealer</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="type" value="agente" checked={type==='agente'} onChange={() => setType('agente')} />
              <span>Agente</span>
            </label>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campi comuni */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ragione Sociale</label>
              <input value={ragioneSociale} onChange={(e)=>setRagioneSociale(e.target.value)} className="w-full border rounded px-3 py-2" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cognome</label>
              <input value={cognome} onChange={(e)=>setCognome(e.target.value)} className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input value={nome} onChange={(e)=>setNome(e.target.value)} className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={recapitoEmail} onChange={(e)=>setRecapitoEmail(e.target.value)} className="w-full border rounded px-3 py-2" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Identity (accesso)</label>
              <input type="email" value={identityEmail} onChange={(e)=>setIdentityEmail(e.target.value)} placeholder="Lascia vuoto per usare l'email sopra" className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password Identity</label>
              <input type="text" value={identityPassword} onChange={(e)=>setIdentityPassword(e.target.value)} placeholder="Lascia vuoto per generare (Agente) o usa TmpPasswd (Dealer)" className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cellulare</label>
              <input value={recapitoCell} onChange={(e)=>setRecapitoCell(e.target.value)} className="w-full border rounded px-3 py-2" required />
            </div>
          </div>

          {type === 'dealer' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
                  <input value={indirizzo} onChange={(e)=>setIndirizzo(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CAP</label>
                  <input value={cap} onChange={(e)=>setCap(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Città</label>
                  <input value={citta} onChange={(e)=>setCitta(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provincia (2 lettere)</label>
                  <input value={provincia} onChange={(e)=>setProvincia(e.target.value)} maxLength={2} className="w-full border rounded px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">P. IVA</label>
                  <input value={piva} onChange={(e)=>setPiva(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Riferimento (opzionale)</label>
                  <input value={riferimento} onChange={(e)=>setRiferimento(e.target.value)} className="w-full border rounded px-3 py-2" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password Temporanea</label>
                  <input value={tmpPasswd} onChange={(e)=>setTmpPasswd(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">COMSY1</label>
                  <input value={comsy1} onChange={(e)=>setComsy1(e.target.value)} className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">COMSY2</label>
                  <input value={comsy2} onChange={(e)=>setComsy2(e.target.value)} className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">AGENTE (valore business)</label>
                  <input value={agenteVal} onChange={(e)=>setAgenteVal(e.target.value)} className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NOME_AGENTE</label>
                  <select value={nomeAgente} onChange={(e)=>setNomeAgente(e.target.value)} className="w-full border rounded px-3 py-2">
                    {nomeAgenteOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {type === 'agente' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Dealer</label>
                  <input type="number" value={idDealer} onChange={(e)=>setIdDealer(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cognome</label>
                  <input value={cognome} onChange={(e)=>setCognome(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input value={nome} onChange={(e)=>setNome(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ruolo</label>
                  <select value={ruoloAgente} onChange={(e)=>setRuoloAgente(e.target.value)} className="w-full border rounded px-3 py-2">
                    <option value="AGENTE">AGENTE</option>
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="OPERATOR_DEALER">OPERATOR_DEALER</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button type="submit" className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow">
              Crea Utente
            </button>
          </div>
        </form>
        </div>
      </div>
    </>
  );
}
