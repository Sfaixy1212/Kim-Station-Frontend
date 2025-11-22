import DashboardLayout from '../../components/layout/DashboardLayout';
import useProdotti from '../../hooks/prodotti/useProdotti';
import useTemplateOfferta from '../../hooks/attivazioni/useTemplateOfferta';
import DynamicForm from '../../components/dealer/activations/DynamicForm';
import { useState } from 'react';

function ProductTile({ p, onClick }) {
  return (
    <button
      onClick={() => onClick?.(p)}
      className="group relative w-full text-left rounded-2xl bg-white hover:bg-gray-50 px-5 py-6 transition focus:outline-none focus:ring-2 focus:ring-blue-600/20 border border-gray-200"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="text-3xl drop-shadow-sm h-8 flex items-center justify-center">
          {p.image ? (
            <img src={p.image} alt={p.title} className="h-8 object-contain" loading="lazy" />
          ) : (
            <span>{p.icon || '🛠️'}</span>
          )}
        </div>
        <h4 className="text-sm font-extrabold uppercase tracking-tight text-blue-700 group-hover:text-blue-800">
          {p.title}
        </h4>
        <p className="text-xs text-gray-600 min-h-[32px]">{p.description || p.desc}</p>
        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
          <span className="text-[11px] font-semibold text-gray-700">{(p.price ?? p.credits) || 0} Crediti</span>
        </div>
      </div>
    </button>
  );
}

export default function Support() {
  // ASS = prodotti assistenza, operatore 10
  const { data: products = [], loading, error, refetch } = useProdotti('ASS', 10);
  const [selected, setSelected] = useState(null); // {id, title, ...}
  const { data: template, loading: tLoading, error: tError } = useTemplateOfferta(selected?.id);

  const handleClick = (p) => {
    setSelected(p);
  };

  const closeModal = () => setSelected(null);

  return (
    <DashboardLayout title="Assistenza">
      <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-sm h-[calc(100vh-160px)] mt-4 overflow-y-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Prodotti Assistenza</h1>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading && [...Array(8)].map((_, i) => (
            <div key={`sk-${i}`} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
          {error && (
            <div className="col-span-full text-sm text-red-600 flex items-center justify-between">
              <span>Errore nel caricamento prodotti assistenza.</span>
              <button onClick={refetch} className="ml-3 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Riprova</button>
            </div>
          )}
          {!loading && !error && products.map((p) => (
            <ProductTile key={p.id} p={p} onClick={handleClick} />
          ))}
          {!loading && !error && products.length === 0 && (
            <div className="col-span-full text-sm text-gray-500">Nessun prodotto assistenza disponibile</div>
          )}
        </div>
      </div>

      {/* Modal Modulo Assistenza */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-10 w-[95vw] max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{selected.title}</h3>
                <p className="text-xs text-gray-500">ID Offerta: {selected.id}</p>
              </div>
              <button onClick={closeModal} className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100">Chiudi</button>
            </div>
            {/* Stato template */}
            {tLoading && <div className="text-sm text-gray-600">Caricamento modulo…</div>}
            {tError && (
              <div className="text-sm text-red-600">
                Errore nel caricamento del modulo.
              </div>
            )}
            {template && (
              <DynamicForm
                template={template}
                idOfferta={selected.id}
                onSuccess={() => { closeModal(); }}
                onError={() => { /* lascia aperto il modale */ }}
              />
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
