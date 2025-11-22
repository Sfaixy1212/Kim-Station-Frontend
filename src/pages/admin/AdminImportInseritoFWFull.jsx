import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Card from '../../components/common/Card';
import { postFormData } from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminImportInseritoFWFull() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [inspect, setInspect] = useState(null);

  const handleImport = async () => {
    if (!file) { toast.error('Seleziona un file (.xlsx)'); return; }
    setUploading(true);
    setResult(null);
    const loadingId = toast.loading('Import TLC (INSERITO KIM) in corso…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await postFormData('/admin/imports/inseritofw-full/commit', fd);
      setResult(res);
      toast.success(`Import completato. Batch ${res?.batch || '—'} • Inseriti ${res?.inserted ?? 0}, Aggiornati ${res?.updated ?? 0}, Senza chiave ${res?.skipped ?? 0}`);
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
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Import TLC giornaliero (INSERITO KIM)</h1>
          <p className="text-sm text-gray-500">Carica il file incrementale giornaliero. Batch viene estratto dal nome file. Non si tocca la colonna identity del DB.</p>
        </div>
        <NavLink to="/admin" className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Torna a Admin</NavLink>
      </div>

      <Card title="Carica file" subtitle="Formato richiesto: .xlsx (sheet INSERITO KIM)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File (.xlsx)</label>
            <input type="file" accept=".xlsx" onChange={(e)=> setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            <div className="mt-1 text-xs text-gray-500">Verranno importate tutte le righe (upsert su Codice Ordine/AccountNumber).</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" disabled={uploading} onClick={handleInspect} className={`px-4 py-2 rounded-md text-white text-sm ${uploading ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{uploading ? 'Lettura…' : 'Inspect intestazioni'}</button>
          <button type="button" disabled={uploading} onClick={handleImport} className={`px-4 py-2 rounded-md text-white text-sm ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>{uploading ? 'Elaborazione…' : 'Importa'}</button>
          <button type="button" disabled={uploading} onClick={()=>{ setFile(null); setResult(null); }} className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Reset</button>
        </div>
        {inspect && (
          <div className="mt-4 p-3 bg-gray-50 rounded border text-xs text-gray-700">
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
          <div className="mt-3 text-xs text-gray-700">
            <div>Batch: <span className="font-semibold">{result.batch || '—'}</span></div>
            <div>Inseriti: <span className="font-semibold">{result.inserted ?? 0}</span> • Aggiornati: <span className="font-semibold">{result.updated ?? 0}</span> • Senza chiave: <span className="font-semibold">{result.skipped ?? 0}</span></div>
          </div>
        )}
      </Card>
    </div>
  );
}
