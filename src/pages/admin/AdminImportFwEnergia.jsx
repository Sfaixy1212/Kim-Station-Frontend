import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Card from '../../components/common/Card';
import { postFormData } from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminImportFwEnergia() {
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
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Import FW Energia</h1>
          <p className="text-sm text-gray-500">Carica il file giornaliero (.xlsx/.xls/.csv) e imposta la Data validità (Batch).</p>
        </div>
        <NavLink to="/admin" className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Torna a Admin</NavLink>
      </div>

      <Card title="Carica file" subtitle="Formato consigliato: .xlsx (prima sheet)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File (.xlsx/.xls/.csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e)=> setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            <div className="mt-1 text-xs text-gray-500">Il file è incrementale: importeremo tutte le righe in append.</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data validità (Batch)</label>
            <input type="date" value={batchDate} onChange={(e)=> setBatchDate(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            <div className="mt-1 text-xs text-gray-500">Esempio: 2025-09-13</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" disabled={uploading} onClick={handleImport} className={`px-4 py-2 rounded-md text-white text-sm ${uploading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>{uploading ? 'Elaborazione…' : 'Importa'}</button>
          <button type="button" disabled={uploading} onClick={()=>{ setFile(null); setBatchDate(''); setResult(null); }} className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Reset</button>
        </div>
        {result && (
          <div className="mt-3 text-xs text-gray-700">
            <div>Inseriti: <span className="font-semibold">{result.inserted ?? 0}</span></div>
            {result.updated !== undefined && <div>Aggiornati: <span className="font-semibold">{result.updated ?? 0}</span></div>}
            {result.skipped !== undefined && <div>Saltati: <span className="font-semibold">{result.skipped ?? 0}</span></div>}
          </div>
        )}
      </Card>
    </div>
  );
}
