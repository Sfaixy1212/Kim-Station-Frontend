import React, { useState } from 'react';
import { apiCallBlob } from '../../services/api';

export default function ExportPdfButtons({ planKey, data, rightLogo }) {
  const [loading, setLoading] = useState(false);

  const exportPdf = async () => {
    try {
      setLoading(true);
      const blob = await apiCallBlob('/api/supermaster/incentivi/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey, data, logos: { right: rightLogo } })
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `piano_${planKey}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export PDF error', e);
      alert('Errore durante l\'export del PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-end mb-4">
      <button onClick={exportPdf} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-60">
        {loading ? 'Generazione…' : 'Esporta PDF'}
      </button>
    </div>
  );
}
