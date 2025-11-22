import { useEffect, useState } from 'react';
import Card from '../../components/common/Card';
import { NavLink } from 'react-router-dom';
import { getProtectedData } from '../../services/api';
import SuperMasterTopbar from '../../components/supermaster/Topbar';

export default function Reports() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState({ recordsets: [], loading: false, error: '' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getProtectedData('/supermaster/reports');
        if (!mounted) return;
        setList(Array.isArray(res?.rows) ? res.rows : []);
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const loadReport = async (id) => {
    setSelected(id);
    setData({ recordsets: [], loading: true, error: '' });
    try {
      const res = await getProtectedData(`/supermaster/reports/${id}`);
      const rs = Array.isArray(res?.recordsets) ? res.recordsets : [];
      setData({ recordsets: rs, loading: false, error: '' });
    } catch (e) {
      setData({ recordsets: [], loading: false, error: 'Errore nel caricamento report' });
    }
  };

  const table = (rows) => {
    const arr = Array.isArray(rows) ? rows : [];
    if (arr.length === 0) return <div className="text-sm text-gray-500">Nessun dato</div>;
    const cols = Object.keys(arr[0] || {});
    return (
      <div className="overflow-auto border border-gray-200 rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>{cols.map(c => (<th key={c} className="px-3 py-2 text-left text-gray-600 border-b">{c}</th>))}</tr>
          </thead>
          <tbody>
            {arr.map((r,i) => (
              <tr key={i} className="border-b last:border-0">
                {cols.map(c => (<td key={c} className="px-3 py-2 text-gray-800 whitespace-nowrap">{String(r[c])}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <SuperMasterTopbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Report Center</h1>
          <NavLink to="/supermaster" className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Torna a SuperMaster</NavLink>
        </div>
        <Card title="Report disponibili" subtitle="Seleziona un report per vederne l'anteprima">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {loading ? Array.from({ length: 6 }).map((_,i)=>(<div key={i} className="h-20 bg-gray-100 animate-pulse rounded" />)) :
              list.map(r => (
                <button key={r.ID} onClick={()=>loadReport(r.ID)} className={`text-left p-3 border rounded hover:bg-gray-50 ${selected===r.ID?'border-indigo-500':'border-gray-200'}`}>
                  <div className="font-medium text-gray-800 line-clamp-1">{r.Titolo}</div>
                  <div className="text-xs text-gray-500 line-clamp-2">{r.Descrizione}</div>
                </button>
              ))}
          </div>
        </Card>

        {selected != null && (
          <Card title="Anteprima" subtitle={`Report ID: ${selected}`}>
            {data.loading && <div className="text-sm text-gray-500">Caricamento…</div>}
            {data.error && <div className="text-sm text-red-600">{data.error}</div>}
            {!data.loading && !data.error && (
              <div className="space-y-6">
                {data.recordsets.map((rs, idx) => (
                  <div key={idx}>
                    <div className="text-xs text-gray-500 mb-2">Recordset {idx+1}</div>
                    {table(rs)}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
