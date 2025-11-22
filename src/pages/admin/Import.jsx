import { useState } from 'react';
import Card from '../../components/common/Card';
import { postFormData, postProtectedData } from '../../services/api';
import toast from 'react-hot-toast';
import AdminTopbar from '../../components/admin/Topbar';

export default function AdminImport() {
  const [activeTab, setActiveTab] = useState('energia'); // 'energia' | 'ra' | 'tlc' | 'fisso' | 'popola'

  return (
    <>
      <AdminTopbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Import Dati</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gestione import FW Energia, RA, TLC giornaliero, FISSI e popolamento tipo daily</p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex gap-4 flex-wrap">
            <button
              onClick={() => setActiveTab('energia')}
              className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'energia'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              FW Energia
            </button>
            <button
              onClick={() => setActiveTab('ra')}
              className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'ra'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Import RA
            </button>
            <button
              onClick={() => setActiveTab('tlc')}
              className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'tlc'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              TLC Giornaliero
            </button>
            <button
              onClick={() => setActiveTab('fisso')}
              className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'fisso'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Update FISSI
            </button>
            <button
              onClick={() => setActiveTab('popola')}
              className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'popola'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Popola Tipo Daily
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'energia' && <ImportEnergiaTab />}
        {activeTab === 'ra' && <ImportRATab />}
        {activeTab === 'tlc' && <ImportTLCTab />}
        {activeTab === 'fisso' && <ImportFissoTab />}
        {activeTab === 'popola' && <PopolaTipoDailyTab />}
      </div>
    </>
  );
}

