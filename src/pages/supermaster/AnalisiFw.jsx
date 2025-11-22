import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import SuperMasterTopbar from '../../components/supermaster/Topbar';
import Card from '../../components/common/Card';
import { getFastwebQualityRanking } from '../../services/api';
import toast from 'react-hot-toast';

const SCOPE_OPTIONS = [
  { value: 'DEALER', label: 'Dealer' },
  { value: 'AGENTE', label: 'Agenti' }
];

const formatInt = (value) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Number(value || 0));
const formatDecimal = (value) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

const monthOptions = Array.from({ length: 12 }, (_, idx) => {
  const month = idx + 1;
  return {
    value: month,
    label: new Date(2000, idx, 1).toLocaleDateString('it-IT', { month: 'long' })
  };
});

const yearOptions = Array.from({ length: 4 }, (_, idx) => {
  const currentYear = new Date().getFullYear();
  const year = currentYear - idx;
  return { value: year, label: String(year) };
});

const defaultPeriod = () => {
  const today = new Date();
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
};

export default function AnalisiFw() {
  const [scope, setScope] = useState('DEALER');
  const [{ year, month }, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const summary = useMemo(() => {
    if (!rows.length) {
      return {
        totAttivazioni: 0,
        attivazioniFisso: 0,
        attivazioniMobile: 0,
        bonus: 0,
        penalita: 0,
        punteggioTotale: 0,
        ricAuto: 0,
        vodafoneHo: 0
      };
    }
    return rows.reduce((acc, r) => {
      acc.totAttivazioni += Number(r.TotAttivazioni || 0);
      acc.attivazioniFisso += Number(r.AttivazioniFisso || 0);
      acc.attivazioniMobile += Number(r.AttivazioniMobile || 0);
      acc.bonus += Number(r.BonusRicAutoTot || 0);
      acc.penalita += Number(r.PenalitaVodafoneHoTot || 0);
      acc.punteggioTotale += Number(r.PunteggioTotale || 0);
      acc.ricAuto += Number(r.AttivazioniRicAuto || 0);
      acc.vodafoneHo += Number(r.AttivazioniVodafoneHo || 0);
      return acc;
    }, {
      totAttivazioni: 0,
      attivazioniFisso: 0,
      attivazioniMobile: 0,
      bonus: 0,
      penalita: 0,
      punteggioTotale: 0,
      ricAuto: 0,
      vodafoneHo: 0
    });
  }, [rows]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getFastwebQualityRanking({ scope, year, month });
      setRows(data?.rows || []);
    } catch (err) {
      console.error('[AnalisiFw] loadData error:', err);
      const message = err?.message || 'Errore durante il caricamento dei dati';
      setError(message);
      toast.error(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [scope, year, month]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => Number(b.PunteggioTotale || 0) - Number(a.PunteggioTotale || 0));
  }, [rows]);

  const compositionData = useMemo(() => {
    return sortedRows.slice(0, 10).map((row) => ({
      name: row.EntityName,
      fisso: Number(row.AttivazioniFisso || 0),
      mobile: Number(row.AttivazioniMobile || 0)
    }));
  }, [sortedRows]);

  const bonusPenaltyData = useMemo(() => {
    return sortedRows.slice(0, 10).map((row) => ({
      name: row.EntityName,
      bonus: Number(row.BonusRicAutoTot || 0),
      penalita: Math.abs(Number(row.PenalitaVodafoneHoTot || 0))
    }));
  }, [sortedRows]);

  const periodDate = new Date((year || new Date().getFullYear()), ((month || 1) - 1), 1);
  const periodLabel = periodDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperMasterTopbar />
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Analisi FW</h1>
              <p className="text-sm text-gray-500">Ultimo ranking Fastweb aggiornato sull’ultimo batch disponibile del periodo selezionato.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="text-sm border-gray-300 rounded-md px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {SCOPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                value={month}
                onChange={(event) => setPeriod(prev => ({ ...prev, month: Number(event.target.value) }))}
                className="text-sm border-gray-300 rounded-md px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(event) => setPeriod(prev => ({ ...prev, year: Number(event.target.value) }))}
                className="text-sm border-gray-300 rounded-md px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {yearOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={loadData}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white shadow-sm hover:bg-gray-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-4.99m0 0l-3.535 3.535A9 9 0 104.5 19.5" />
                </svg>
                Aggiorna
              </button>
            </div>
          </header>

          <section>
            <div className="mb-4">
              <span className="text-xs uppercase tracking-wide text-gray-500">Periodo</span>
              <div className="text-lg font-medium text-gray-900">{periodLabel}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Totale attivazioni</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{formatInt(summary.totAttivazioni)}</div>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Fisso</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{formatInt(summary.attivazioniFisso)}</div>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Mobile</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{formatInt(summary.attivazioniMobile)}</div>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Score complessivo</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{formatDecimal(summary.punteggioTotale)}</div>
              </Card>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Bonus RA</div>
                <div className="text-lg font-semibold text-emerald-600 mt-1">+{formatInt(summary.bonus)}</div>
                <p className="text-xs text-gray-500 mt-2">Credito extra assegnato per SIM in ricarica automatica.</p>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Penalità MNP Vodafone/Ho</div>
                <div className="text-lg font-semibold text-rose-600 mt-1">{formatInt(summary.penalita)}</div>
                <p className="text-xs text-gray-500 mt-2">Penalità applicata alle portabilità da Vodafone o Ho.</p>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">SIM RA / MNP critiche</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-semibold text-blue-600">{formatInt(summary.ricAuto)}</span>
                  <span className="text-sm text-gray-400">RA</span>
                  <span className="text-base font-semibold text-orange-500">{formatInt(summary.vodafoneHo)}</span>
                  <span className="text-sm text-gray-400">MNP</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">Confronto tra RA attive e portabilità da operatori penalizzanti.</p>
              </Card>
            </div>

            <Card title="Legenda punteggi Fastweb" className="mt-6">
              <div className="space-y-3 text-sm text-gray-600">
                <p>Il ranking è ordinato per <strong>Punteggio Totale</strong>, calcolato sommando base score, bonus e penalità su tutte le attivazioni dell’ultimo batch del periodo selezionato.</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Base score</strong>: per ogni attivazione viene sommato il valore configurato in `fastweb_quality_weights` (1 = entry, 5 = mid, 7 = top) in funzione del piano normalizzato.</li>
                  <li><strong>Bonus RA</strong>: +5 punti per ciascuna SIM mobile con ricarica automatica (`TipoRicarica = AUTOMATICA`). Il bonus è moltiplicato per il numero di SIM registrato sull’ordine.</li>
                  <li><strong>Penalità MNP Vodafone/Ho</strong>: −5 punti per ogni SIM mobile portata da Vodafone, Ho o Ho.Mobile.</li>
                  <li><strong>Tot/Fisso/Mobile</strong>: conteggio delle attivazioni ponderate (incluse multi-SIM). Le colonne RA e MNP riportano rispettivamente quante SIM hanno ricevuto bonus o penalità.</li>
                </ul>
                <p className="text-xs text-gray-500">I pesi e le categorie sono allineati al dizionario offerte Fastweb mantenuto in `KAM.dbo.fastweb_offerte_base` / `fastweb_offerte_syn`.</p>
              </div>
            </Card>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Mix attivazioni Fisso vs Mobile" subtitle={`Top 10 ${scope === 'DEALER' ? 'dealer' : 'agenti'} per punteggio`} className="h-full">
              {compositionData.length ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={compositionData} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={80} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value, key) => [formatInt(value), key === 'fisso' ? 'Fisso' : 'Mobile']}
                      />
                      <RechartsLegend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="fisso" stackId="mix" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="mobile" stackId="mix" fill="#22C55E" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nessun dato disponibile per il grafico.</p>
              )}
            </Card>

            <Card title="Bonus vs Penalità" subtitle="Impatto su punteggio (Top 10)" className="h-full">
              {bonusPenaltyData.length ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bonusPenaltyData} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={80} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value, key) => [formatInt(value), key === 'bonus' ? 'Bonus RA' : 'Penalità MNP']}
                      />
                      <RechartsLegend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="bonus" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="penalita" fill="#F97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nessun dato disponibile per il grafico.</p>
              )}
            </Card>
          </section>

          <section className="bg-white shadow-sm border border-gray-200 rounded-xl">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Classifica {scope === 'DEALER' ? 'dealer' : 'agenti'}</h2>
                <p className="text-xs text-gray-500">Ordine per punteggio totale. Include breakdown Fisso/Mobile e bonus/penalità.</p>
              </div>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Caricamento...
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">#</th>
                    <th className="px-4 py-3 text-left font-semibold">{scope === 'DEALER' ? 'Dealer' : 'Agente'}</th>
                    <th className="px-4 py-3 text-right font-semibold">Tot</th>
                    <th className="px-4 py-3 text-right font-semibold">Fisso</th>
                    <th className="px-4 py-3 text-right font-semibold">Mobile</th>
                    <th className="px-4 py-3 text-right font-semibold">Bonus</th>
                    <th className="px-4 py-3 text-right font-semibold">Penalità</th>
                    <th className="px-4 py-3 text-right font-semibold">Score</th>
                    <th className="px-4 py-3 text-right font-semibold">RA</th>
                    <th className="px-4 py-3 text-right font-semibold">MNP Vod/Ho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {error && (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-sm text-rose-600">
                        {error}
                      </td>
                    </tr>
                  )}
                  {!error && !loading && sortedRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-sm text-gray-500">
                        Nessun dato disponibile per il periodo selezionato.
                      </td>
                    </tr>
                  )}
                  {!error && sortedRows.map((row, index) => (
                    <tr key={`${row.EntityName}-${index}`} className={index === 0 ? 'bg-yellow-50/60' : ''}>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.EntityName}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatInt(row.TotAttivazioni)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.AttivazioniFisso)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.AttivazioniMobile)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium">+{formatInt(row.BonusRicAutoTot)}</td>
                      <td className="px-4 py-3 text-right text-rose-600 font-medium">{formatInt(row.PenalitaVodafoneHoTot)}</td>
                      <td className="px-4 py-3 text-right text-blue-700 font-semibold">{formatDecimal(row.PunteggioTotale)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.AttivazioniRicAuto)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.AttivazioniVodafoneHo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
