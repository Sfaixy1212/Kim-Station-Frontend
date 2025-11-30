import express from 'express';
import fs from 'fs';
import path from 'path';
import { authenticateToken } from './auth-middleware.mjs';

// Lazy import to avoid crashing process if puppeteer isn't installed yet
let puppeteer = null;
let chromiumLambda = null; // @sparticuz/chromium (optional)
const FORCE_PLAYWRIGHT = String(process.env.FORCE_PLAYWRIGHT || '').trim() === '1';
const DISABLE_PUPPETEER = String(process.env.DISABLE_PUPPETEER || '').trim() === '1';
async function getPuppeteer() {
  if (puppeteer) return puppeteer;
  try {
    // Prefer puppeteer if installed; otherwise puppeteer-core for lambda chromium
    try {
      puppeteer = (await import('puppeteer')).default;
    } catch {
      puppeteer = (await import('puppeteer-core')).default;
    }
    return puppeteer;
  } catch (e) {
    throw new Error('Puppeteer non installato. Esegui: npm i puppeteer');
  }
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

async function resolveExecutablePath(P) {
  // Prefer system Chrome/Chromium to avoid arch mismatch of bundled binary
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fileExists(c)) return c;
  }
  // Try @sparticuz/chromium for AWS/ARM environments
  try {
    chromiumLambda = (await import('@sparticuz/chromium')).default;
    const exec = await chromiumLambda.executablePath();
    if (exec) return exec;
  } catch {}
  // Fallback to puppeteer downloaded binary
  try {
    const x = P?.executablePath?.();
    if (x && fileExists(x)) return x;
  } catch {}
  return null;
}

const router = express.Router();

function onlySupermaster(req, res, next) {
  try {
    const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
    if (roles.includes('SUPERMASTER') || roles.includes('ADMIN')) return next();
    return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
  } catch {
    return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
  }
}

