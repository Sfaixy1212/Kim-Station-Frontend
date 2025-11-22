import { useEffect, useState } from 'react';
import Card from '../../components/common/Card';
import { getProtectedData, apiCall } from '../../services/api';
import toast from 'react-hot-toast';
import SuperMasterTopbar from '../../components/supermaster/Topbar';
import tlcStatic from '../../data/incentivi/tlc.json';
import skyStatic from '../../data/incentivi/sky.json';
import energiaStatic from '../../data/incentivi/energia.json';
import rateStatic from '../../data/incentivi/rateizzazioni.json';

export default function PianiIncentivazione() {
  // ===== Editor JSON Piani Incentivi (schema viewer brand/sections/table) =====
  const [planKey, setPlanKey] = useState('fastweb_tlc');
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [planStatus, setPlanStatus] = useState('bozza'); // 'bozza' | 'pubblicato'
  const [planJsonText, setPlanJsonText] = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  // Template helper in base al plan
  const getTemplateByPlan = (key) => {
    const k = String(key || '').toLowerCase();
    if (k === 'fastweb_tlc' || k === 'tlc') return tlcStatic;
    if (k === 'sky') return skyStatic;
    if (k === 'energia' || k === 'energy') return energiaStatic;
    if (k === 'rate' || k === 'rateizzazioni') return rateStatic;
    return tlcStatic; // default
  };

  useEffect(() => {
    // Legge plan e period dalla query string se presenti
    let qpPlan = null;
    let qpPeriod = null;
    try {
      const sp = new URLSearchParams(window.location.search);
      qpPlan = sp.get('plan');
      qpPeriod = sp.get('period');
      if (qpPlan) setPlanKey(qpPlan);
      if (qpPeriod) setPeriod(qpPeriod);
    } catch {}
    // Precarica il template se vuoto (in base al plan)
    try {
      if (!planJsonText) {
        const tpl = getTemplateByPlan(qpPlan || planKey);
        setPlanJsonText(JSON.stringify(tpl, null, 2));
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Aggiorna template quando cambia il planKey se l'area è vuota
  useEffect(() => {
    if (!planJsonText) {
      setPlanJsonText(JSON.stringify(getTemplateByPlan(planKey), null, 2));
    }
  }, [planKey]);

  const loadPlan = async () => {
    try {
      setPlanLoading(true);
      const res = await getProtectedData(`/supermaster/piani-incentivi/config?plan=${encodeURIComponent(planKey)}&period=${encodeURIComponent(period)}`);
      if (res?.data_json) {
        setPlanStatus(res.status || 'bozza');
        setPlanJsonText(JSON.stringify(res.data_json, null, 2));
        toast.success('Piano caricato');
      } else {
        toast('Nessun piano trovato: uso template');
        const tpl = getTemplateByPlan(planKey);
        setPlanJsonText(JSON.stringify({ ...tpl, plan_key: planKey, period }, null, 2));
      }
    } catch (e) {
      console.error('Load plan error', e);
      toast.error('Errore caricamento piano');
    } finally {
      setPlanLoading(false);
    }
  };

  const savePlan = async (publish = false) => {
    try {
      setPlanLoading(true);
      let parsed;
      try {
        parsed = JSON.parse(planJsonText);
      } catch (e) {
        toast.error('JSON non valido');
        return;
      }
      if (!parsed || typeof parsed !== 'object') {
        toast.error('JSON mancante o non valido');
        return;
      }
      // Validazione schema minimo
      const errors = [];
      if (!parsed.brand || typeof parsed.brand !== 'object') {
        errors.push('brand mancante o non valido');
      }
      if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
        errors.push('sections deve essere un array non vuoto');
      } else {
        parsed.sections.forEach((s, i) => {
          const sid = s?.id || `#${i+1}`;
          if (!s || typeof s !== 'object') {
            errors.push(`section ${sid}: non valida`);
            return;
          }
          if (!s.table || !Array.isArray(s.table.columns) || s.table.columns.length === 0) {
            errors.push(`section ${sid}: tabella senza colonne`);
          }
          if (!s.table || !Array.isArray(s.table.rows)) {
            errors.push(`section ${sid}: tabella senza righe`);
          } else if (Array.isArray(s.table.columns)) {
            const cols = s.table.columns.length;
            (s.table.rows || []).forEach((row, r) => {
              if (!Array.isArray(row) || row.length !== cols) {
                errors.push(`section ${sid}: riga ${r+1} ha ${Array.isArray(row)?row.length:0} celle, attese ${cols}`);
              }
            });
          }
        });
      }
      if (errors.length) {
        toast.error(`Correggi il JSON:\n- ${errors.slice(0,5).join('\n- ')}`);
        return;
      }
      const body = {
        plan_key: planKey,
        period,
        status: publish ? 'pubblicato' : planStatus || 'bozza',
        data_json: parsed
      };
      const res = await apiCall('/supermaster/piani-incentivi/config', {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      if (res?.success) {
        toast.success(publish ? 'Piano pubblicato' : 'Piano salvato');
        setPlanStatus(res?.row?.status || body.status);
        setPlanJsonText(JSON.stringify(res?.row?.data_json || parsed, null, 2));
      } else {
        toast('Risposta ricevuta');
      }
    } catch (e) {
      console.error('Save plan error', e);
      toast.error('Errore salvataggio piano');
    } finally {
      setPlanLoading(false);
    }
  };

  // Editor semplificato: nessun form contrattuale o PDF qui

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <SuperMasterTopbar />
      {/* Header con gradiente */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">🎯 Piani Incentivazione</h1>
            <p className="text-xl opacity-90">Crea piani incentivazione personalizzati per i tuoi dealer</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 gap-8">
          <Card title="🗂️ Configuratore Piano (JSON in DB)" className="border-l-4 border-l-indigo-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Plan Key</label>
                <input value={planKey} onChange={e=>setPlanKey(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Periodo (YYYY-MM)</label>
                <input value={period} onChange={e=>setPeriod(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stato</label>
                <select value={planStatus} onChange={e=>setPlanStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  <option value="bozza">bozza</option>
                  <option value="pubblicato">pubblicato</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={loadPlan} disabled={planLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">Carica</button>
                <button onClick={()=>savePlan(false)} disabled={planLoading} className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">Salva</button>
                <button onClick={()=>savePlan(true)} disabled={planLoading} className="px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50">Pubblica</button>
              </div>
            </div>
            <textarea value={planJsonText} onChange={e=>setPlanJsonText(e.target.value)} rows={22} className="w-full font-mono text-sm p-3 border rounded-lg" placeholder="Incolla qui il JSON del piano (brand, sections[{title,notes?,table{columns,rows},footnotes?}])" />
            <p className="text-xs text-gray-500 mt-2">Suggerimento: copia il contenuto di <code>src/data/incentivi/tlc.json</code> e modifica solo i valori necessari.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