// ============ TAB 1: FW ENERGIA ============
function ImportEnergiaTab() {
  const [file, setFile] = useState(null);
  const [batchDate, setBatchDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!file) { toast.error('Seleziona un file (.xlsx/.xls/.csv)'); return; }
    if (!batchDate) { toast.error('Seleziona la Data validità (Batch)'); return; }
    setUploading(true);
    setResult(null);
    const loadingId = toast.loading('Import in corso…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('batchDate', batchDate);
      const res = await postFormData('/admin/imports/fw-energia/commit', fd);
      setResult(res);
      toast.success(`Import completato: ${res?.inserted || 0} inseriti`);
    } catch (e) {
      console.error('[FW IMPORT][ERR]', e);
      toast.error(e?.message || 'Errore durante import');
    } finally {
      toast.dismiss(loadingId);
      setUploading(false);
    }
  };

  return (
    <Card title="Import FW Energia" subtitle="Carica il file giornaliero (.xlsx/.xls/.csv) e imposta la Data validità (Batch)">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File (.xlsx/.xls/.csv)</label>
          <input 
            type="file" 
            accept=".xlsx,.xls,.csv" 
            onChange={(e) => setFile(e.target.files?.[0] || null)} 
            className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300" 
          />
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Il file è incrementale: importeremo tutte le righe in append.</div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data validità (Batch)</label>
          <input 
            type="date" 
            value={batchDate} 
            onChange={(e) => setBatchDate(e.target.value)} 
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded px-3 py-2 text-sm" 
          />
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Esempio: 2025-09-13</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button 
          type="button" 
          disabled={uploading} 
          onClick={handleImport} 
          className={`px-4 py-2 rounded-md text-white text-sm ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {uploading ? 'Elaborazione…' : 'Importa'}
        </button>
        <button 
          type="button" 
          disabled={uploading} 
          onClick={() => { setFile(null); setBatchDate(''); setResult(null); }} 
          className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
        >
          Reset
        </button>
      </div>
      {result && (
        <div className="mt-3 text-xs text-gray-700 dark:text-gray-300">
          <div>Inseriti: <span className="font-semibold">{result.inserted ?? 0}</span></div>
          {result.updated !== undefined && <div>Aggiornati: <span className="font-semibold">{result.updated ?? 0}</span></div>}
        </div>
      )}
    </Card>
  );
}

// ============ TAB 2: IMPORT RA ============
function ImportRATab() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!file) { toast.error('Seleziona un file (.xlsx/.xls)'); return; }
    setUploading(true);
    setResult(null);
    const loadingId = toast.loading('Import RA in corso… Questo può richiedere alcuni minuti.');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await postFormData('/admin/imports/inseritofw/commit', fd);
      setResult(res);
      
      if (res.success) {
        toast.success(`Import RA completato! ${res.rows_imported || 0} righe importate`);
        if (Array.isArray(res?.columns_missing) && res.columns_missing.length) {
          toast(`${res.columns_missing.length} colonne mancanti nel file (ignorate)`, { icon: '⚠️' });
        }
      } else {
        toast.error(`Import fallito: ${res.error || 'Errore sconosciuto'}`);
      }
    } catch (e) {
      console.error('[IMPORT RA][ERR]', e);
      toast.error(e?.message || 'Errore durante import RA');
    } finally {
      toast.dismiss(loadingId);
      setUploading(false);
    }
  };

  return (
    <Card title="Import RA (Mobile)" subtitle="Carica file TLC Mobile RA (.xlsx/.xls). Aggiorna colonne Mobile in InseritoFW tramite staging CartelStaging.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File (.xlsx/.xls)</label>
          <input 
            type="file" 
            accept=".xlsx,.xls" 
            onChange={(e) => setFile(e.target.files?.[0] || null)} 
            className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300" 
          />
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Colonne richieste: usim pay type, stato post mobile, customer no, ecc. Le colonne mancanti vengono ignorate.</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button 
          type="button" 
          disabled={uploading} 
          onClick={handleImport} 
          className={`px-4 py-2 rounded-md text-white text-sm ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {uploading ? 'Elaborazione…' : 'Importa'}
        </button>
        <button 
          type="button" 
          disabled={uploading} 
          onClick={() => { setFile(null); setResult(null); }} 
          className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
        >
          Reset
        </button>
      </div>
      {result && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
          {result.success ? (
            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span className="font-semibold">Importazione completata con successo</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>File: <span className="font-semibold">{result.file || '—'}</span></div>
                <div>Righe importate: <span className="font-semibold">{result.rows_imported ?? 0}</span></div>
                <div>Colonne trovate: <span className="font-semibold">{result.columns_found?.length ?? 0}</span></div>
                <div>Timestamp: <span className="font-semibold">{result.timestamp ? new Date(result.timestamp).toLocaleString('it-IT') : '—'}</span></div>
              </div>
              {Array.isArray(result.columns_missing) && result.columns_missing.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                  <div className="font-medium text-yellow-800 dark:text-yellow-300">⚠️ Colonne mancanti (ignorate):</div>
                  <div className="text-xs mt-1 text-yellow-700 dark:text-yellow-400">{result.columns_missing.join(', ')}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-red-700 dark:text-red-400">
              <div className="flex items-center gap-2">
                <span>✗</span>
                <span className="font-semibold">Errore durante importazione</span>
              </div>
              <div className="text-xs">{result.error || 'Errore sconosciuto'}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ============ TAB 3: TLC GIORNALIERO ============
function ImportTLCTab() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [inspect, setInspect] = useState(null);

  const handleImport = async () => {
    if (!file) { toast.error('Seleziona un file (.xlsx)'); return; }
    setUploading(true);
    setResult(null);
    const loadingId = toast.loading('Import TLC (INSERITO KIM) in corso… Questo può richiedere alcuni minuti.');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await postFormData('/admin/imports/inseritofw-full/commit', fd);
      setResult(res);
      
      if (res.success) {
        const sheetsRemoved = res.removed_sheets?.length > 0 ? ` • Fogli rimossi: ${res.removed_sheets.join(', ')}` : '';
        toast.success(`Import completato! File: ${res.file || '—'}${sheetsRemoved}`);
      } else {
        toast.error(`Import fallito: ${res.error || 'Errore sconosciuto'}`);
      }
    } catch (e) {
      console.error('[IMPORT INSERITOFW FULL][ERR]', e);
      toast.error(e?.message || 'Errore durante import TLC');
    } finally {
      toast.dismiss(loadingId);
      setUploading(false);
    }
  };

  const handleInspect = async () => {
    if (!file) { toast.error('Seleziona un file (.xlsx)'); return; }
    setUploading(true);
    setInspect(null);
    const loadingId = toast.loading('Lettura intestazioni (INSERITO KIM)…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await postFormData('/admin/imports/inseritofw-full/inspect-upload', fd);
      setInspect(res);
      toast.success(`Sheet: ${res?.sheet || '—'} • ${res?.headers?.length ?? 0} colonne`);
    } catch (e) {
      console.error('[INSPECT INSERITOFW FULL][ERR]', e);
      toast.error(e?.message || 'Errore durante inspect');
    } finally {
      toast.dismiss(loadingId);
      setUploading(false);
    }
  };

  return (
    <Card title="Import TLC giornaliero (INSERITO KIM)" subtitle="Carica il file Excel. I fogli PIVOT, INCASSI, COMSY e PIANI verranno rimossi automaticamente prima dell'import.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File (.xlsx)</label>
          <input 
            type="file" 
            accept=".xlsx" 
            onChange={(e) => setFile(e.target.files?.[0] || null)} 
            className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300" 
          />
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">L'importer .NET processerà il file e inserirà i dati nel database.</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button 
          type="button" 
          disabled={uploading} 
          onClick={handleInspect} 
          className={`px-4 py-2 rounded-md text-white text-sm ${uploading ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
        >
          {uploading ? 'Lettura…' : 'Inspect intestazioni'}
        </button>
        <button 
          type="button" 
          disabled={uploading} 
          onClick={handleImport} 
          className={`px-4 py-2 rounded-md text-white text-sm ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {uploading ? 'Elaborazione…' : 'Importa'}
        </button>
        <button 
          type="button" 
          disabled={uploading} 
          onClick={() => { setFile(null); setResult(null); setInspect(null); }} 
          className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
        >
          Reset
        </button>
      </div>
      {inspect && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300">
          <div className="font-semibold mb-1">Intestazioni ({inspect.headers?.length ?? 0})</div>
          <div className="overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(inspect.headers || [], null, 2)}</div>
          {Array.isArray(inspect.preview) && inspect.preview.length > 0 && (
            <>
              <div className="font-semibold mt-3 mb-1">Anteprima prime {inspect.previewCount} righe</div>
              <div className="overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(inspect.preview, null, 2)}</div>
            </>
          )}
        </div>
      )}
      {result && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
          {result.success ? (
            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span className="font-semibold">Importazione completata con successo</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>File: <span className="font-semibold">{result.file || '—'}</span></div>
                <div>Timestamp: <span className="font-semibold">{result.timestamp ? new Date(result.timestamp).toLocaleString('it-IT') : '—'}</span></div>
                {result.removed_sheets && result.removed_sheets.length > 0 && (
                  <div className="col-span-2">Fogli rimossi: <span className="font-semibold">{result.removed_sheets.join(', ')}</span></div>
                )}
              </div>
              {result.importer_output && (
                <div className="mt-3 p-2 bg-white dark:bg-gray-900 rounded text-xs font-mono whitespace-pre-wrap">
                  {result.importer_output}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-red-700 dark:text-red-400">
              <div className="flex items-center gap-2">
                <span>✗</span>
                <span className="font-semibold">Errore durante importazione</span>
              </div>
              <div className="text-xs">{result.error || 'Errore sconosciuto'}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
// ============ TAB 4: UPDATE FISSI ============
function ImportFissoTab() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!file) { toast.error('Seleziona un file (.xlsx/.xls)'); return; }
    setUploading(true);
    setResult(null);
    const loadingId = toast.loading('Update FISSI in corso…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await postFormData('/admin/imports/fisso/commit', fd);
      setResult(res);
      
      if (res.success) {
        toast.success(`Update FISSI completato\! ${res.rows_imported || 0} righe importate`);
      } else {
        toast.error(`Update fallito: ${res.error || 'Errore sconosciuto'}`);
      }
    } catch (e) {
      console.error('[IMPORT FISSO][ERR]', e);
      toast.error(e?.message || 'Errore durante update FISSI');
    } finally {
      toast.dismiss(loadingId);
      setUploading(false);
    }
  };

  return (
    <Card title="Update FISSI (Offer Group)" subtitle="Carica file Excel con colonne: customer no, customer first ord offer group. Aggiorna InseritoFW tramite staging CartelStagingOfferGroup.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File (.xlsx/.xls)</label>
          <input 
            type="file" 
            accept=".xlsx,.xls" 
            onChange={(e) => setFile(e.target.files?.[0] || null)} 
            className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300" 
          />
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Solo 2 colonne richieste: customer no (chiave) e customer first ord offer group (valore).</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button 
          type="button" 
          disabled={uploading} 
          onClick={handleImport} 
          className={`px-4 py-2 rounded-md text-white text-sm ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {uploading ? 'Elaborazione…' : 'Importa'}
        </button>
        <button 
          type="button" 
          disabled={uploading} 
          onClick={() => { setFile(null); setResult(null); }} 
          className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
        >
          Reset
        </button>
      </div>
      {result && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
          {result.success ? (
            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span className="font-semibold">Update completato con successo</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>File: <span className="font-semibold">{result.file || '—'}</span></div>
                <div>Righe importate: <span className="font-semibold">{result.rows_imported ?? 0}</span></div>
                <div>Staging table: <span className="font-semibold">{result.staging_table || '—'}</span></div>
                <div>Timestamp: <span className="font-semibold">{result.timestamp ? new Date(result.timestamp).toLocaleString('it-IT') : '—'}</span></div>
              </div>
              {result.columns && (
                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <div className="font-medium text-blue-800 dark:text-blue-300">📋 Colonne processate:</div>
                  <div className="text-xs mt-1 text-blue-700 dark:text-blue-400">{result.columns.join(', ')}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-red-700 dark:text-red-400">
              <div className="flex items-center gap-2">
                <span>✗</span>
                <span className="font-semibold">Errore durante update</span>
              </div>
              <div className="text-xs">{result.error || 'Errore sconosciuto'}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
// ============ TAB 5: POPOLA TIPO DAILY ============
function PopolaTipoDailyTab() {
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);

  const handleExecute = async () => {
    setExecuting(true);
    setResult(null);
    const loadingId = toast.loading('Esecuzione stored procedure in corso…');
    try {
      const res = await postProtectedData('/admin/imports/popola-tipo-daily', {});
      setResult(res);
      
      if (res.success) {
        toast.success(`Stored procedure completata\! Batch: ${res.batchDate} (${res.duration})`);
      } else {
        toast.error(`Errore: ${res.error || 'Errore sconosciuto'}`);
      }
    } catch (e) {
      console.error('[POPOLA-TIPO-DAILY][ERR]', e);
      toast.error(e?.message || 'Errore durante esecuzione stored procedure');
      setResult({ success: false, error: e?.message || 'Errore sconosciuto' });
    } finally {
      toast.dismiss(loadingId);
      setExecuting(false);
    }
  };

  return (
    <Card 
      title="Popola Tipo Daily" 
      subtitle="Esegue la stored procedure sp_popola_tipo_daily con l'ultima data Batch presente in InseritoFW"
    >
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 dark:text-blue-400 text-xl">ℹ️</div>
            <div className="flex-1 text-sm text-blue-800 dark:text-blue-300">
              <div className="font-semibold mb-1">Cosa fa questo comando?</div>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>Trova automaticamente l'ultima data in <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">InseritoFW.Batch</code></li>
                <li>Esegue <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">EXEC dbo.sp_popola_tipo_daily @BatchDate = '[ultima_data]'</code></li>
                <li>Popola la colonna <strong>Tipo</strong> in <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">InseritoFW</code> (solo righe NULL)</li>
                <li>Aggiorna la cache compensi agenti per il mese del Batch</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button" 
            disabled={executing} 
            onClick={handleExecute} 
            className={`px-6 py-3 rounded-md text-white text-sm font-medium ${
              executing 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700 shadow-sm hover:shadow-md transition-all'
            }`}
          >
            {executing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                Esecuzione in corso…
              </span>
            ) : (
              '▶️ Esegui Stored Procedure'
            )}
          </button>
          
          {result && (
            <button 
              type="button" 
              disabled={executing} 
              onClick={() => setResult(null)} 
              className="px-4 py-3 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
            >
              Reset
            </button>
          )}
        </div>

        {result && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {result.success ? (
              <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✅</span>
                  <span className="font-semibold text-lg">Stored Procedure Completata</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs bg-white dark:bg-gray-900 p-3 rounded">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Batch Date</div>
                    <div className="font-semibold text-base">{result.batchDate || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Durata</div>
                    <div className="font-semibold text-base">{result.duration || '—'}</div>
                  </div>
                </div>
                {result.message && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                    <div className="text-xs text-green-800 dark:text-green-300">{result.message}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 text-sm text-red-700 dark:text-red-400">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">❌</span>
                  <span className="font-semibold text-lg">Errore</span>
                </div>
                <div className="text-xs bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800">
                  {result.error || 'Errore sconosciuto'}
                </div>
                {result.details && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium">Dettagli tecnici</summary>
                    <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-x-auto">
                      {result.details}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