// Basic HTML template using Tailwind-like inline styles (no external CSS for isolation)
function toDataUrlIfLocal(src) {
  try {
    if (!src || typeof src !== 'string') return src;
    // already data url
    if (src.startsWith('data:')) return src;
    // Map /foo.svg -> FRONT_PUBLIC_DIR/foo.svg
    if (src.startsWith('/')) {
      const base = process.env.FRONT_PUBLIC_DIR || path.join(process.cwd(), '..', 'app', 'public');
      const rel = src.replace(/^\/+/, '');
      const filePath = path.join(base, rel);
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.svg' ? 'image/svg+xml'
        : ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : 'application/octet-stream';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
    return src;
  } catch (e) {
    try { console.debug('[PDF LOGO] Impossibile leggere asset locale:', src, '->', e.message); } catch {}
    return src;
  }
}

function renderHtml({ brand = {}, sections = [], logos = {}, generatedAt = new Date(), planKey = 'piano' }) {
  // Resolve logos to data URLs to ensure they render within Puppeteer offline context
  const brandLogo = toDataUrlIfLocal(brand.logo);
  const rightLogo = toDataUrlIfLocal(logos.right);
  const theme = (() => {
    const k = String(planKey || '').toLowerCase();
    if (k.includes('sky')) return { from: '#111827', via: '#0ea5e9', to: '#111827' };
    if (k.includes('energia')) return { from: '#059669', via: '#10b981', to: '#059669' };
    if (k.includes('rate')) return { from: '#7c3aed', via: '#a78bfa', to: '#7c3aed' };
    return { from: '#4f46e5', via: '#7c3aed', to: '#2563eb' };
  })();
  const style = `
    * { box-sizing: border-box; }
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; color: #0f172a; }
    body::before { content: ''; position: fixed; inset: 0; background: radial-gradient(1200px 800px at 120% -10%, #e0e7ff40, transparent 60%), radial-gradient(800px 600px at -10% 120%, #f5d0fe40, transparent 60%); z-index: -1; }
    .container { width: 100%; max-width: 980px; margin: 0 auto; padding: 24px; }
    .cover { background: linear-gradient(90deg, ${theme.from}, ${theme.via}, ${theme.to}); color: white; padding: 36px 24px; border-radius: 16px; }
    .row { display: flex; align-items: center; gap: 16px; }
    .title { font-size: 28px; font-weight: 800; margin: 4px 0; }
    .subtitle { opacity: .9; }
    .logo { height: 38px; }
    .section { margin-top: 28px; }
    .h2 { font-size: 20px; font-weight: 800; margin: 0 0 10px; }
    .note, .rules { background: #fffbeb; border: 1px solid #fef3c7; padding: 10px 12px; border-radius: 10px; margin: 10px 0; }
    .note ul, .rules ul { padding-left: 18px; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
    thead { background: #f8fafc; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    .footer { margin-top: 12px; font-size: 11px; color: #334155; }
    .wm { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-24deg); font-weight: 800; letter-spacing: 2px; font-size: 84px; color: #0f172a; opacity: 0.06; z-index: 0; pointer-events: none; }
    .page-footer { position: fixed; bottom: 10px; right: 24px; font-size: 11px; color: #475569; }
  `;

  const sectionsHtml = sections.map((s) => {
    const notes = (s.notes && s.notes.length) ? `<div class="note"><ul>${s.notes.map(n=>`<li>${n}</li>`).join('')}</ul></div>` : '';
    const rules = (s.bullets && s.bullets.length) ? `<div class="rules"><ul>${s.bullets.map(n=>`<li>${n}</li>`).join('')}</ul></div>` : '';
    const table = s.table ? `
      <div class="table-wrap">
        <table>
          <thead><tr>${(s.table.columns||[]).map(c=>`<th>${c}</th>`).join('')}</tr></thead>
          <tbody>
            ${(s.table.rows||[]).map(r=>`<tr>${r.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : '';
    const foot = (s.footnotes && s.footnotes.length) ? `<div class="footer">${s.footnotes.map(f=>`• ${f}`).join('<br/>')}</div>` : '';
    const subsections = Array.isArray(s.subsections) ? s.subsections.map(ss => `
      <div class="subsection">
        ${ss.title ? `<div class="h3" style="font-weight:700;margin:12px 0 6px;">${ss.title}</div>` : ''}
        <table>
          <thead><tr>${(ss.table?.columns||[]).map(c=>`<th>${c}</th>`).join('')}</tr></thead>
          <tbody>${(ss.table?.rows||[]).map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    `).join('') : '';
    return `
      <section class="section">
        ${s.title ? `<div class="h2">${s.title}</div>` : ''}
        ${notes}
        ${table}
        ${rules}
        ${subsections}
        ${foot}
      </section>
    `;
  }).join('');

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${brand.title || 'Piano Incentivi'}</title>
      <style>${style}</style>
    </head>
    <body>
      <div class="container">
        <div class="cover">
          <div class="row">
            ${brandLogo ? `<img class="logo" src="${brandLogo}" />` : ''}
            <div>
              <div class="title">${brand.title || 'Piano Incentivi'}</div>
              ${brand.subtitle ? `<div class="subtitle">${brand.subtitle}</div>` : ''}
            </div>
            <div style="margin-left:auto;">
              ${rightLogo ? `<img class="logo" src="${rightLogo}" />` : ''}
            </div>
          </div>
        </div>
        <div class="wm">${(brand.title || 'KIM SMART DIGITAL').toUpperCase()}</div>
        ${sectionsHtml}
        <div class="page-footer">Generato: ${new Date(generatedAt).toLocaleString('it-IT')}</div>
      </div>
    </body>
  </html>`;
  return html;
}

router.post('/pdf', authenticateToken, onlySupermaster, express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { plan = 'tlc', data, logos } = req.body || {};
    if (!data || !Array.isArray(data.sections)) {
      return res.status(400).json({ error: 'Payload non valido: atteso { plan, data: { brand, sections[...] } }' });
    }
    const html = renderHtml({ ...data, logos, planKey: plan });
    const brandTitle = (data?.brand?.title || 'Piano Incentivi');
    const generatedAt = new Date();
    // Header/Footer templates (Chromium API)
    const footerTemplate = `
      <div style="font-size:10px;color:#475569;width:100%;padding:0 12mm;display:flex;align-items:center;justify-content:space-between;">
        <div>${(plan || '').toString().toUpperCase()} · ${(brandTitle).toString().toUpperCase()}</div>
        <div>Pagina <span class="pageNumber"></span> di <span class="totalPages"></span></div>
      </div>`;
    const headerTemplate = `
      <div style="font-size:9px;color:#64748b;width:100%;padding:0 12mm;display:flex;align-items:center;justify-content:space-between;">
        <div>${new Date(generatedAt).toLocaleDateString('it-IT')}</div>
        <div>Kim Smart Digital</div>
      </div>`;
    let pdf = null;
    // Try Playwright first (better arm64 support)
    try {
      const pw = await import('playwright');
      const browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.emulateMedia({ media: 'screen' });
      pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: { top: '18mm', right: '12mm', bottom: '18mm', left: '12mm' }
      });
      await browser.close();
    } catch (e) {
      console.warn('[IncentiviPDF] Playwright non disponibile o errore:', e.message);
      if (FORCE_PLAYWRIGHT) {
        throw new Error('Playwright richiesto (FORCE_PLAYWRIGHT=1) ma non disponibile: ' + e.message);
      }
      if (DISABLE_PUPPETEER) {
        throw new Error('Puppeteer disabilitato (DISABLE_PUPPETEER=1) e Playwright non disponibile: ' + e.message);
      }
      console.warn('[IncentiviPDF] Fallback a Puppeteer abilitato');
      // Puppeteer fallback
      const P = await getPuppeteer();
      const execPath = await resolveExecutablePath(P);
      const lambdaArgs = chromiumLambda ? (chromiumLambda.args || []) : [];
      const baseArgs = ['--no-sandbox','--disable-setuid-sandbox'];
      const mergedArgs = Array.from(new Set([...lambdaArgs, ...baseArgs])).filter(a => a !== '--single-process');
      const launchOpts = { args: mergedArgs, headless: chromiumLambda ? (chromiumLambda.headless ?? 'new') : 'new' };
      if (execPath) launchOpts.executablePath = execPath;
      else console.warn('[IncentiviPDF] Nessun executablePath specifico trovato; provo bundled default');
      try { if (launchOpts.executablePath) fs.chmodSync(launchOpts.executablePath, 0o755); } catch {}
      console.log('[IncentiviPDF] Launching Chrome with options:', { ...launchOpts, executablePath: (launchOpts.executablePath || 'bundled') });
      const browser = await P.launch(launchOpts);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: { top: '18mm', right: '12mm', bottom: '18mm', left: '12mm' }
      });
      await browser.close();
    }
    const filename = `piano_${plan}_${new Date().toISOString().slice(0,10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('[IncentiviPDF] Error:', err);
    return res.status(500).json({ error: 'Errore generazione PDF', details: err.message });
  }
});

export default router;
