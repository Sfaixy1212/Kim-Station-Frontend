import React, { useEffect, useMemo, useState } from 'react';
import SuperMasterTopbar from '../../components/supermaster/Topbar';
import HeroHeader from '../../components/incentivi/HeroHeader';
import Tabs from '../../components/incentivi/Tabs';
import IncentiviTable from '../../components/incentivi/IncentiviTable';
import RuleList from '../../components/incentivi/RuleList';
import ExportPdfButtons from '../../components/incentivi/ExportPdfButtons';
import { getProtectedData } from '../../services/api';
import toast from 'react-hot-toast';

import skyStatic from '../../data/incentivi/sky.json';
import energiaStatic from '../../data/incentivi/energia.json';
import rateStatic from '../../data/incentivi/rateizzazioni.json';
import tlcStatic from '../../data/incentivi/tlc.json';

function SectionRenderer({ section }) {
  if (!section) return null;
  const { title, notes, table, bullets, footnotes, subsections } = section;
  return (
    <div className="mb-8">
      {title && <h2 className="text-xl font-bold text-gray-900 mb-3">{title}</h2>}
      {notes && notes.length > 0 && (
        <RuleList title="Note" notes={notes} />
      )}
      {table && (
        <IncentiviTable title={table.title} columns={table.columns} rows={table.rows} footnotes={footnotes} />
      )}
      {bullets && bullets.length > 0 && (
        <RuleList title="Regole" bullets={bullets} />
      )}
      {Array.isArray(subsections) && subsections.map((ss, idx) => (
        <div key={idx} className="mt-6">
          <IncentiviTable title={ss.title} columns={ss.table?.columns || []} rows={ss.table?.rows || []} />
        </div>
      ))}
    </div>
  );
}

function PlanView({ data, rightLogo }) {
  const sections = data?.sections || [];
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <HeroHeader title={data?.brand?.title || 'Piano Incentivi'} subtitle={data?.brand?.subtitle} logoSrc={data?.brand?.logo} rightLogoSrc={rightLogo} />
      <ExportPdfButtons planKey={(data?.brand?.title || 'piano').toLowerCase().replace(/[^a-z]+/g,'-')} data={data} rightLogo={rightLogo} />
      <div className="space-y-6">
        {sections.map((s) => (
          <SectionRenderer key={s.id} section={s} />
        ))}
      </div>
    </div>
  );
}

export default function PianiIncentiviModulare() {
  const [tab, setTab] = useState('tlc');
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [tlcData, setTlcData] = useState(tlcStatic);
  const [skyData, setSkyData] = useState(skyStatic);
  const [energiaData, setEnergiaData] = useState(energiaStatic);
  const [rateData, setRateData] = useState(rateStatic);
  const [loading, setLoading] = useState(false);
  const tabs = useMemo(() => ([
    { id: 'tlc', label: 'TLC (Fisso + Mobile)' },
    { id: 'sky', label: 'SKY' },
    { id: 'energia', label: 'Energia' },
    { id: 'rate', label: 'Rateizzazioni' }
  ]), []);

  const view = useMemo(() => {
    switch (tab) {
      case 'sky': return <PlanView data={skyData} rightLogo={skyData?.brand?.logoBusiness || '/sky_business_logo.svg'} />;
      case 'energia': return <PlanView data={energiaData} rightLogo={'/fastweb_vodafone-logo.svg'} />;
      case 'rate': return <PlanView data={rateData} rightLogo={'/fastweb_vodafone-logo.svg'} />;
      case 'tlc':
      default:
        return <PlanView data={tlcData} rightLogo={'/fastweb_vodafone-logo.svg'} />;
    }
  }, [tab, tlcData, skyData, energiaData, rateData]);

  useEffect(() => {
    const map = {
      tlc: { key: 'fastweb_tlc', setter: setTlcData, fallback: tlcStatic },
      sky: { key: 'sky', setter: setSkyData, fallback: skyStatic },
      energia: { key: 'energia', setter: setEnergiaData, fallback: energiaStatic },
      rate: { key: 'rate', setter: setRateData, fallback: rateStatic }
    };
    const fetchAll = async () => {
      try {
        setLoading(true);
        for (const k of Object.keys(map)) {
          const { key, setter, fallback } = map[k];
          try {
            const res = await getProtectedData(`/supermaster/piani-incentivi/config?plan=${encodeURIComponent(key)}&period=${encodeURIComponent(period)}`, { method: 'GET' });
            if (res?.data_json) setter(res.data_json);
            else setter(fallback);
          } catch (e) {
            setter(map[k].fallback);
          }
        }
      } catch (e) {
        toast.error('Errore caricamento piani, uso versioni statiche');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [period]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <SuperMasterTopbar />
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between gap-4">
          <Tabs tabs={tabs} current={tab} onChange={setTab} />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Periodo</label>
            <input value={period} onChange={e=>setPeriod(e.target.value)} className="px-3 py-2 border rounded-md text-sm" placeholder="YYYY-MM" />
            <a
              href={`/supermaster/piani-incentivazione?plan=${
                (tab === 'tlc' ? 'fastweb_tlc' : tab)
              }&period=${encodeURIComponent(period)}`}
              className="ml-3 inline-flex items-center px-3 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
            >
              ✏️ Modifica JSON
            </a>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          <a href="/supermaster/piani-incentivi-modulare" className="hover:text-gray-700">Piani Incentivazione</a>
          <span className="mx-1">›</span>
          <a
            href={`/supermaster/piani-incentivazione?plan=${(tab === 'tlc' ? 'fastweb_tlc' : tab)}&period=${encodeURIComponent(period)}`}
            className="text-indigo-600 hover:text-indigo-700"
          >
            Editor JSON
          </a>
        </div>
      </div>
      {view}
    </div>
  );
}
