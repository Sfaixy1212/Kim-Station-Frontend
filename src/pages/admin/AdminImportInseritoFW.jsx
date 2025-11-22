import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Card from '../../components/common/Card';
import { postFormData } from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminImportInseritoFW() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!file) { toast.error('Seleziona un file (.xlsx/.xls)'); return; }
    setUploading(true);
    setResult(null);
    const loadingId = toast.loading('Import RA in corso…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await postFormData('/admin/imports/inseritofw/commit', fd);
      setResult(res);
      toast.success(`Import RA completato: staging ${res?.imported ?? 0}, aggiornati ${res?.updated ?? 0}`);
      if (Array.isArray(res?.missingColumns) && res.missingColumns.length) {
        toast(`${res.missingColumns.length} colonne mancanti nel file (ignorate)`, { icon: '⚠️' });
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
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Import RA</h1>
          <p className="text-sm text-gray-500">Carica file TLC (.xlsx/.xls). Lo staging popola CartelStaging e aggiorna InseritoFW (RA/RP/paytype) tramite update_missing.sql.</p>
        </div>
        <NavLink to="/admin" className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Torna a Admin</NavLink>
      </div>

      <Card title="Carica file" subtitle="Formato consigliato: .xlsx (prima sheet)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File (.xlsx/.xls)</label>
            <input type="file" accept=".xlsx,.xls" onChange={(e)=> setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            <div className="mt-1 text-xs text-gray-500">Le colonne mancanti saranno ignorate automaticamente.</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" disabled={uploading} onClick={handleImport} className={`px-4 py-2 rounded-md text-white text-sm ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>{uploading ? 'Elaborazione…' : 'Importa'}</button>
          <button type="button" disabled={uploading} onClick={()=>{ setFile(null); setResult(null); }} className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Reset</button>
        </div>
        {result && (
          <div className="mt-3 text-xs text-gray-700">
            <div>Righe in staging: <span className="font-semibold">{result.imported ?? 0}</span></div>
            <div>Righe aggiornate in InseritoFW: <span className="font-semibold">{result.updated ?? 0}</span></div>
            {Array.isArray(result.missingColumns) && result.missingColumns.length > 0 && (
              <div className="mt-2">
                <div className="font-medium">Colonne mancanti (ignorate):</div>
                <ul className="list-disc pl-5">
                  {result.missingColumns.map((c)=> (<li key={c}>{c}</li>))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
