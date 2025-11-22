import React from 'react';

export default function IncentiviTable({ title, columns = [], rows = [], footnotes = [] }) {
  return (
    <div className="mb-6">
      {title && <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((c, i) => (
                <th key={i} className="px-4 py-2 text-left font-semibold text-gray-700">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, ri) => (
              <tr key={ri} className={ri % 2 ? 'bg-white' : 'bg-gray-50/40'}>
                {r.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2 whitespace-pre-line text-gray-800">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnotes && footnotes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-gray-600 space-y-1">
          {footnotes.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
