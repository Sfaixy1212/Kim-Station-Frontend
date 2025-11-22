import React from 'react';

export default function RuleList({ title = 'Regole', bullets = [], notes = [] }) {
  if ((!bullets || bullets.length === 0) && (!notes || notes.length === 0)) return null;
  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-900 mb-2">{title}</h3>
      {notes && notes.length > 0 && (
        <ul className="mb-2 list-disc pl-5 text-sm text-amber-900/90 space-y-1">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      {bullets && bullets.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-amber-900/90 space-y-1">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}
