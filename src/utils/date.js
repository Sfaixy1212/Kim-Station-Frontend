// Util di formattazione date coerenti per tutta l’app
// Output: GG/MM/AAAA e GG/MM/AAAA HH:mm (senza secondi)

export function formatDateStrict(val) {
  if (!val) return '-';
  if (typeof val === 'string') {
    const s = val.trim();
    // Timestamp SQL: YYYY-MM-DD HH:mm:ss(.ms)
    const mSql = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (mSql) {
      const yyyy = mSql[1];
      const mm = mSql[2];
      const dd = mSql[3];
      if (dd === '00' || mm === '00') return '-';
      return `${dd}/${mm}/${yyyy}`;
    }
    // DD.MM.YYYY o DD/MM/YYYY o DD-MM-YYYY (normalizza)
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      const y = m[3];
      if (!a || !b) return '-';
      // Interpreta sempre come DD/MM/YYYY (standard italiano)
      return `${String(a).padStart(2,'0')}/${String(b).padStart(2,'0')}/${y}`;
    }
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth() + 1).padStart(2,'0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  } catch {}
  return String(val);
}

export function formatDateTimeStrict(val) {
  if (!val) return '-';
  if (typeof val === 'string') {
    const s = val.trim();
    // Timestamp SQL: YYYY-MM-DD HH:mm:ss(.ms)
    const mSql = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (mSql) {
      const yyyy = mSql[1];
      const mm = mSql[2];
      const dd = mSql[3];
      const HH = mSql[4];
      const MM = mSql[5];
      if (dd === '00' || mm === '00') return '-';
      return `${dd}/${mm}/${yyyy} ${HH}:${MM}`; // senza secondi
    }
    // Stringhe solo data con separatori (DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY)
    const mSep = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (mSep) {
      const dd = String(parseInt(mSep[1], 10)).padStart(2, '0');
      const mm = String(parseInt(mSep[2], 10)).padStart(2, '0');
      const yyyy = mSep[3];
      return `${dd}/${mm}/${yyyy} 00:00`;
    }
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth() + 1).padStart(2,'0');
      const yyyy = d.getFullYear();
      const HH = String(d.getHours()).padStart(2,'0');
      const MM = String(d.getMinutes()).padStart(2,'0');
      return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
    }
  } catch {}
  return formatDateStrict(val);
}
