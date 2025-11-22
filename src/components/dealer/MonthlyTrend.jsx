import { useEffect, useMemo, useState } from 'react';
import { getProtectedData } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const MONTHS_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function sumActivationsDealer(row) {
  // Campi dall'endpoint /api/andamento
  const keys = ['ILIAD', 'KENA', '1MOBILE', 'WEEDOO'];
  return keys.reduce((acc, k) => acc + (Number(row?.[k]) || 0), 0);
}

function sumActivationsAgent(row) {
  const keys = ['MOBILE', 'FISSO', 'ENERGIA', 'PRODOTTI'];
  return keys.reduce((acc, k) => acc + (Number(row?.[k]) || 0), 0);
}

function monthLabelFromAnnoMese(annoMese) {
  // Expected formats like '2025-08' or '2025/08'
  const m = /^(\d{4})[-\/.](\d{2})$/.exec(String(annoMese || ''));
  if (!m) return String(annoMese || '');
  const monthIdx = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
  return MONTHS_IT[monthIdx];
}

export default function MonthlyTrend() {
  const [monthsRange] = useState(6);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const role = (user?.role || '').toString().toLowerCase();
  const isAgent = role === 'agente' || role === 'agent';

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const endpoint = isAgent
          ? `/agente/andamento-attivazioni?months=${monthsRange}`
          : `/andamento?year=${new Date().getFullYear()}`;
        const res = await getProtectedData(endpoint);
        let payload = [];
        if (res && Array.isArray(res)) {
          payload = res;
        } else if (res && Array.isArray(res?.data)) {
          payload = res.data;
        }
        if (active) setRows(payload);
      } catch (e) {
        console.error('Errore fetch andamento mensile:', e);
        if (active) setError(e.message || 'Errore di caricamento');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [isAgent, monthsRange]);

  const monthlyData = useMemo(() => {
    return rows.map((r) => {
      const annoMese = r.AnnoMese ?? r.ANNO_MESE ?? r.anno_mese;
      return {
        month: monthLabelFromAnnoMese(annoMese),
        activations: isAgent ? sumActivationsAgent(r) : sumActivationsDealer(r),
      };
    });
  }, [rows, isAgent]);

  const maxActivations = useMemo(() => Math.max(1, ...monthlyData.map(d => d.activations)), [monthlyData]);

  const getBarHeight = (value, max) => (value / max) * 100;
  const currentMonth = monthlyData[monthlyData.length - 1] || { activations: 0, month: '-' };
  const previousMonth = monthlyData[monthlyData.length - 2] || { activations: 0 };
  const activationsChange = previousMonth.activations
    ? ((currentMonth.activations - previousMonth.activations) / previousMonth.activations * 100)
    : 0;

  return (
    <div className="bg-white rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          Andamento Mensile
        </h3>
        <div className="flex space-x-3 text-xs">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 rounded mr-1"></div>
            <span className="text-gray-600">Attivazioni</span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-6 text-sm text-gray-500">Caricamento…</div>
      )}
      {error && !loading && (
        <div className="py-6 text-sm text-red-600">{error}</div>
      )}
      {!loading && !error && (
        <>
          {/* Grafico a barre (solo Attivazioni) */}
          <div className="mb-4">
            <div className="flex items-end justify-between h-38 bg-gray-50 rounded-lg p-3">
              {monthlyData.map((data, i) => (
                <div key={`${data.month || '-'}-${i}`} className="flex flex-col items-center space-y-2 flex-1">
                  <div className="flex flex-col items-center space-y-1 w-full">
                    <div className="w-3 bg-gray-200 rounded relative">
                      <div
                        className="bg-blue-500 rounded transition-all duration-500"
                        style={{ height: `${getBarHeight(data.activations, maxActivations)}px` }}
                        title={`${data.activations} attivazioni`}
                      ></div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-600 font-medium">{data.month || '-'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Statistiche riassuntive */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Attivazioni {currentMonth.month}</p>
                  <p className="text-2xl font-bold text-blue-900">{currentMonth.activations}</p>
                </div>
                <div className={`text-sm font-medium ${activationsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {activationsChange >= 0 ? '↗' : '↘'} {Math.abs(activationsChange).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="bg-purple-50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-600 font-medium">Media Mensile</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {monthlyData.length ? Math.round(monthlyData.reduce((acc, d) => acc + d.activations, 0) / monthlyData.length) : 0}
                  </p>
                </div>
                <div className="text-xs text-purple-600">attivazioni</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
