import { useMemo, useState } from 'react';

export default function DealerFilterBar({ dealers = [], selectedId, onChange }) {
  const [filter, setFilter] = useState('');

  const options = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = Array.isArray(dealers) ? dealers : [];
    if (!q) return list;
    return list.filter(d => (d.ragioneSociale || '').toLowerCase().includes(q));
  }, [dealers, filter]);

  // Pure controlled: initialization is handled by parent

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Cerca dealer</label>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtra per ragione sociale..."
            className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
          />
        </div>
        <div className="w-full sm:w-96">
          <label className="block text-xs font-medium text-gray-700 mb-1">Seleziona dealer</label>
          <select
            value={selectedId || ''}
            onChange={(e) => {
              const id = e.target.value;
              onChange?.(id);
            }}
            className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value="" disabled>
              Seleziona un dealer...
            </option>
            {options.map((d) => (
              <option key={d.id} value={d.id}>{d.ragioneSociale}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
