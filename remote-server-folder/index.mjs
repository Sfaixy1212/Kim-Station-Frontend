console.log('DEBUG: INIZIO FILE index.mjs');
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer'; // Importato UNA SOLA VOLTA (no duplicati)
import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import createAgenteRouter from './agente.mjs';
import agenteKpiRouter from './agente-kpi.mjs';
import createDealerRouter from './dealer.mjs';
import { authenticateToken } from './auth-middleware.mjs';
import express from 'express';
import { uploadToS3, testS3UploadBothBuckets } from './s3-service.mjs';
import { mergeFilesToPdf } from './pdf-utils.mjs';

import { DateTime } from 'luxon';
import { getPool, getRequest, sql, dbConfig, getDbName } from './db-pool.mjs';
import classificaAgentiRoute from './classifica-agenti.mjs';
import obiettiviAgentiRoute from './obiettivi-agenti.mjs';
import andamentoAgenteRoute from './andamento-agente.mjs';
import reportisticaAgenteRoute from './reportistica-agente.mjs';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import axios from 'axios';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import fs from 'fs';
import https from 'https';
import { verifyTOTP } from './totp-utils.mjs';
import { encryptGCM, decryptGCM } from './crypto-utils.mjs';
// Importa il modulo aspnet-identity-pw una sola volta
import aspnetIdentityPw from 'aspnet-identity-pw';
// Importa il servizio email personalizzato
import emailService from './email-service.mjs';
// Router SuperMaster: import in testa per evitare doppie dichiarazioni
import supermasterReportsRouter from './supermaster-report-agente.mjs';
import supermasterPianiIncentiviRouter from './supermaster-piani-incentivi.mjs';
import supermasterIncentiviPdfRouter from './supermaster-incentivi-pdf.mjs';
import supermasterCompensiDealerRouter from './compensi-dealer.mjs';
// Redis client per caching
import { initRedis, withCache, invalidateCache } from './redis-client.mjs';

// Verifica che il modulo sia stato caricato correttamente
if (typeof aspnetIdentityPw !== 'object' || typeof aspnetIdentityPw.validatePassword !== 'function') {
  console.error('Errore nel caricamento di aspnet-identity-pw');
  process.exit(1);
}

// Selezione foglio robusta: preferisci nome target, altrimenti heuristica sulle intestazioni
function pickInseritoKimSheet(wb, targetSheetName = 'INSERITO KIM') {
  const available = wb.SheetNames || [];
  const norm = s => s
    .toString()
    .replace(/\u00A0/g, ' ') // NBSP
    .replace(/[\s\u00A0]+/g, ' ')
    .trim()
    .toLowerCase();
  const targetNorm = norm(targetSheetName || 'INSERITO KIM');
  // 1) Match esatto o contiene
  let sheetName = available.find(n => norm(n) === targetNorm) || available.find(n => norm(n).includes(targetNorm));
  if (sheetName) return sheetName;
  // 2) Heuristica: cerca il foglio che ha colonne tipiche InseritoFW
  const candidates = [];
  for (const sn of available) {
    const ws = wb.Sheets[sn];
    if (!ws || !ws['!ref']) continue;
    try {
      const range = xlsx.utils.decode_range(ws['!ref']);
      const headerRow = range.s.r;
      const headers = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[xlsx.utils.encode_cell({ r: headerRow, c })];
        const val = cell ? String(cell.v ?? cell.w ?? '').trim() : '';
        if (val) headers.push(val);
      }
      const hnorm = headers.map(h => norm(h));
      const score = (
        (hnorm.includes('cliente') ? 1 : 0) +
        (hnorm.includes('fiscalcodeorpiva') ? 1 : 0) +
        (hnorm.includes('accountnumber') ? 2 : 0) +
        (hnorm.includes('codice ordine') ? 3 : 0) +
        (hnorm.includes('codice ordinee') ? 3 : 0) +
        (hnorm.includes("codice comsy tecnico attuale") ? 1 : 0)
      );
      candidates.push({ sn, score });


// SANITIZE: mantiene solo la sheet INSERITO KIM e salva il file come YYYY-MM-DD.xlsx in ./import
app.post('/api/admin/imports/inseritofw-full/sanitize', authenticateToken, onlyAdmin, fwInseritoUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante' });
    const buf = req.file.buffer;
    if (!buf || buf.length === 0) return res.status(400).json({ error: 'File vuoto' });
    const originalName = req.file.originalname || '';
    const batch = parseBatchFromFilename(originalName);
    if (!batch) return res.status(400).json({ error: 'Impossibile estrarre Batch dal filename', originalName });

    const wbFull = xlsx.read(buf, { type: 'buffer' });
    const sheetName = pickInseritoKimSheet(wbFull, 'INSERITO KIM');
    if (!sheetName) return res.status(400).json({ error: 'Foglio "INSERITO KIM" non trovato', availableSheets: wbFull.SheetNames || [] });
    const ws = wbFull.Sheets[sheetName];

    // Headers e preview
    const range = xlsx.utils.decode_range(ws['!ref']);
    const headerRow = range.s.r;
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[xlsx.utils.encode_cell({ r: headerRow, c })];
      const val = cell ? String(cell.v ?? cell.w ?? '').trim() : '';
      headers.push(val);
    }
    const json = xlsx.utils.sheet_to_json(ws, { defval: '', raw: false });
    const preview = json.slice(0, 5);

    // Crea un nuovo workbook solo con la sheet target
    const wbNew = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wbNew, ws, 'INSERITO KIM');
    const outBuf = xlsx.write(wbNew, { type: 'buffer', bookType: 'xlsx' });

    // Salva in ./import/YYYY-MM-DD.xlsx
    const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
    const baseDir = path.join(__dirname2, 'import');
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    const targetPath = path.join(baseDir, `${batch}.xlsx`);
    fs.writeFileSync(targetPath, outBuf);

    return res.json({ success: true, batch, savedAs: `${batch}.xlsx`, headers, previewCount: preview.length, preview });
  } catch (e) {
    console.error('[INSERITOFW-FULL][SANITIZE][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante sanitize', details: e?.message || String(e) });
  }
});

console.log('[COMPENSI] Registrazione endpoint: /api/compensi/export');
app.get('/api/compensi/export', authenticateToken, async (req, res) => {
  try { console.log('[COMPENSI][export] hit', { qs: req?.query }); } catch {}
  try {
    if (!isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });

    const monthStart = (req.query.monthStart || '').toString().trim();
    const agente = (req.query.agente || '').toString().trim();

    await getPool();

    const mainReq = await getRequest();
    try { mainReq.timeout = 120000; } catch {}
    mainReq.input('p_monthStart', sql.Date, monthStart ? new Date(monthStart) : null);
    mainReq.input('p_agente', sql.NVarChar(100), agente || null);
    const mainRs = await mainReq.query(`
      DECLARE @MonthStart date = CONVERT(date, @p_monthStart, 23);
      DECLARE @Agente nvarchar(100) = @p_agente;
      SELECT *
      FROM dbo.vw_compensi_agenti_mese_compensi WITH (NOLOCK)
      WHERE (@MonthStart IS NULL OR MonthStart = @MonthStart)
        AND (@Agente IS NULL OR Agente IN (SELECT value FROM STRING_SPLIT(@Agente,',')))
      ORDER BY MonthStart, Agente;
    `);
    const mainRows = mainRs.recordset || [];

    const breakdownReq = new sql.Request();
    try { breakdownReq.timeout = 120000; } catch {}
    breakdownReq.input('p_monthStart', sql.Date, monthStart ? new Date(monthStart) : null);
    breakdownReq.input('p_agente', sql.NVarChar(100), agente || null);
    const breakdownRs = await breakdownReq.query(`
      SELECT *
      FROM dbo.fn_compensi_agente_breakdown(@p_monthStart, @p_agente)
      ORDER BY Sezione, Sottovoce, Dettaglio;
    `);
    const breakdownRows = breakdownRs.recordset || [];

    const detailReq = new sql.Request();
    try { detailReq.timeout = 120000; } catch {}
    detailReq.input('p_monthStart', sql.VarChar(10), monthStart || null);
    detailReq.input('p_agente', sql.NVarChar(100), agente || null);
    const detailRs = await detailReq.query(`
      DECLARE @MonthStart date = CONVERT(date, @p_monthStart, 23);
      DECLARE @Agente nvarchar(100) = @p_agente;
      SELECT MonthStart, Agente, Sezione, SottoVoce, Dettaglio, Qty, EuroUnit, Euro, CreatedAt
      FROM dbo.compensi_agenti_mese_dettaglio WITH (NOLOCK)
      WHERE (@MonthStart IS NULL OR MonthStart = @MonthStart)
        AND (@Agente IS NULL OR UPPER(LTRIM(RTRIM(Agente))) = UPPER(LTRIM(RTRIM(@Agente))))
      ORDER BY Agente, Sezione, SottoVoce, Dettaglio;
    `);
    const detailRows = detailRs.recordset || [];

    const wb = xlsx.utils.book_new();

    const summaryRows = mainRows.map(row => ({
      MonthStart: row.MonthStart,
      MESE_LABEL: row.MESE_LABEL,
      Agente: row.Agente,
      Fissi_Pda: Number(row.Fissi_Pda || 0),
      Mobile_Pda: Number(row.Mobile_Pda || 0),
      Perc_RA_su_Mobile: Number(row.Perc_RA_su_Mobile || 0),
      Sim_RA_Tot: Number(row.Sim_RA_Tot || 0),
      Sim_RA_Conv: Number(row.Sim_RA_Conv || 0),
      Sim_RA_OnlyMobile: Number(row.Sim_RA_OnlyMobile || 0),
      Mobile_Pura_Pda: Number(row.Mobile_Pura_Pda || 0),
      Energy_Pda: Number(row.Energy_Pda || 0),
      Sky_Pda: Number(row.Sky_Pda || 0),
      Sim_Vendute: Number(row.Sim_Vendute || 0),
      Euro_RA: Number(row.Euro_RA || 0),
      Euro_Prodotti: Number(row.Euro_Prodotti || 0),
      Euro_SimVendute: Number(row.Euro_SimVendute || 0),
      Euro_Bonus: Number(row.Euro_Bonus || 0),
      Euro_Contributo: Number(row.Euro_Contributo || 0),
      Euro_Totale: Number(row.Euro_Totale || 0),
    }));

    if (summaryRows.length) {
      const totalRow = summaryRows.reduce((acc, row) => {
        const out = { ...acc };
        Object.entries(row).forEach(([key, value]) => {
          if (typeof value === 'number') out[key] = (out[key] || 0) + value;
        });
        return out;
      }, { MonthStart: 'TOTALE', MESE_LABEL: 'Totale', Agente: '' });
      summaryRows.push(totalRow);
    }

    const summarySheet = xlsx.utils.json_to_sheet(summaryRows);
    summarySheet['!cols'] = [
      { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];
    xlsx.utils.book_append_sheet(wb, summarySheet, 'Riepilogo');

    const breakdownSheet = xlsx.utils.json_to_sheet(breakdownRows.map(row => ({
      Sezione: row.Sezione,
      Sottovoce: row.Sottovoce,
      Dettaglio: row.Dettaglio,
      Qty: Number(row.Qty || 0),
      EuroUnit: Number(row.EuroUnit || 0),
      Euro: Number(row.Euro || 0),
    })));
    breakdownSheet['!cols'] = [
      { wch: 20 }, { wch: 20 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];
    xlsx.utils.book_append_sheet(wb, breakdownSheet, 'Breakdown');

    const detailSheet = xlsx.utils.json_to_sheet(detailRows.map(row => ({
      MonthStart: row.MonthStart,
      Agente: row.Agente,
      Sezione: row.Sezione,
      SottoVoce: row.SottoVoce,
      Dettaglio: row.Dettaglio,
      Qty: Number(row.Qty || 0),
      EuroUnit: Number(row.EuroUnit || 0),
      Euro: Number(row.Euro || 0),
      CreatedAt: row.CreatedAt,
    })));
    detailSheet['!cols'] = [
      { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 40 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 20 },
    ];
    xlsx.utils.book_append_sheet(wb, detailSheet, 'Dettaglio');

    const infoSheet = xlsx.utils.aoa_to_sheet([
      ['Filtro mese', monthStart || 'Tutti'],
      ['Filtro agente', agente || 'Tutti'],
      ['Generato il', new Date().toISOString()],
      ['Totale righe riepilogo', mainRows.length],
      ['Totale righe breakdown', breakdownRows.length],
      ['Totale righe dettaglio', detailRows.length],
    ]);
    infoSheet['!cols'] = [{ wch: 20 }, { wch: 50 }];
    xlsx.utils.book_append_sheet(wb, infoSheet, 'Info');

    const buffer = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });
    const safeLabel = monthStart ? monthStart.replace(/[^0-9A-Za-z_-]/g, '-') : 'tutti';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="compensi_agenti_${safeLabel}.xlsx"`);
    return res.send(buffer);
  } catch (e) {
    console.error('[COMPENSI][EXPORT][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante esportazione compensi', details: e?.message || String(e) });
  }
});

// Trend V2 basato su vista dbo.analisi_supermaster_dealer (filtra per IDDealer)
app.get('/api/supermaster/dealers/:id/trend-v2', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'IDDealer non valido' });
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();

    const parseYm = (s) => {
      const m = /^([0-9]{4})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
      if (y < 2000 || mo < 1 || mo > 12) return null;
      return y * 100 + mo; // yyyymm
    };
    const fromYm = parseYm(from);
    const toYm = parseYm(to);
    const whereYm = (fromYm && toYm)
      ? 'AND (Anno*100 + Mese) BETWEEN @FromYm AND @ToYm'
      : (fromYm ? 'AND (Anno*100 + Mese) >= @FromYm' : (toYm ? 'AND (Anno*100 + Mese) <= @ToYm' : ''));

    await getPool();
    const q = new sql.Request();
    // La vista aggregata può essere pesante: aumenta timeout a 60s
    try { q.timeout = 60000; } catch {}
    const __t0 = Date.now();
    q.input('Id', sql.Int, id);
    if (fromYm) q.input('FromYm', sql.Int, fromYm);
    if (toYm) q.input('ToYm', sql.Int, toYm);

    const sqlText = `
      SELECT
        MESE_LABEL,
        Anno,
        Mese,
        MonthStart,
        IDDealer,
        RagioneSociale,
        CAST(ISNULL([TLC FISSO SHP],            0) AS INT) AS tlc_fisso_shp,
        CAST(ISNULL([TLC MOBILE SHP],           0) AS INT) AS tlc_mobile_shp,
        CAST(ISNULL([TLC FISSO RES],            0) AS INT) AS tlc_fisso_res,
        CAST(ISNULL([TLC MOBILE RES],           0) AS INT) AS tlc_mobile_res,
        CAST(ISNULL([TLC MOBILE RES RIC.AUTO],  0) AS INT) AS tlc_mobile_res_ric_auto,
        CAST(ISNULL([TLC MOBILE RES RIC.PURA],  0) AS INT) AS tlc_mobile_res_ric_pura,
        CAST(ISNULL([SKY WIFI],                 0) AS INT) AS sky_wifi,
        CAST(ISNULL([SKY 4P],                   0) AS INT) AS sky_4p,
        CAST(ISNULL([PROVA SKY],                0) AS INT) AS prova_sky,
        CAST(ISNULL([SKY GLASS],                0) AS INT) AS sky_glass,
        CAST(ISNULL([SKY TRIPLE_PLAY],          0) AS INT) AS sky_triple_play,
        CAST(ISNULL([SKYTV_ONLY],               0) AS INT) AS skytv_only,
        CAST(ISNULL([ENERGIA],                  0) AS INT) AS energia
      FROM dbo.analisi_supermaster_dealer
      WHERE IDDealer = @Id
      ${whereYm}
      ORDER BY Anno, Mese`;

    const rs = await q.query(sqlText);
    try { console.log('[COMPENSI][list] done in', (Date.now()-__t0)+'ms', 'rows:', rs?.recordset?.length || 0); } catch {}
    const months = (rs.recordset || []).map(r => ({
      mese_label: r.MESE_LABEL,
      anno: r.Anno,
      mese: r.Mese,
      monthStart: r.MonthStart,
      idDealer: r.IDDealer,
      ragioneSociale: r.RagioneSociale,
      tlc_fisso_shp: r.tlc_fisso_shp ?? 0,
      tlc_mobile_shp: r.tlc_mobile_shp ?? 0,
      tlc_fisso_res: r.tlc_fisso_res ?? 0,
      tlc_mobile_res: r.tlc_mobile_res ?? 0,
      tlc_mobile_res_ric_auto: r.tlc_mobile_res_ric_auto ?? 0,
      tlc_mobile_res_ric_pura: r.tlc_mobile_res_ric_pura ?? 0,
      sky_wifi: r.sky_wifi ?? 0,
      sky_4p: r.sky_4p ?? 0,
      prova_sky: r.prova_sky ?? 0,
      sky_glass: r.sky_glass ?? 0,
      sky_triple_play: r.sky_triple_play ?? 0,
      skytv_only: r.skytv_only ?? 0,
      energia: r.energia ?? 0,
    }));
    return res.json({ idDealer: id, from, to, months });
  } catch (e) {
    console.error('[SM][DEALER TREND V2][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante trend dealer v2', details: e?.message || String(e) });
  }
});

// ================= COMPENSI (READ-ONLY) =================
// Helper ruolo SUPERMASTER e MASTERPRODOTTI
const isSupermaster = (req) => {
  try {
    const roles = Array.isArray(req?.user?.ruoli) ? req.user.ruoli.map(r => String(r || '').toUpperCase()) : [];
    const role = String(req?.user?.role || req?.user?.ruolo || '').toUpperCase();
    return role === 'SUPERMASTER' || roles.includes('SUPERMASTER') ||
           role === 'MASTERPRODOTTI' || roles.includes('MASTERPRODOTTI') ||
           role === 'MASTER_PRODOTTI' || roles.includes('MASTER_PRODOTTI');
  } catch {
    return false;
  }
};

// Cache semplice per i filtri (60s)
let __compensiFiltersCache = { at: 0, data: null };
console.log('[COMPENSI] Registrazione endpoint: /api/compensi/filters, /api/compensi, /api/compensi/extra-detail');
app.get('/api/compensi/filters', authenticateToken, async (req, res) => {
  try { console.log('[COMPENSI][filters] hit'); } catch {}
  try {
    if (!isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });

    const now = Date.now();
    if (__compensiFiltersCache.data && now - __compensiFiltersCache.at < 60000) {
      return res.json(__compensiFiltersCache.data);
    }

    await getPool();
    // Mesi
    const monthsRs = await new sql.Request().query(`
      SELECT DISTINCT MESE_LABEL, FORMAT(MonthStart, 'yyyy-MM-dd') AS MonthStartStr, MonthStart
      FROM dbo.vw_compensi_agenti_mese_agg
      ORDER BY MonthStart DESC;
    `);
    // Agenti
    const agentsRs = await new sql.Request().query(`
      SELECT DISTINCT Agente
      FROM dbo.vw_compensi_agenti_mese_agg
      ORDER BY Agente;
    `);
    const months = (monthsRs.recordset || []).map(r => ({
      meseLabel: r.MESE_LABEL,
      monthStart: r.MonthStartStr || r.MonthStart, // preferisci stringa YYYY-MM-DD
    }));
    const agents = (agentsRs.recordset || []).map(r => r.Agente).filter(Boolean);
    const payload = { months, agents };
    __compensiFiltersCache = { at: now, data: payload };
    return res.json(payload);
  } catch (e) {
    console.error('[COMPENSI][FILTERS][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante lettura filtri compensi', details: e?.message || String(e) });
  }
});

// GET /api/compensi?monthStart=YYYY-MM-01&agente=...
app.get('/api/compensi', authenticateToken, async (req, res) => {
  try { console.log('[COMPENSI][list] hit', { qs: req?.query }); } catch {}
  try {
    if (!isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });

    const monthStart = (req.query.monthStart || '').toString().trim();
    const agente = (req.query.agente || '').toString().trim();

    await getPool();
    const q = new sql.Request();
    try { q.timeout = 120000; } catch {}
    
    // Usa la stored procedure sp_compensi_mensili_agente per dati real-time
    if (monthStart) q.input('MonthStart', sql.VarChar(10), monthStart);
    if (agente) q.input('Agente', sql.NVarChar(100), agente);

    const rs = await q.execute('dbo.sp_compensi_mensili_agente');
    const rows = (rs.recordset || []).map(r => ({
      MonthStart: r.MonthStart,
      MESE_LABEL: r.MonthStart ? new Date(r.MonthStart).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : '',
      Agente: r.Agente,
      // KPI quantità
      Fissi_Pda: r.Q_Fissi || 0,
      FissoStart_Pda: r.Q_FissoStart || 0,
      Energy_Pda: r.Q_Energy || 0,
      Mobile_Pda: r.Q_Mobili || 0,
      Sim_RA_Tot: r.Q_MobileRA || 0,
      Perc_RA_su_Mobile: r.PercRA_Mobile || 0,
      Sky_Pda: 0, // Non presente nella SP, da aggiungere se necessario
      Sim_Vendute: 0, // Non presente nella SP
      // Euro compensi
      Euro_Fissi: r.Euro_Fissi_Base || 0,
      Euro_Energy: r.Euro_Energy_Base || 0,
      Euro_RA: r.Euro_Mobile_RA || 0,
      Euro_Bonus_Energy: r.Euro_Bonus_Energy || 0,
      Euro_Bonus_Fissi: r.Euro_Bonus_Fissi140 || 0,
      Euro_Bonus_Mobile: r.Euro_Bonus_Mobile290_RA50 || 0,
      Euro_Extra_FissiComposizione: r.Euro_Extra_Fissi_Composizione || 0,
      Euro_SKY: r.Euro_SKY_Core || 0,
      Euro_SIM: r.Euro_SIM || 0,
      Euro_Contributo: r.Euro_Rimborso || 0,
      Euro_Totale_FASTWEB: r.Euro_Totale_FASTWEB || 0,
      Euro_Totale_SKY: r.Euro_Totale_SKY || 0,
      Euro_Totale_SIM: r.Euro_Totale_SIM || 0,
      Euro_Totale: r.Euro_Totale_Complessivo || 0,
      Euro_Totale_Completo: r.Euro_Totale_Complessivo || 0,
      // Compatibilità con nomi vecchi
      Euro_Prodotti: (r.Euro_Fissi_Base || 0) + (r.Euro_Energy_Base || 0),
      Euro_SimVendute: r.Euro_SIM || 0,
      Euro_Bonus: (r.Euro_Bonus_Energy || 0) + (r.Euro_Bonus_Fissi140 || 0) + (r.Euro_Bonus_Mobile290_RA50 || 0),
    }));
    
    return res.json({ rows });
  } catch (e) {
    console.error('[COMPENSI][LIST][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante lettura compensi', details: e?.message || String(e) });
  }
});

// GET /api/compensi/extra-detail?monthStart=...&agente=...
app.get('/api/compensi/extra-detail', authenticateToken, async (req, res) => {
  try { console.log('[COMPENSI][extra] hit', { qs: req?.query }); } catch {}
  try {
    if (!isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });

    const monthStart = (req.query.monthStart || '').toString().trim();
    const agente = (req.query.agente || '').toString().trim();

    await getPool();
    const q = new sql.Request();
    if (monthStart) {
      q.input('p_monthStart', sql.VarChar(10), monthStart);
    } else {
      q.input('p_monthStart', sql.VarChar(10), null);
    }
    if (agente) {
      q.input('p_agente', sql.NVarChar(100), agente);
    } else {
      q.input('p_agente', sql.NVarChar(100), null);
    }

    const sqlText = `
      DECLARE @MonthStart date = CONVERT(date, @p_monthStart, 23);   -- può essere NULL
      DECLARE @Agente     nvarchar(100) = @p_agente; -- può essere NULL

      SELECT
        MonthStart,
        Agente,
        Sezione,
        SottoVoce,
        Dettaglio,
        Qty,
        EuroUnit,
        Euro,
        CreatedAt
      FROM dbo.compensi_agenti_mese_dettaglio WITH (NOLOCK)
      WHERE (@MonthStart IS NULL OR MonthStart = @MonthStart)
        AND (@Agente IS NULL OR UPPER(LTRIM(RTRIM(Agente))) = UPPER(LTRIM(RTRIM(@Agente))))
      ORDER BY Sezione, SottoVoce, Dettaglio, CreatedAt;
    `;

    const rs = await q.query(sqlText);
    const rows = (rs.recordset || []).map(r => ({
      monthStart: r.MonthStart,
      agente: r.Agente,
      sezione: r.Sezione,
      sottoVoce: r.SottoVoce,
      dettaglio: r.Dettaglio,
      qty: r.Qty,
      euroUnit: r.EuroUnit,
      euro: r.Euro,
      createdAt: r.CreatedAt,
    }));
    return res.json({ rows });
  } catch (e) {
    console.error('[COMPENSI][EXTRA][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante lettura extra', details: e?.message || String(e) });
  }
});

const buildSyntheticBonusRows = (aggregates = {}) => {
  const rows = [];
  const pushRow = (sezione, sottoVoce, dettaglio, value) => {
    const amount = Number(value || 0);
    if (!amount) return;
    rows.push({
      sezione,
      sottoVoce,
      dettaglio,
      qty: 1,
      euroUnit: amount,
      euro: amount,
    });
  };

  pushRow('BONUS', 'BONUS_SOGLIE', 'Bonus soglie Fissi/Energy', aggregates.Euro_Bonus_Soglie);
  pushRow('BONUS', 'BONUS_MOBILE_AUTO', 'Bonus Mobile Auto (% RA su TOT SIM)', aggregates.Euro_Bonus_MobileAuto);
  pushRow('BONUS', 'BONUS_EXTRA_FISSI', 'Extra composizione Fissi', aggregates.Euro_Bonus_ExtraFissi);
  pushRow('BONUS', 'BONUS_SIM_RA', 'Bonus SIM RA 50%', aggregates.Euro_Bonus_SimRA);
  pushRow('BONUS', 'BONUS_SIM_MNP', 'Bonus SIM MNP Target', aggregates.Euro_Bonus_SimMNP);

  pushRow('ENI', 'ENI_BASE', 'Compenso base ENI', aggregates.Euro_ENI_Base);
  pushRow('ENI', 'ENI_ADDEBITO', 'Addebito RID ENI', aggregates.Euro_ENI_Addebito);
  pushRow('ENI', 'ENI_BOOST', 'Boost ENI (Energy + ENI)', aggregates.Euro_ENI_Boost);

  return rows;
};

const fetchCompensiAggregates = async (monthStartDate, agente) => {
  if (!agente) return null;
  const req = new sql.Request();
  req.input('p_monthStart', sql.Date, monthStartDate);
  req.input('p_agente', sql.NVarChar(100), agente);
  const aggRs = await req.query(`
    SELECT TOP (1)
      Euro_Bonus_Soglie,
      Euro_Bonus_MobileAuto,
      Euro_Bonus_ExtraFissi,
      Euro_Bonus_SimRA,
      Euro_Bonus_SimMNP,
      Euro_ENI_Base,
      Euro_ENI_Addebito,
      Euro_ENI_Boost
    FROM dbo.vw_compensi_agenti_mese_compensi WITH (NOLOCK)
    WHERE MonthStart = @p_monthStart
      AND UPPER(LTRIM(RTRIM(Agente))) = UPPER(LTRIM(RTRIM(@p_agente)));
  `);
  return aggRs.recordset?.[0] || null;
};

// GET /api/compensi/breakdown?monthStart=...&agente=...
app.get('/api/compensi/breakdown', authenticateToken, async (req, res) => {
  try { console.log('[COMPENSI][breakdown] hit', { qs: req?.query }); } catch {}
  try {
    if (!isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });

    const monthStart = (req.query.monthStart || '').toString().trim();
    const agente = (req.query.agente || '').toString().trim();

    if (!monthStart) {
      return res.status(400).json({ error: 'monthStart è richiesto per il breakdown' });
    }

    await getPool();
    const monthStartDate = new Date(monthStart);
    if (Number.isNaN(monthStartDate.getTime())) {
      return res.status(400).json({ error: 'monthStart non valido' });
    }

    const q = new sql.Request();
    try { q.timeout = 120000; } catch {}
    
    q.input('p_monthStart', sql.Date, monthStartDate);
    q.input('p_agente', sql.NVarChar(100), agente || null);

    const sqlText = `
      SELECT * 
      FROM dbo.fn_compensi_agente_breakdown(@p_monthStart, @p_agente)
      ORDER BY 
        CASE Sezione 
          WHEN 'PRODOTTO' THEN 1 
          WHEN 'MOBILE_RA' THEN 2 
          WHEN 'SIM_BASE' THEN 3 
          WHEN 'BONUS' THEN 4 
          WHEN 'CONTRIBUTO' THEN 5 
          ELSE 9 
        END,
        Sottovoce, Dettaglio;
    `;

    const rs = await q.query(sqlText);
    const rows = (rs.recordset || []).map(r => ({
      sezione: r.Sezione,
      sottoVoce: r.Sottovoce,
      dettaglio: r.Dettaglio,
      qty: r.Qty,
      euroUnit: r.EuroUnit,
      euro: r.Euro,
    }));

    let syntheticRows = [];
    if (agente) {
      try {
        const aggregates = await fetchCompensiAggregates(monthStartDate, agente);
        if (aggregates) {
          syntheticRows = buildSyntheticBonusRows(aggregates);
        }
      } catch (aggErr) {
        console.warn('[COMPENSI][BREAKDOWN][WARN] Agg aggregates failed:', aggErr?.message || aggErr);
      }
    }
    const finalRows = rows.concat(syntheticRows);
    
    return res.json({ rows: finalRows });
  } catch (e) {
    console.error('[COMPENSI][BREAKDOWN][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante lettura breakdown', details: e?.message || String(e) });
  }
});

// Inspect via upload: non salva né importa, restituisce solo headers/preview dello sheet INSERITO KIM
app.post('/api/admin/imports/inseritofw-full/inspect-upload', authenticateToken, onlyAdmin, fwInseritoUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante' });
    const buf = req.file.buffer;
    if (!buf || buf.length === 0) return res.status(400).json({ error: 'File vuoto' });
    const wb = xlsx.read(buf, { type: 'buffer' });
    const sheetName = pickInseritoKimSheet(wb, 'INSERITO KIM');
    if (!sheetName) return res.status(400).json({ error: 'Foglio "INSERITO KIM" non trovato', availableSheets: wb.SheetNames || [] });
    const ws = wb.Sheets[sheetName];
    const range = xlsx.utils.decode_range(ws['!ref']);
    const headerRow = range.s.r;
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[xlsx.utils.encode_cell({ r: headerRow, c })];
      const val = cell ? String(cell.v ?? cell.w ?? '').trim() : '';
      headers.push(val);
    }
    const json = xlsx.utils.sheet_to_json(ws, { defval: '', raw: false });
    const preview = json.slice(0, 5);
    return res.json({ success: true, sheet: sheetName, headers, previewCount: preview.length, preview });
  } catch (e) {
    console.error('[INSERITOFW-FULL][INSPECT-UPLOAD][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante inspect-upload', details: e?.message || String(e) });
  }
});
    } catch {}
  }
  candidates.sort((a,b) => b.score - a.score);
  return candidates[0]?.score > 0 ? candidates[0].sn : available[0];
}

// Inizializza Express APP in alto (necessario perché alcune route vengono definite presto)
const app = express();

// ================= EARLY MOUNT: COMPENSI (READ-ONLY) =================
// Nota: registriamo queste rotte subito dopo l'init di Express per evitare che middleware/router successivi
// intercettino e rispondano 404 prima di arrivare qui.
try {
  console.log('[COMPENSI][EARLY] mount start');
  const __isSupermaster = (req) => {
    try {
      const roles = Array.isArray(req?.user?.ruoli) ? req.user.ruoli.map(r => String(r || '').toUpperCase()) : [];
      const role = String(req?.user?.role || req?.user?.ruolo || '').toUpperCase();
      return role === 'SUPERMASTER' || roles.includes('SUPERMASTER') ||
             role === 'MASTERPRODOTTI' || roles.includes('MASTERPRODOTTI') ||
             role === 'MASTER_PRODOTTI' || roles.includes('MASTER_PRODOTTI');
    } catch { return false; }
  };
  let __filtersCache = { at: 0, data: null };
  app.get('/api/compensi/filters', authenticateToken, async (req, res) => {
    try { console.log('[COMPENSI][EARLY][filters] hit'); } catch {}
    try {
      if (!__isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });
      // FORCE REFRESH: Disabilita cache temporaneamente per debug duplicati
      const forceRefresh = true;
      await getPool();
      const monthsRs = await new sql.Request().query(`
        SELECT DISTINCT MESE_LABEL, FORMAT(MonthStart, 'yyyy-MM-dd') AS MonthStartStr, MonthStart
        FROM dbo.vw_compensi_agenti_mese_compensi WITH (NOLOCK)
        WHERE MonthStart IS NOT NULL 
          AND MESE_LABEL IS NOT NULL 
          AND MESE_LABEL != 'Tutti i mesi'
          AND MESE_LABEL NOT LIKE '%tutti%'
          AND MESE_LABEL NOT LIKE '%Tutti%'
          AND MESE_LABEL NOT LIKE '%TUTTI%'
          AND LEN(MESE_LABEL) > 3
          AND MESE_LABEL NOT LIKE '____-__'  -- Escludi formato data (es: 2025-10)
          AND MESE_LABEL LIKE '%-%'          -- Mantieni solo formato label (es: Ottobre-2025)
        ORDER BY MonthStart DESC;`);
      const agentsRs = await new sql.Request().query(`
        SELECT DISTINCT Agente
        FROM dbo.vw_compensi_agenti_mese_compensi WITH (NOLOCK)
        WHERE Agente IS NOT NULL AND Agente != ''
        ORDER BY Agente;`);
      const months = (monthsRs.recordset || []).map(r => ({ meseLabel: r.MESE_LABEL, monthStart: r.MonthStartStr || r.MonthStart }));
      const agents = (agentsRs.recordset || []).map(r => r.Agente).filter(Boolean);
      const payload = { months, agents };
      __filtersCache = { at: Date.now(), data: payload };
      return res.json(payload);
    } catch (e) {
      console.error('[COMPENSI][EARLY][FILTERS][ERR]', e?.message || e);
      return res.status(500).json({ error: 'Errore durante lettura filtri compensi', details: e?.message || String(e) });
    }
  });
  // Cache semplice per risultati /api/compensi EARLY (TTL 1 min per test)
  const __compensiEarlyCache = new Map(); // key: monthStart|agente -> { ts, rows }
  const COMPENSI_TTL_MS = 1 * 60 * 1000; // Ridotto a 1 minuto per test

  app.get('/api/compensi', authenticateToken, async (req, res) => {
    try { console.log('[COMPENSI][EARLY][list] hit', { qs: req?.query }); } catch {}
    try {
      if (!__isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });
      const monthStart = (req.query.monthStart || '').toString().trim();
      const agente = (req.query.agente || '').toString().trim();
      await getPool();
      const q = new sql.Request();
      try { q.timeout = 120000; } catch {}
      
      // Determina se usare la nuova logica (da Settembre 2025 in poi)
      // FIX: Esteso a Settembre 2025 perché la vecchia SP ha dati errati
      const useNewSP = monthStart && monthStart >= '2025-09-01';
      
      if (useNewSP) {
        // NUOVA LOGICA: Doppia chiamata per dati completi
        console.log('[COMPENSI][EARLY] Usando doppia SP per', monthStart);
        
        // 1. Chiamata a GetOrderStatisticsByAgent_V3 per KPI (conteggi)
        const qKpi = new sql.Request();
        try { qKpi.timeout = 120000; } catch {}
        
        // Estrai anno e mese da monthStart (es. "2025-10-01" -> anno=2025, mese=10)
        const [year, month] = monthStart.split('-').map(Number);
        
        // NUOVA V5: Accetta @agente, @year, @month, @dealer
        qKpi.input('agente', sql.NVarChar(50), agente || null);
        qKpi.input('year', sql.Int, year);
        qKpi.input('month', sql.Int, month);  // NUOVO: filtro mese specifico
        qKpi.input('dealer', sql.NVarChar(255), null);
        
        console.log('[COMPENSI][DEBUG] Chiamata GetOrderStatisticsByAgent_V5 con year:', year, 'month:', month, 'agente:', agente || 'NULL');
        
        let rsKpi;
        try {
          rsKpi = await qKpi.execute('dbo.GetOrderStatisticsByAgent_V5');
          console.log('[COMPENSI][DEBUG] KPI Raw recordset count:', rsKpi.recordset?.length || 0);
          console.log('[COMPENSI][DEBUG] KPI Raw recordset:', JSON.stringify(rsKpi.recordset, null, 2));
          
          // V5 già filtra per mese, non serve più filtrare manualmente!
        } catch (errKpi) {
          console.error('[COMPENSI][ERROR] Errore GetOrderStatisticsByAgent_V5:', errKpi);
          return res.status(500).json({ error: 'Errore durante il caricamento dei KPI', details: errKpi.message });
        }
        
        // 2. Chiamata alla vista vw_compensi_agenti_mese_compensi per compensi (€) - FIX: era sp_compensi_mensili_agente con dati errati
        const qCompensi = new sql.Request();
        try { qCompensi.timeout = 120000; } catch {}
        
        if (monthStart) qCompensi.input('p_monthStart', sql.VarChar(10), monthStart);
        if (agente) qCompensi.input('p_agente', sql.NVarChar(100), agente);
        
        let rsCompensi;
        try {
          rsCompensi = await qCompensi.query(`
            SELECT *
            FROM dbo.vw_compensi_agenti_mese_compensi WITH (NOLOCK)
            WHERE (@p_monthStart IS NULL OR MonthStart = CONVERT(date, @p_monthStart, 23))
              AND (@p_agente IS NULL OR Agente = @p_agente);
          `);
          console.log('[COMPENSI][DEBUG] Compensi Raw recordset (da VISTA - FIX):', JSON.stringify(rsCompensi.recordset, null, 2));
        } catch (errCompensi) {
          console.error('[COMPENSI][ERROR] Errore vista vw_compensi_agenti_mese_compensi:', errCompensi);
          return res.status(500).json({ error: 'Errore durante il caricamento dei compensi', details: errCompensi.message });
        }
        
        // 3. Merge dei dati
        const rows = (rsCompensi.recordset || []).map(rCompensi => {
          // Trova la riga corrispondente nei KPI
          // NOTA: KPI ritorna "G", Compensi ritorna "GIACOMO" -> matcha su prima lettera
          const agenteCompensi = (rCompensi.Agente || '').toUpperCase();
          const primaLetteraCompensi = agenteCompensi.charAt(0);
          
          const rKpi = (rsKpi.recordset || []).find(k => {
            const agenteKpi = (k.Agente || '').toUpperCase();
            // Match: "G" === "G" (prima lettera di GIACOMO)
            return agenteKpi === primaLetteraCompensi || agenteKpi === agenteCompensi;
          }) || {};
          
          console.log('[COMPENSI][DEBUG] Match agente:', {
            compensi: agenteCompensi,
            primaLettera: primaLetteraCompensi,
            kpi: rKpi.Agente,
            matched: Object.keys(rKpi).length > 0
          });
          
          console.log('[COMPENSI][DEBUG] Merging data for agente:', rCompensi.Agente);
          console.log('[COMPENSI][DEBUG] KPI row:', JSON.stringify(rKpi, null, 2));
          console.log('[COMPENSI][DEBUG] Compensi row:', JSON.stringify(rCompensi, null, 2));
          
          const mapped = {
            MonthStart: rCompensi.MonthStart,
            MESE_LABEL: rCompensi.MonthStart ? new Date(rCompensi.MonthStart).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : '',
            Agente: rCompensi.Agente,
            // KPI quantità da GetOrderStatisticsByAgent_V5
            Fissi_Pda: rKpi.FISSI || 0,
            FissoStart_Pda: rKpi.FissoStart || 0,
            Energy_Pda: rKpi.ENERGY || 0,
            Mobile_Pda: rKpi.MOBILI || 0,
            Sim_RA_Tot: rKpi.MobileRA || 0,
            Sim_RA_Conv: rKpi.MobileRA_Conv_TOTALE || 0,  // V5 ritorna già il totale
            Sim_RA_OnlyMobile: rKpi.MobileRA_Only_TOTALE || 0,  // V5 ritorna già il totale
            Mobile_Pura_Pda: (rKpi.MOBILI || 0) - (rKpi.MobileRA || 0),  // Calcolo: MOBILI - MobileRA
            Perc_RA_su_Mobile: rKpi.MobilePercentRA || 0,
            Sky_Pda: rKpi.SKY_TOTALE || 0,  // ✅ V5 ritorna SKY!
            Sim_Vendute: rKpi.SIM_VENDUTE || 0,  // ✅ V5 ritorna SIM!
            // Euro compensi da vw_compensi_agenti_mese_compensi (FIX: usa colonne esistenti)
            Euro_RA: rCompensi.Euro_RA || 0,
            Euro_Prodotti: rCompensi.Euro_Prodotti || 0,
            Euro_SimVendute: rCompensi.Euro_SimVendute || 0,
            Euro_Bonus: rCompensi.Euro_Bonus || 0,
            Euro_Contributo: rCompensi.Euro_Contributo || 0,
            Euro_Bonus_MobileAuto: 0,  // Colonna non esiste nella vista
            Euro_Extra_FissiComposizione: 0,  // Colonna non esiste nella vista
            // FIX: Usa Euro_Totale dalla vista invece di calcolare manualmente
            Euro_Totale_Completo: rCompensi.Euro_Totale || 0,
            Euro_Totale: rCompensi.Euro_Totale || 0,
          };
          
          console.log('[COMPENSI][DEBUG] Mapped row:', JSON.stringify(mapped, null, 2));
          
          return mapped;
        });
        
        console.log('[COMPENSI][DEBUG] Final rows sent to frontend:', JSON.stringify(rows, null, 2));
        return res.json({ rows });
      } else {
        // VECCHIA LOGICA: Usa sp_get_compensi_dashboard per <= Settembre 2025
        console.log('[COMPENSI][EARLY] Usando sp_get_compensi_dashboard (cache) per', monthStart || 'TUTTI');
        if (monthStart) q.input('p_monthStart', sql.VarChar(10), monthStart); else q.input('p_monthStart', sql.VarChar(10), null);
        if (agente) q.input('p_agente', sql.NVarChar(100), agente); else q.input('p_agente', sql.NVarChar(100), null);
        
        // Check cache
        const cacheKey = `${monthStart || 'ALL'}|${agente || 'ALL'}`;
        const now = Date.now();
        const cached = __compensiEarlyCache.get(cacheKey);
        if (cached && (now - cached.ts) < COMPENSI_TTL_MS) {
          try { console.log('[COMPENSI][EARLY][cache] hit for', cacheKey); } catch {}
          return res.json({ rows: cached.rows });
        }
        
        const sqlText = `
          DECLARE @MonthStart date = CONVERT(date, @p_monthStart, 23);
          DECLARE @Agente     nvarchar(100) = @p_agente;
          
          -- Usa stored procedure ottimizzata con cache
          EXEC dbo.sp_get_compensi_dashboard @MonthStart=@MonthStart, @Agente=@Agente;
        `;
        const __t0 = Date.now();
        const rs = await q.query(sqlText);
        try { console.log('[COMPENSI][EARLY][list] done in', (Date.now()-__t0)+'ms', 'rows:', rs?.recordset?.length || 0); } catch {}
        const rows = rs.recordset || [];
        __compensiEarlyCache.set(cacheKey, { ts: now, rows });
        return res.json({ rows });
      }
    } catch (e) {
      console.error('[COMPENSI][EARLY][LIST][ERR]', e?.message || e);
      return res.status(500).json({ error: 'Errore durante lettura compensi', details: e?.message || String(e) });
    }
  });
  app.get('/api/compensi/extra-detail', authenticateToken, async (req, res) => {
    try { console.log('[COMPENSI][EARLY][extra] hit', { qs: req?.query }); } catch {}
    try {
      if (!__isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });
      const monthStart = (req.query.monthStart || '').toString().trim();
      const agente = (req.query.agente || '').toString().trim();
      await getPool();
      const q = new sql.Request();
      if (monthStart) {
        q.input('p_monthStart', sql.VarChar(10), monthStart);
      } else {
        q.input('p_monthStart', sql.VarChar(10), null);
      }
      if (agente) {
        q.input('p_agente', sql.NVarChar(100), agente);
      } else {
        q.input('p_agente', sql.NVarChar(100), null);
      }
      const sqlText = `
        DECLARE @MonthStart date = CONVERT(date, @p_monthStart, 23);
        DECLARE @Agente     nvarchar(100) = @p_agente;
        SELECT
          MonthStart,
          Agente,
          Sezione,
          SottoVoce,
          Dettaglio,
          Qty,
          EuroUnit,
          Euro,
          CreatedAt
        FROM dbo.compensi_agenti_mese_dettaglio WITH (NOLOCK)
        WHERE (@MonthStart IS NULL OR MonthStart = @MonthStart)
          AND (@Agente IS NULL OR UPPER(LTRIM(RTRIM(Agente))) = UPPER(LTRIM(RTRIM(@Agente))))
        ORDER BY Sezione, SottoVoce, Dettaglio, CreatedAt;`;
      const rs = await q.query(sqlText);
      try {
        console.log('[COMPENSI][EARLY][extra] db rows:', rs.recordset?.length ?? 0);
        if (Array.isArray(rs.recordset) && rs.recordset.length > 0) {
          const sample = rs.recordset[0];
          console.log('[COMPENSI][EARLY][extra] sample keys:', Object.keys(sample || {}));
        }
      } catch {}
      const rows = (rs.recordset || []).map(r => ({
        monthStart: r.MonthStart,
        agente: r.Agente,
        sezione: r.Sezione,
        sottoVoce: r.SottoVoce,
        dettaglio: r.Dettaglio,
        qty: r.Qty,
        euroUnit: r.EuroUnit,
        euro: r.Euro,
        createdAt: r.CreatedAt,
      }));
      return res.json({ rows });
    } catch (e) {
      console.error('[COMPENSI][EARLY][EXTRA][ERR]', e?.message || e);
      return res.status(500).json({ error: 'Errore durante lettura extra', details: e?.message || String(e) });
    }
  });

  // GET /api/compensi/breakdown EARLY
  app.get('/api/compensi/breakdown', authenticateToken, async (req, res) => {
    try { console.log('[COMPENSI][EARLY][breakdown] hit', { qs: req?.query }); } catch {}
    try {
      if (!__isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });

      const monthStart = (req.query.monthStart || '').toString().trim();
      const agente = (req.query.agente || '').toString().trim();

      if (!monthStart) {
        return res.status(400).json({ error: 'monthStart è richiesto per il breakdown' });
      }

      await getPool();
      const monthStartDate = new Date(monthStart);
      if (Number.isNaN(monthStartDate.getTime())) {
        return res.status(400).json({ error: 'monthStart non valido' });
      }

      const q = new sql.Request();
      try { q.timeout = 120000; } catch {}
      
      q.input('p_monthStart', sql.Date, monthStartDate);
      q.input('p_agente', sql.NVarChar(100), agente || null);

      const sqlText = `
        DECLARE @MonthStart date = @p_monthStart;
        DECLARE @Agente nvarchar(100) = @p_agente;
        
        -- Usa stored procedure ottimizzata con cache
        EXEC dbo.sp_get_compensi_breakdown @MonthStart=@MonthStart, @Agente=@Agente;
      `;

      const rs = await q.query(sqlText);
      const rows = (rs.recordset || []).map(r => ({
        sezione: r.Sezione,
        sottoVoce: r.Sottovoce,
        dettaglio: r.Dettaglio,
        qty: r.Qty,
        euroUnit: r.EuroUnit,
        euro: r.Euro,
      }));
      let syntheticRows = [];
      if (agente) {
        try {
          const aggregates = await fetchCompensiAggregates(monthStartDate, agente);
          if (aggregates) {
            syntheticRows = buildSyntheticBonusRows(aggregates);
          }
        } catch (aggErr) {
          console.warn('[COMPENSI][EARLY][BREAKDOWN][WARN] Agg aggregates failed:', aggErr?.message || aggErr);
        }
      }
      const finalRows = rows.concat(syntheticRows);
      
      return res.json({ rows: finalRows });
    } catch (e) {
      console.error('[COMPENSI][EARLY][BREAKDOWN][ERR]', e?.message || e);
      return res.status(500).json({ error: 'Errore durante lettura breakdown', details: e?.message || String(e) });
    }
  });

  app.get('/api/compensi/export', authenticateToken, async (req, res) => {
    try { console.log('[COMPENSI][export] hit', { qs: req?.query }); } catch {}
    try {
      if (!__isSupermaster(req)) return res.status(403).json({ error: 'Forbidden' });

      const monthStart = (req.query.monthStart || '').toString().trim();
      const agente = (req.query.agente || '').toString().trim();

      await getPool();

      const EXPORT_TIMEOUT_MS = 300000; // 5 minuti per dataset estesi

      const mainReq = new sql.Request();
      try { mainReq.timeout = EXPORT_TIMEOUT_MS; } catch {}
      mainReq.input('p_monthStart', sql.Date, monthStart ? new Date(monthStart) : null);
      mainReq.input('p_agente', sql.NVarChar(100), agente || null);
      const tMain = Date.now();
      const mainRs = await mainReq.query(`
        DECLARE @MonthStart date = CONVERT(date, @p_monthStart, 23);
        DECLARE @Agente nvarchar(100) = @p_agente;
        SELECT *
        FROM dbo.vw_compensi_agenti_mese_compensi WITH (NOLOCK)
        WHERE (@MonthStart IS NULL OR MonthStart = @MonthStart)
          AND (@Agente IS NULL OR Agente IN (SELECT value FROM STRING_SPLIT(@Agente,',')))
        ORDER BY MonthStart, Agente;
      `);
      const mainRows = mainRs.recordset || [];
      try { console.log('[COMPENSI][export] main rows', mainRows.length, 'in', (Date.now()-tMain)+'ms'); } catch {}

      const breakdownReq = new sql.Request();
      try { breakdownReq.timeout = EXPORT_TIMEOUT_MS; } catch {}
      breakdownReq.input('p_monthStart', sql.Date, monthStart ? new Date(monthStart) : null);
      breakdownReq.input('p_agente', sql.NVarChar(100), agente || null);
      const tBreakdown = Date.now();
      const breakdownRs = await breakdownReq.query(`
        SELECT *
        FROM dbo.fn_compensi_agente_breakdown(@p_monthStart, @p_agente)
        ORDER BY Sezione, Sottovoce, Dettaglio;
      `);
      const breakdownRows = breakdownRs.recordset || [];
      try { console.log('[COMPENSI][export] breakdown rows', breakdownRows.length, 'in', (Date.now()-tBreakdown)+'ms'); } catch {}

      const detailReq = new sql.Request();
      try { detailReq.timeout = EXPORT_TIMEOUT_MS; } catch {}
      detailReq.input('p_monthStart', sql.VarChar(10), monthStart || null);
      detailReq.input('p_agente', sql.NVarChar(100), agente || null);
      const tDetail = Date.now();
      const detailRs = await detailReq.query(`
        DECLARE @MonthStart date = CONVERT(date, @p_monthStart, 23);
        DECLARE @Agente nvarchar(100) = @p_agente;
        SELECT MonthStart, Agente, Sezione, SottoVoce, Dettaglio, Qty, EuroUnit, Euro, CreatedAt
        FROM dbo.compensi_agenti_mese_dettaglio WITH (NOLOCK)
        WHERE (@MonthStart IS NULL OR MonthStart = @MonthStart)
          AND (@Agente IS NULL OR UPPER(LTRIM(RTRIM(Agente))) = UPPER(LTRIM(RTRIM(@Agente))))
        ORDER BY Agente, Sezione, SottoVoce, Dettaglio;
      `);
      const detailRows = detailRs.recordset || [];
      try { console.log('[COMPENSI][export] dettaglio rows', detailRows.length, 'in', (Date.now()-tDetail)+'ms'); } catch {}

      const wb = xlsx.utils.book_new();

      const summaryRows = mainRows.map(row => ({
        MonthStart: row.MonthStart,
        MESE_LABEL: row.MESE_LABEL,
        Agente: row.Agente,
        Fissi_Pda: Number(row.Fissi_Pda || 0),
        Mobile_Pda: Number(row.Mobile_Pda || 0),
        Perc_RA_su_Mobile: Number(row.Perc_RA_su_Mobile || 0),
        Sim_RA_Tot: Number(row.Sim_RA_Tot || 0),
        Sim_RA_Conv: Number(row.Sim_RA_Conv || 0),
        Sim_RA_OnlyMobile: Number(row.Sim_RA_OnlyMobile || 0),
        Mobile_Pura_Pda: Number(row.Mobile_Pura_Pda || 0),
        Energy_Pda: Number(row.Energy_Pda || 0),
        Sky_Pda: Number(row.Sky_Pda || 0),
        Sim_Vendute: Number(row.Sim_Vendute || 0),
        Euro_RA: Number(row.Euro_RA || 0),
        Euro_Prodotti: Number(row.Euro_Prodotti || 0),
        Euro_SimVendute: Number(row.Euro_SimVendute || 0),
        Euro_Bonus: Number(row.Euro_Bonus || 0),
        Euro_Contributo: Number(row.Euro_Contributo || 0),
        Euro_Totale: Number(row.Euro_Totale || 0),
      }));

      if (summaryRows.length) {
        const totalRow = summaryRows.reduce((acc, row) => {
          const out = { ...acc };
          Object.entries(row).forEach(([key, value]) => {
            if (typeof value === 'number') out[key] = (out[key] || 0) + value;
          });
          return out;
        }, { MonthStart: 'TOTALE', MESE_LABEL: 'Totale', Agente: '' });
        summaryRows.push(totalRow);
      }

      const summarySheet = xlsx.utils.json_to_sheet(summaryRows);
      summarySheet['!cols'] = [
        { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      ];
      xlsx.utils.book_append_sheet(wb, summarySheet, 'Riepilogo');

      const breakdownSheet = xlsx.utils.json_to_sheet(breakdownRows.map(row => ({
        Sezione: row.Sezione,
        Sottovoce: row.Sottovoce,
        Dettaglio: row.Dettaglio,
        Qty: Number(row.Qty || 0),
        EuroUnit: Number(row.EuroUnit || 0),
        Euro: Number(row.Euro || 0),
      })));
      breakdownSheet['!cols'] = [
        { wch: 20 }, { wch: 20 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      ];
      xlsx.utils.book_append_sheet(wb, breakdownSheet, 'Breakdown');

      const detailSheet = xlsx.utils.json_to_sheet(detailRows.map(row => ({
        MonthStart: row.MonthStart,
        Agente: row.Agente,
        Sezione: row.Sezione,
        SottoVoce: row.SottoVoce,
        Dettaglio: row.Dettaglio,
        Qty: Number(row.Qty || 0),
        EuroUnit: Number(row.EuroUnit || 0),
        Euro: Number(row.Euro || 0),
        CreatedAt: row.CreatedAt,
      })));
      detailSheet['!cols'] = [
        { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 40 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 20 },
      ];
      xlsx.utils.book_append_sheet(wb, detailSheet, 'Dettaglio');

      const infoSheet = xlsx.utils.aoa_to_sheet([
        ['Filtro mese', monthStart || 'Tutti'],
        ['Filtro agente', agente || 'Tutti'],
        ['Generato il', new Date().toISOString()],
        ['Totale righe riepilogo', mainRows.length],
        ['Totale righe breakdown', breakdownRows.length],
        ['Totale righe dettaglio', detailRows.length],
      ]);
      infoSheet['!cols'] = [{ wch: 20 }, { wch: 50 }];
      xlsx.utils.book_append_sheet(wb, infoSheet, 'Info');

      const buffer = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });
      const safeLabel = monthStart ? monthStart.replace(/[^0-9A-Za-z_-]/g, '-') : 'tutti';

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="compensi_agenti_${safeLabel}.xlsx"`);
      return res.send(buffer);
    } catch (e) {
      console.error('[COMPENSI][EXPORT][ERR]', e?.message || e);
      const status = e?.code === 'ETIMEOUT' ? 504 : 500;
      return res.status(status).json({ error: 'Errore durante esportazione compensi', details: e?.message || String(e) });
    }
  });

  console.log('[COMPENSI][EARLY] mount done');
} catch (e) {
  console.error('[COMPENSI][EARLY] mount err', e?.message || e);
}

// ================= SuperMaster: Dealer Trend Routes =================
// Trend per IDDealer (join su RagioneSociale)
app.get('/api/supermaster/dealers/:id/trend', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'IDDealer non valido' });
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();

    const parseYm = (s) => {
      const m = /^([0-9]{4})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
      if (y < 2000 || mo < 1 || mo > 12) return null;
      return y * 100 + mo; // yyyymm
    };
    const fromYm = parseYm(from);
    const toYm = parseYm(to);
    const whereYm = (fromYm && toYm)
      ? 'AND (Anno*100 + Mese) BETWEEN @FromYm AND @ToYm'
      : (fromYm ? 'AND (Anno*100 + Mese) >= @FromYm' : (toYm ? 'AND (Anno*100 + Mese) <= @ToYm' : ''));

    await getPool();
    const q = new sql.Request();
    q.input('Id', sql.Int, id);
    if (fromYm) q.input('FromYm', sql.Int, fromYm);
    if (toYm) q.input('ToYm', sql.Int, toYm);

    const sqlText = `
      SELECT
        MESE_LABEL,
        Anno,
        Mese,
        MonthStart,
        IDDealer,
        RagioneSociale,
        CAST(ISNULL([TLC FISSO SHP],            0) AS INT) AS tlc_fisso_shp,
        CAST(ISNULL([TLC MOBILE SHP],           0) AS INT) AS tlc_mobile_shp,
        CAST(ISNULL([TLC FISSO RES],            0) AS INT) AS tlc_fisso_res,
        CAST(ISNULL([TLC MOBILE RES],           0) AS INT) AS tlc_mobile_res,
        CAST(ISNULL([TLC MOBILE RES RIC.AUTO],  0) AS INT) AS tlc_mobile_res_ric_auto,
        CAST(ISNULL([TLC MOBILE RES RIC.PURA],  0) AS INT) AS tlc_mobile_res_ric_pura,
        CAST(ISNULL([SKY WIFI],                 0) AS INT) AS sky_wifi,
        CAST(ISNULL([SKY 4P],                   0) AS INT) AS sky_4p,
        CAST(ISNULL([PROVA SKY],                0) AS INT) AS prova_sky,
        CAST(ISNULL([SKY GLASS],                0) AS INT) AS sky_glass,
        CAST(ISNULL([SKY TRIPLE_PLAY],          0) AS INT) AS sky_triple_play,
        CAST(ISNULL([SKYTV_ONLY],               0) AS INT) AS skytv_only,
        CAST(ISNULL([ENERGIA],                  0) AS INT) AS energia
      FROM dbo.analisi_supermaster_dealer
      WHERE IDDealer = @Id
      ${whereYm}
      ORDER BY Anno, Mese`;

    const rs = await q.query(sqlText);
    const months = (rs.recordset || []).map(r => ({
      mese_label: r.MESE_LABEL,
      anno: r.Anno,
      mese: r.Mese,
      monthStart: r.MonthStart,
      idDealer: r.IDDealer,
      ragioneSociale: r.RagioneSociale,
      tlc_fisso_shp: r.tlc_fisso_shp ?? 0,
      tlc_mobile_shp: r.tlc_mobile_shp ?? 0,
      tlc_fisso_res: r.tlc_fisso_res ?? 0,
      tlc_mobile_res: r.tlc_mobile_res ?? 0,
      tlc_mobile_res_ric_auto: r.tlc_mobile_res_ric_auto ?? 0,
      tlc_mobile_res_ric_pura: r.tlc_mobile_res_ric_pura ?? 0,
      sky_wifi: r.sky_wifi ?? 0,
      sky_4p: r.sky_4p ?? 0,
      prova_sky: r.prova_sky ?? 0,
      sky_glass: r.sky_glass ?? 0,
      sky_triple_play: r.sky_triple_play ?? 0,
      skytv_only: r.skytv_only ?? 0,
      energia: r.energia ?? 0,
    }));
    return res.json({ idDealer: id, from, to, months });
  } catch (e) {
    console.error('[SM][DEALER TREND BY ID - V2 via v1][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante trend dealer (vista v2)', details: e?.message || String(e) });
  }
});

// Trend per RagioneSociale
app.get('/api/supermaster/dealers/trend-by-name', authenticateToken, async (req, res) => {
  try {
    const name = (req.query.name || '').toString().trim();
    if (!name) return res.status(400).json({ error: 'Parametro name mancante' });
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();

    const parseYm = (s) => {
      const m = /^([0-9]{4})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
      if (y < 2000 || mo < 1 || mo > 12) return null;
      return y * 100 + mo; // yyyymm
    };
    const fromYm = parseYm(from);
    const toYm = parseYm(to);

    await getPool();
    const q = new sql.Request();
    q.input('Name', sql.NVarChar(255), name);
    if (fromYm) q.input('FromYm', sql.Int, fromYm);
    if (toYm) q.input('ToYm', sql.Int, toYm);
    const whereYm = (fromYm && toYm)
      ? 'AND (m.Anno*100 + m.Mese) BETWEEN @FromYm AND @ToYm'
      : (fromYm ? 'AND (m.Anno*100 + m.Mese) >= @FromYm' : (toYm ? 'AND (m.Anno*100 + m.Mese) <= @ToYm' : ''));
    const sqlText = `
      WITH MesiAttivi AS (
        SELECT DISTINCT YEAR(TRY_CONVERT(date, Batch, 23)) AS Anno, MONTH(TRY_CONVERT(date, Batch, 23)) AS Mese
        FROM dbo.InseritoFW WHERE TRY_CONVERT(date, Batch, 23) IS NOT NULL
        UNION
        SELECT DISTINCT YEAR(TRY_CONVERT(date, Batch, 23)) AS Anno, MONTH(TRY_CONVERT(date, Batch, 23)) AS Mese
        FROM dbo.FWEnergiaImporter WHERE TRY_CONVERT(date, Batch, 23) IS NOT NULL
      )
      SELECT m.Anno, m.Mese, report.RagioneSociale, report.Agente,
             report.tlc_fisso_inseriti, report.tlc_mobile_inseriti,
             report.mobile_ricarica_automatica, report.energia_inseriti
      FROM MesiAttivi m
      CROSS APPLY dbo.vw_report_dealer_mese(m.Anno, m.Mese) AS report
      WHERE report.RagioneSociale = @Name
      ${whereYm}
      ORDER BY m.Anno, m.Mese;
    `;
    const rs = await q.query(sqlText);
    const months = (rs.recordset || []).map(r => ({
      month: `${r.Anno}-${String(r.Mese).padStart(2,'0')}`,
      ragioneSociale: r.RagioneSociale,
      agente: r.Agente,
      tlc_fisso_inseriti: r.tlc_fisso_inseriti,
      tlc_mobile_inseriti: r.tlc_mobile_inseriti,
      mobile_ricarica_automatica: r.mobile_ricarica_automatica,
      energia_inseriti: r.energia_inseriti,
    }));
    return res.json({ name, from, to, months });
  } catch (e) {
    console.error('[SM][DEALER TREND BY NAME][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante trend dealer', details: e?.message || String(e) });
  }
});

// Parser globali con limiti aumentati (default 100kb può causare 413 con autosave/base64)
// IMPORTANTE: non applicare i parser al webhook Stripe, che richiede raw body per la firma
app.use((req, res, next) => {
  const url = req.originalUrl || req.path || '';
  if (url.startsWith('/api/stripe/webhook') || url.startsWith('/webhook/stripe')) return next();
  return express.json({ limit: '10mb' })(req, res, next);
});

// IMPORT TLC GIORNALIERO (FULL): Inserisce/Aggiorna dbo.InseritoFW dal foglio "INSERITO KIM"
const fwInseritoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const mesiIt = {
  'gennaio': '01','febbraio': '02','marzo': '03','aprile': '04','maggio': '05','giugno': '06',
  'luglio': '07','agosto': '08','settembre': '09','ottobre': '10','novembre': '11','dicembre': '12'
};
function parseBatchFromFilename(name) {
  // Atteso: INSERITO KIM dd mese yy  -> es: INSERITO KIM 14 settembre 25
  const s = (name||'').toString().toLowerCase();
  const m = s.match(/(\d{1,2})\s+([a-zàèéìòù]+)\s+(\d{2,4})/i);
  if (!m) return null;
  const dd = String(parseInt(m[1],10)).padStart(2,'0');
  const mese = mesiIt[(m[2]||'').normalize('NFD').replace(/\p{Diacritic}/gu,'')];
  if (!mese) return null;
  let yy = m[3];
  let yyyy;
  if (yy.length === 2) {
    const two = parseInt(yy,10);
    yyyy = 2000 + two; // 25 -> 2025
  } else {
    yyyy = parseInt(yy,10);
  }
  return `${yyyy}-${mese}-${dd}`;
}

app.post('/api/admin/imports/inseritofw-full/commit', authenticateToken, onlyAdmin, fwInseritoUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante' });
    const buf = req.file.buffer;
    if (!buf || buf.length === 0) return res.status(400).json({ error: 'File vuoto' });

    const originalName = req.file.originalname || '';
    
    // Salva il file temporaneamente
    const uploadDir = '/home/ec2-user/ubuntu/PRODUZIONE/scripts/temp/uploads';
    const tempFilePath = path.join(uploadDir, originalName);
    
    try {
      await fs.promises.writeFile(tempFilePath, buf);
    } catch (writeErr) {
      console.error('[INSERITOFW-FULL][WRITE][ERR]', writeErr);
      return res.status(500).json({ error: 'Errore salvataggio file temporaneo', details: writeErr.message });
    }

    // Chiama lo script Python
    const pythonScript = '/home/ec2-user/ubuntu/PRODUZIONE/scripts/importers/process_tlc_backend.py';
    
    console.log('[INSERITOFW-FULL][PYTHON] Eseguendo:', pythonScript, tempFilePath);
    
    const { spawn } = await import('child_process');
    const pythonProcess = spawn('python3', [pythonScript, tempFilePath]);
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', async (code) => {
      // Rimuovi file temporaneo
      try {
        await fs.promises.unlink(tempFilePath);
      } catch (unlinkErr) {
        console.error('[INSERITOFW-FULL][CLEANUP][ERR]', unlinkErr);
      }
      
      if (code !== 0) {
        console.error('[INSERITOFW-FULL][PYTHON][ERR]', stderr);
        return res.status(500).json({ 
          error: 'Errore durante importazione', 
          details: stderr,
          exitCode: code 
        });
      }
      
      // Estrai JSON output dallo stdout
      const jsonMatch = stdout.match(/=== JSON_OUTPUT ===\n([\s\S]*?)\n=== END_JSON_OUTPUT ===/);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          const result = JSON.parse(jsonMatch[1]);
          console.log('[INSERITOFW-FULL][SUCCESS]', result);
          return res.json(result);
        } catch (parseErr) {
          console.error('[INSERITOFW-FULL][PARSE][ERR]', parseErr);
          return res.status(500).json({ 
            error: 'Errore parsing risultato', 
            stdout,
            details: parseErr.message 
          });
        }
      } else {
        console.log('[INSERITOFW-FULL][STDOUT]', stdout);
        return res.json({ 
          success: true, 
          message: 'Importazione completata',
          output: stdout 
        });
      }
    });
    
  } catch (err) {
    console.error('[INSERITOFW-FULL][ERR2]', err?.message || err);
    return res.status(500).json({ error: 'Errore imprevisto', details: err?.message || String(err) });
  }
});

// ===================== Admin Imports: FW Energia (APPEND) =====================
// Upload e commit in un solo passaggio: accetta file e batchDate
const fwImportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.post('/api/admin/imports/fw-energia/commit', authenticateToken, onlyAdmin, fwImportUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante' });
    const batchDate = (req.body?.batchDate || '').toString().trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(batchDate)) {
      return res.status(400).json({ error: 'batchDate mancante o non valido. Atteso YYYY-MM-DD' });
    }

    // Parsing file (xlsx/xls/csv)
    const buf = req.file.buffer;
    if (!buf || buf.length === 0) return res.status(400).json({ error: 'File vuoto' });
    const wb = xlsx.read(buf, { type: 'buffer' });
    const requested = (req.query?.sheet || '').toString();
    const targetSheet = (requested || 'INSERITO KIM');
    const sheetName = pickInseritoKimSheet(wb, targetSheet);
    if (!sheetName) return res.status(400).json({ error: `Foglio "${targetSheet}" non trovato`, availableSheets: wb.SheetNames || [] });
    const ws = wb.Sheets[sheetName];
    // Estrai righe con header
    const json = xlsx.utils.sheet_to_json(ws, { defval: '', raw: false });

    // Normalizzazione header -> mappa per accesso case-insensitive
    const normalize = (s) => (s || '').toString().trim().toLowerCase();
    const headerMap = {}; // chiave normalizzata -> nome esatto presente nel file
    // Ricava header dalla prima riga della sheet
    const range = xlsx.utils.decode_range(ws['!ref']);
    const headerRow = range.s.r; // prima riga
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[xlsx.utils.encode_cell({ r: headerRow, c })];
      const val = cell ? String(cell.v ?? cell.w ?? '').trim() : '';
      if (val) headerMap[normalize(val)] = val;
    }

    const pick = (row, key) => row[headerMap[key]] ?? row[key] ?? '';

    // Colonne attese dalla tabella
    const COLS = {
      cc: 'codice contratto',
      pod: 'codice pod',
      tipoCliente: 'tipo cliente',
      segmento: 'segmento energy',
      canaleDef: 'canale definitivo', // nel CSV è "canale dettaglio" + "canale vendita"? teniamo quelle originali
      canaleVendita: 'canale vendita',
      canaleDettaglio: 'canale dettaglio',
      rda: 'rda',
      pm: 'pm',
      comsy: 'comsy',
      codiceSatellite: 'codice satellite',
      partnerName: 'partner name',
      puntoVendita: 'punto vendita',
      areaCliente: 'area cliente',
      regionePOD: 'regione pod',
      provincia: 'provincia',
      cittaPOD: 'nome città pod',
      statoContratto: 'stato contratto',
      statoFornitura: 'stato fornitura luce',
      tipoVendita: 'tipo vendita',
      convergenzaClienteEnergy: 'convergenza cliente energy',
      tipoPassaggio: 'tipo passaggio',
      offerta: 'nome offerta vendita',
      cfpi: 'codice fiscale/partita iva code',
      dataInizio: 'data inizio fornitura pod',
      dataInserimento: 'data inserimento',  // COLONNA PER FILTRO MESE
      inseriti: 'nr inseriti',
    };

    const rows = Array.isArray(json) ? json : [];
    if (rows.length === 0) return res.status(400).json({ error: 'Nessuna riga dati trovata' });

    await getPool();
    const transaction = new sql.Transaction();
    await transaction.begin();
    try {
      // STEP 1: Cancella tutte le righe esistenti con lo stesso Batch
      console.log(`[FW-ENERGIA] Cancellazione righe esistenti per Batch: ${batchDate}`);
      await new sql.Request(transaction).query(`
        DELETE FROM dbo.FWEnergiaImporter WHERE [Batch] = '${batchDate}'
      `);
      
      let inserted = 0;
      let rowIndex = 0;
      
      for (const r of rows) {
        rowIndex++;
        const rec = {
          codiceContratto: pick(r, COLS.cc),
          codicePOD: pick(r, COLS.pod),
          tipoCliente: pick(r, COLS.tipoCliente),
          segmento: pick(r, COLS.segmento),
          canaleDettaglio: pick(r, COLS.canaleDettaglio),
          canaleVendita: pick(r, COLS.canaleVendita),
          rda: pick(r, COLS.rda),
          pm: pick(r, COLS.pm),
          comsy: pick(r, COLS.comsy),
          codiceSatellite: pick(r, COLS.codiceSatellite),
          partnerName: pick(r, COLS.partnerName),
          puntoVendita: pick(r, COLS.puntoVendita),
          areaCliente: pick(r, COLS.areaCliente),
          regionePOD: pick(r, COLS.regionePOD),
          provincia: pick(r, COLS.provincia),
          cittaPOD: pick(r, COLS.cittaPOD),
          statoContratto: pick(r, COLS.statoContratto),
          statoFornitura: pick(r, COLS.statoFornitura),
          tipoVendita: pick(r, COLS.tipoVendita),
          convergenzaClienteEnergy: pick(r, COLS.convergenzaClienteEnergy),
          tipoPassaggio: pick(r, COLS.tipoPassaggio),
          offerta: pick(r, COLS.offerta),
          cfpi: pick(r, COLS.cfpi),
          dataInizio: pick(r, COLS.dataInizio),
          dataInserimento: pick(r, COLS.dataInserimento),
          inserito: pick(r, COLS.inseriti),
        };

        const req = new sql.Request(transaction);
        req.input('CodiceContratto', sql.NVarChar(255), rec.codiceContratto || null);
        req.input('CodicePOD', sql.NVarChar(255), rec.codicePOD || null);
        req.input('TipoCliente', sql.NVarChar(255), rec.tipoCliente || null);
        req.input('Segmento', sql.NVarChar(255), rec.segmento || null);
        req.input('CanaleDef', sql.NVarChar(255), pick(r, COLS.canaleDef) || null);
        // Nota: nel DB la colonna [Codice Comsy/Order Owner (Report!DBSELLER)] deve ricevere il valore "codice satellite" dal file
        req.input('CodiceComsy', sql.NVarChar(255), (rec.codiceSatellite || rec.comsy || null));
        req.input('RegionePOD', sql.NVarChar(255), rec.regionePOD || null);
        req.input('Provincia', sql.NVarChar(255), rec.provincia || null);
        req.input('CittaPOD', sql.NVarChar(255), rec.cittaPOD || null);
        req.input('StatoContratto', sql.NVarChar(255), rec.statoContratto || null);
        req.input('StatoFornitura', sql.NVarChar(255), rec.statoFornitura || null);
        req.input('TipoVendita', sql.NVarChar(255), rec.tipoVendita || null);
        req.input('TipoPassaggio', sql.NVarChar(255), rec.tipoPassaggio || null);
        req.input('Offerta', sql.NVarChar(255), rec.offerta || null);
        req.input('DataInizio', sql.NVarChar(255), rec.dataInizio || null);
        req.input('Inserito', sql.Float, rec.inserito ? Number(rec.inserito) : null);
        req.input('Batch', sql.VarChar(256), batchDate);
        req.input('Convergenza', sql.NVarChar(50), rec.convergenzaClienteEnergy || null);

        try {
          await req.query(`
            INSERT INTO dbo.FWEnergiaImporter (
              [Codice Contratto], [Codice POD], [Tipo Cliente], [Segmento ], [Canale definitivo],
              [Codice Comsy/Order Owner (Report!DBSELLER)], [Regione POD], [Provincia], [Nome Città POD],
              [Stato Contratto], [Stato Fornitura Luce], [Tipo Vendita], [Tipo Passaggio], [Nome Offerta Vendita],
              [Data Inizio Fornitura POD], [Inserito], [Batch], [DataBatch], [Mese di AnnoMese Firma], [Convergenza]
            ) VALUES (
              @CodiceContratto, @CodicePOD, @TipoCliente, @Segmento, @CanaleDef,
              @CodiceComsy, @RegionePOD, @Provincia, @CittaPOD,
              @StatoContratto, @StatoFornitura, @TipoVendita, @TipoPassaggio, @Offerta,
              @DataInizio, @Inserito, @Batch, SYSDATETIME(), NULL, @Convergenza
            )`);
          inserted++;
        } catch (insertErr) {
          console.error(`[FW-ENERGIA] ✗ INSERT FAILED: Riga ${rowIndex} | Contratto="${rec.codiceContratto}" | Errore: ${insertErr.message}`);
          // Non interrompiamo il loop, continuiamo con le altre righe
        }
      }
      await transaction.commit();
      
      console.log(`[FW-ENERGIA] Import completato: ${inserted} righe inserite`);
      return res.json({ 
        success: true, 
        inserted, 
        updated: 0, 
        skipped: 0
      });
    } catch (e) {
      try { await transaction.rollback(); } catch {}
      console.error('[FW-ENERGIA][IMPORT][ERR]', e?.message || e);
      return res.status(500).json({ error: 'Errore durante import', details: e?.message || String(e) });
    }
  } catch (err) {
    console.error('[FW-ENERGIA][IMPORT] errore:', err?.message || err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// DIAGNOSTICA: ispeziona un file Excel già presente su disco (solo cartella ./import)
app.get('/api/admin/imports/inseritofw-full/inspect', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    const rel = (req.query?.file || '').toString();
    if (!rel || /\.\./.test(rel)) return res.status(400).json({ error: 'file non valido' });
    const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
    const baseDir = path.join(__dirname2, 'import');
    const fullPath = path.join(baseDir, rel);
    if (!fullPath.startsWith(baseDir)) return res.status(400).json({ error: 'path fuori da import' });
    // Leggi file come buffer
    const buf = fs.readFileSync(fullPath);
    const wb = xlsx.read(buf, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return res.status(400).json({ error: 'Foglio Excel non trovato' });
    const ws = wb.Sheets[sheetName];
    const range = xlsx.utils.decode_range(ws['!ref']);
    const headerRow = range.s.r;
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[xlsx.utils.encode_cell({ r: headerRow, c })];
      const val = cell ? String(cell.v ?? cell.w ?? '').trim() : '';
      headers.push(val);
    }
    // Prime 5 righe come oggetti
    const json = xlsx.utils.sheet_to_json(ws, { defval: '', raw: false });
    const preview = json.slice(0, 5);
    return res.json({ success: true, file: rel, sheet: sheetName, headers, previewCount: preview.length, preview });
  } catch (e) {
    console.error('[INSERITOFW-FULL][INSPECT][ERR]', e?.message || e);
    return res.status(500).json({ error: 'Errore durante inspect', details: e?.message || String(e) });
  }
});

// ===================== Admin Imports: InseritoFW (staging + update_missing.sql) =====================
// Colonne supportate come nello script Python
const INSERITOFW_REQUIRED_COLUMNS = [
  'stato post mobile',
  'tipo ricarica',
  'usim flag mnp',
  'nr of usim',
  'microstatus',
  'macrostatus',
  'stato pda',
  'customer no',
  'usim pay type',
  'tipo firma',
];

app.post('/api/admin/imports/inseritofw/commit', authenticateToken, onlyAdmin, fwInseritoUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante' });
    const buf = req.file.buffer;
    if (!buf || buf.length === 0) return res.status(400).json({ error: 'File vuoto' });

    const originalName = req.file.originalname || '';
    
    // Salva il file temporaneamente
    const uploadDir = '/home/ec2-user/ubuntu/PRODUZIONE/scripts/temp/uploads';
    const tempFilePath = path.join(uploadDir, originalName);
    
    try {
      await fs.promises.writeFile(tempFilePath, buf);
    } catch (writeErr) {
      console.error('[INSERITOFW][WRITE][ERR]', writeErr);
      return res.status(500).json({ error: 'Errore salvataggio file temporaneo', details: writeErr.message });
    }

    // Chiama lo script Python
    const pythonScript = '/home/ec2-user/ubuntu/PRODUZIONE/scripts/importers/process_ra_backend.py';
    
    console.log('[INSERITOFW][PYTHON] Eseguendo:', pythonScript, tempFilePath);
    
    const { spawn } = await import('child_process');
    const pythonProcess = spawn('python3', [pythonScript, tempFilePath]);
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', async (code) => {
      // Rimuovi file temporaneo
      try {
        await fs.promises.unlink(tempFilePath);
      } catch (unlinkErr) {
        console.error('[INSERITOFW][CLEANUP][ERR]', unlinkErr);
      }
      
      if (code !== 0) {
        console.error('[INSERITOFW][PYTHON][ERR]', stderr);
        return res.status(500).json({ 
          error: 'Errore durante importazione', 
          details: stderr,
          exitCode: code 
        });
      }
      
      // Estrai JSON output dallo stdout
      const jsonMatch = stdout.match(/=== JSON_OUTPUT ===\n([\s\S]*?)\n=== END_JSON_OUTPUT ===/);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          const result = JSON.parse(jsonMatch[1]);
          result.timestamp = new Date().toISOString();
          console.log('[INSERITOFW][SUCCESS]', result);
          return res.json(result);
        } catch (parseErr) {
          console.error('[INSERITOFW][PARSE][ERR]', parseErr);
          return res.status(500).json({ 
            error: 'Errore parsing risultato', 
            stdout,
            details: parseErr.message 
          });
        }
      } else {
        console.log('[INSERITOFW][STDOUT]', stdout);
        return res.json({ 
          success: true, 
          message: 'Importazione completata',
          output: stdout 
        });
      }
    });
    
  } catch (err) {
    console.error('[INSERITOFW][ERR2]', err?.message || err);
    return res.status(500).json({ error: 'Errore imprevisto', details: err?.message || String(err) });
  }
});

// ===================== Admin Imports: FISSO (Offer Group) =====================
app.post('/api/admin/imports/fisso/commit', authenticateToken, onlyAdmin, fwInseritoUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante' });
    const buf = req.file.buffer;
    if (!buf || buf.length === 0) return res.status(400).json({ error: 'File vuoto' });

    const originalName = req.file.originalname || '';
    
    // Salva il file temporaneamente
    const uploadDir = '/home/ec2-user/ubuntu/PRODUZIONE/scripts/temp/uploads';
    const tempFilePath = path.join(uploadDir, originalName);
    
    try {
      await fs.promises.writeFile(tempFilePath, buf);
    } catch (writeErr) {
      console.error('[FISSO][WRITE][ERR]', writeErr);
      return res.status(500).json({ error: 'Errore salvataggio file temporaneo', details: writeErr.message });
    }

    // Chiama lo script Python
    const pythonScript = '/home/ec2-user/ubuntu/PRODUZIONE/scripts/importers/process_fisso_backend.py';
    
    console.log('[FISSO][PYTHON] Eseguendo:', pythonScript, tempFilePath);
    
    const { spawn } = await import('child_process');
    const pythonProcess = spawn('python3', [pythonScript, tempFilePath]);
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', async (code) => {
      // Rimuovi file temporaneo
      try {
        await fs.promises.unlink(tempFilePath);
      } catch (unlinkErr) {
        console.error('[FISSO][CLEANUP][ERR]', unlinkErr);
      }
      
      if (code !== 0) {
        console.error('[FISSO][PYTHON][ERR]', stderr);
        return res.status(500).json({ 
          error: 'Errore durante importazione', 
          details: stderr,
          exitCode: code 
        });
      }
      
      // Estrai JSON output dallo stdout
      const jsonMatch = stdout.match(/=== JSON_OUTPUT ===\n([\s\S]*?)\n=== END_JSON_OUTPUT ===/);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          const result = JSON.parse(jsonMatch[1]);
          result.timestamp = new Date().toISOString();
          console.log('[FISSO][SUCCESS]', result);
          return res.json(result);
        } catch (parseErr) {
          console.error('[FISSO][PARSE][ERR]', parseErr);
          return res.status(500).json({ 
            error: 'Errore parsing risultato', 
            stdout,
            details: parseErr.message 
          });
        }
      } else {
        console.log('[FISSO][STDOUT]', stdout);
        return res.json({ 
          success: true, 
          message: 'Importazione completata',
          output: stdout 
        });
      }
    });
    
  } catch (err) {
    console.error('[FISSO][ERR2]', err?.message || err);
    return res.status(500).json({ error: 'Errore imprevisto', details: err?.message || String(err) });
  }
});

// ===================== Admin Imports: Popola Tipo Daily =====================
app.post('/api/admin/imports/popola-tipo-daily', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    await getPool();
    
    // STEP 1: Trova l'ultima data in [Batch] di dbo.InseritoFW
    console.log('[POPOLA-TIPO-DAILY] Ricerca ultima data Batch...');
    const batchResult = await new sql.Request().query(`
      SELECT TOP 1 [Batch] 
      FROM dbo.InseritoFW 
      WHERE [Batch] IS NOT NULL 
      ORDER BY [Batch] DESC
    `);
    
    if (!batchResult.recordset || batchResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Nessuna data Batch trovata in InseritoFW' 
      });
    }
    
    const lastBatch = batchResult.recordset[0].Batch;
    console.log(`[POPOLA-TIPO-DAILY] Ultima data Batch trovata: ${lastBatch}`);
    
    // STEP 2: Esegui la stored procedure
    console.log(`[POPOLA-TIPO-DAILY] Esecuzione sp_popola_tipo_daily con @BatchDate = '${lastBatch}'`);
    
    const spRequest = new sql.Request();
    spRequest.input('BatchDate', sql.VarChar(50), lastBatch);
    
    const startTime = Date.now();
    await spRequest.execute('dbo.sp_popola_tipo_daily');
    const duration = Date.now() - startTime;
    
    console.log(`[POPOLA-TIPO-DAILY] Stored procedure completata in ${duration}ms`);
    
    return res.json({ 
      success: true, 
      batchDate: lastBatch,
      duration: `${(duration / 1000).toFixed(2)}s`,
      message: `Stored procedure eseguita con successo per Batch: ${lastBatch}`
    });
    
  } catch (err) {
    console.error('[POPOLA-TIPO-DAILY][ERR]', err?.message || err);
    return res.status(500).json({ 
      success: false,
      error: 'Errore durante esecuzione stored procedure', 
      details: err?.message || String(err) 
    });
  }
});

app.use((req, res, next) => {
  const url = req.originalUrl || req.path || '';
  if (url.startsWith('/api/stripe/webhook') || url.startsWith('/webhook/stripe')) return next();
  return express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});

// Endpoint diagnostico per verificare ruoli/permessi visti dal backend
app.get('/api/admin/whoami', authenticateToken, async (req, res) => {
  try {
    const allowed = (
      req.user?.email === 'admin@kim.local' ||
      isSuperOrMaster(req.user) ||
      isMasterEmail(req.user?.email)
    );
    return res.json({
      email: req.user?.email,
      ruoli: req.user?.ruoli,
      roles: req.user?.roles,
      role: req.user?.role,
      allowed,
    });
  } catch (e) {
    return res.status(500).json({ error: 'whoami error' });
  }
});

// Ping diagnostico per conferma blocco admin
app.get('/api/admin/ping', (req, res) => res.json({ ok: true }));
try { console.log('[ADMIN ROUTES] registrate'); } catch {}

// REACTIVATE: riattiva utenza disattivata (undo soft delete)
app.post('/api/admin/users/:dealerId/reactivate', authenticateToken, onlyAdmin, express.json(), async (req, res) => {
  const dealerId = parseInt(req.params.dealerId, 10);
  if (!Number.isInteger(dealerId) || dealerId <= 0) {
    return res.status(400).json({ error: 'ID dealer non valido' });
  }
  try {
    await getPool();
    const dRes = await new sql.Request()
      .input('id', sql.Int, dealerId)
      .query('SELECT TOP 1 RecapitoEmail AS Email FROM dbo.tbDealers WHERE IDDealer = @id');
    if (!dRes.recordset.length) return res.status(404).json({ error: 'Dealer non trovato' });
    const email = dRes.recordset[0].Email;

    const transaction = new sql.Transaction();
    await transaction.begin();
    try {
      await new sql.Request(transaction)
        .input('d', sql.Int, dealerId)
        .query('UPDATE dbo.tbAgenti SET Active = 1 WHERE idDealer = @d');
      await new sql.Request(transaction)
        .input('d', sql.Int, dealerId)
        .query('UPDATE dbo.tbDealers SET Active = 1 WHERE IDDealer = @d');
      if (email) {
        await new sql.Request(transaction)
          .input('em', sql.NVarChar, email)
          .query('UPDATE dbo.AspNetUsers SET LockoutEnd = NULL WHERE Email = @em');
      }
      await transaction.commit();
      return res.json({ success: true, dealerId, email });
    } catch (e) {
      try { await transaction.rollback(); } catch {}
      console.error('[ADMIN][REACTIVATE] rollback per errore:', e?.message || e);
      return res.status(500).json({ error: 'Errore durante riattivazione' });
    }
  } catch (err) {
    console.error('[ADMIN][REACTIVATE] errore:', err?.message || err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// SOFT DELETE: disattiva utenza senza rimuovere Identity/ordini/transazioni
app.post('/api/admin/users/:dealerId/soft-delete', authenticateToken, onlyAdmin, express.json(), async (req, res) => {
  const dealerId = parseInt(req.params.dealerId, 10);
  if (!Number.isInteger(dealerId) || dealerId <= 0) {
    return res.status(400).json({ error: 'ID dealer non valido' });
  }
  try {
    await getPool();
    // trova email del dealer
    const dRes = await new sql.Request()
      .input('id', sql.Int, dealerId)
      .query('SELECT TOP 1 RecapitoEmail AS Email FROM dbo.tbDealers WHERE IDDealer = @id');
    if (!dRes.recordset.length) return res.status(404).json({ error: 'Dealer non trovato' });
    const email = dRes.recordset[0].Email;

    const transaction = new sql.Transaction();
    await transaction.begin();
    try {
      await new sql.Request(transaction)
        .input('d', sql.Int, dealerId)
        .query('UPDATE dbo.tbAgenti SET Active = 0 WHERE idDealer = @d');
      await new sql.Request(transaction)
        .input('d', sql.Int, dealerId)
        .query('UPDATE dbo.tbDealers SET Active = 0 WHERE IDDealer = @d');
      if (email) {
        await new sql.Request(transaction)
          .input('em', sql.NVarChar, email)
          .query("UPDATE dbo.AspNetUsers SET LockoutEnabled = 1, LockoutEnd = '9999-12-31T00:00:00.000' WHERE Email = @em");
      }
      await transaction.commit();
      return res.json({ success: true, dealerId, email });
    } catch (e) {
      try { await transaction.rollback(); } catch {}
      console.error('[ADMIN][SOFT_DELETE] rollback per errore:', e?.message || e);
      return res.status(500).json({ error: 'Errore durante soft delete' });
    }
  } catch (err) {
    console.error('[ADMIN][SOFT_DELETE] errore:', err?.message || err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Dipendenze per Hard Delete (anteprima)
app.get('/api/admin/users/:dealerId/deps', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    await getPool();
    const dealerId = parseInt(req.params.dealerId, 10);
    if (!Number.isInteger(dealerId) || dealerId <= 0) return res.status(400).json({ error: 'ID non valido' });
    const [ord, trn, ag] = await Promise.all([
      new sql.Request().input('d1', sql.Int, dealerId).query('SELECT COUNT(1) AS c FROM dbo.tbOrdini WHERE IDDealer = @d1').then(r=>r.recordset?.[0]?.c||0).catch(()=>0),
      new sql.Request().input('d2', sql.Int, dealerId).query('SELECT COUNT(1) AS c FROM dbo.tbTransazioni WHERE IDDealer = @d2').then(r=>r.recordset?.[0]?.c||0).catch(()=>0),
      new sql.Request().input('d3', sql.Int, dealerId).query('SELECT COUNT(1) AS c FROM dbo.tbAgenti WHERE idDealer = @d3').then(r=>r.recordset?.[0]?.c||0).catch(()=>0),
    ]);
    return res.json({
      dealerId,
      deps: { ordini: ord, transazioni: trn, agenti: ag },
      expectedPhrase: `DELETE DEALER ${dealerId}`
    });
  } catch (e) {
    console.error('[ADMIN][DEPS] err:', e?.message || e);
    return res.status(500).json({ error: 'Errore deps' });
  }
});

// Ricerca Dealer per Ragione Sociale (Admin)
app.get('/api/admin/dealers/search', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    await getPool();
    const q = (req.query.q || '').toString().trim();
    if (!q || q.length < 2) return res.json([]);
    const rs = await new sql.Request()
      .input('q', sql.NVarChar, `%${q}%`)
      .query(`SELECT TOP 10 IDDealer, RagioneSociale, RecapitoEmail FROM dbo.tbDealers WHERE RagioneSociale LIKE @q ORDER BY RagioneSociale ASC`);
    return res.json(rs.recordset || []);
  } catch (e) {
    console.error('[ADMIN][DEALERS SEARCH] err:', e?.message || e);
    return res.status(500).json({ error: 'Errore ricerca dealer' });
    return res.status(400).json({ error: 'ID dealer non valido' });
  }
  // Doppia conferma
  const expectedPhrase = `DELETE DEALER ${dealerId}`;
  if (confirm !== true || phrase !== expectedPhrase) {
    return res.status(400).json({ error: 'Conferma mancante o frase non corretta', expectedPhrase });
  }
  try {
    await getPool();

    // Recupera email utente e info
    const dRes = await new sql.Request()
      .input('id', sql.Int, dealerId)
      .query('SELECT TOP 1 RecapitoEmail AS Email FROM dbo.tbDealers WHERE IDDealer = @id');
    if (!dRes.recordset.length) return res.status(404).json({ error: 'Dealer non trovato' });
    const email = dRes.recordset[0].Email;

    // Controlli dipendenze essenziali
    const depReq = new sql.Request();
    const [ordini, trans, agenti] = await Promise.all([
      depReq.input('d1', sql.Int, dealerId).query('SELECT COUNT(1) AS c FROM dbo.tbOrdini WHERE IDDealer = @d1')
        .then(r => r.recordset?.[0]?.c || 0).catch(()=>0),
      new sql.Request().input('d2', sql.Int, dealerId).query('SELECT COUNT(1) AS c FROM dbo.tbTransazioni WHERE IDDealer = @d2')
        .then(r => r.recordset?.[0]?.c || 0).catch(()=>0),
      new sql.Request().input('d3', sql.Int, dealerId).query('SELECT COUNT(1) AS c FROM dbo.tbAgenti WHERE idDealer = @d3')
        .then(r => r.recordset?.[0]?.c || 0).catch(()=>0),
    ]);

    const deps = { ordini, transazioni: trans, agenti };
    const hasBlockingDeps = (ordini > 0) || (trans > 0);
    if (hasBlockingDeps && !force) {
      return res.status(409).json({ error: 'Dipendenze presenti: impossibile cancellare senza force=true', deps, hint: 'Rilancia con ?force=true e stessa frase di conferma per procedere comunque' });
    }

    // Recupera utente Identity
    let userId = null;
    if (email) {
      const uRes = await new sql.Request().input('em', sql.NVarChar, email)
        .query('SELECT TOP 1 Id FROM dbo.AspNetUsers WHERE Email = @em');
      userId = uRes.recordset?.[0]?.Id || null;
    }

    const transaction = new sql.Transaction();
    await transaction.begin();
    try {
      // Cancella dipendenze opzionali NON critiche (agenti)
      await new sql.Request(transaction)
        .input('d', sql.Int, dealerId)
        .query('DELETE FROM dbo.tbAgenti WHERE idDealer = @d');

      // Non cancelliamo ordini/transazioni: restano per audit (se force, procediamo comunque alla cancellazione utenze)

      // Cancella dealer
      await new sql.Request(transaction)
        .input('d', sql.Int, dealerId)
        .query('DELETE FROM dbo.tbDealers WHERE IDDealer = @d');

      // Cancella ruoli utente
      if (userId) {
        await new sql.Request(transaction)
          .input('uid', sql.NVarChar, userId)
          .query('DELETE FROM dbo.AspNetUserRoles WHERE UserId = @uid');
        await new sql.Request(transaction)
          .input('uid', sql.NVarChar, userId)
          .query('DELETE FROM dbo.AspNetUsers WHERE Id = @uid');
      }

      await transaction.commit();
      return res.json({ success: true, deleted: { dealerId, email, userId }, deps });
    } catch (e) {
      try { await transaction.rollback(); } catch {}
      console.error('[ADMIN][HARD_DELETE] rollback per errore:', e?.message || e);
      return res.status(500).json({ error: 'Errore durante la cancellazione' });
    }
  } catch (err) {
    console.error('[ADMIN][HARD_DELETE] errore:', err?.message || err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// --- Stripe Webhook (manuale DISATTIVATO per evitare duplicati) ---
// Era una versione con lettura manuale del body RAW. Disabilitata per usare la versione ufficiale con express.raw più in basso.
app.post('/api/stripe/webhook_manual_disabled', async (req, res) => {
  if (!req.headers['content-type'] || !req.headers['content-type'].startsWith('application/json')) {
    return res.status(400).send('Unsupported content type');
  }
  const sig = req.headers['stripe-signature'];
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!whSecret) {
    console.error('[STRIPE][WEBHOOK] STRIPE_WEBHOOK_SECRET mancante');
    return res.sendStatus(500);
  }
  let rawBody = '';
  try {
    req.setEncoding('utf8');
    await new Promise((resolve, reject) => {
      req.on('data', chunk => { rawBody += chunk; });
      req.on('end', resolve);
      req.on('error', reject);
    });
  } catch (e) {
    console.error('[STRIPE][WEBHOOK] Errore lettura body raw:', e?.message || e);
    return res.status(400).send('Cannot read raw body');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
  } catch (err) {
    console.error('[STRIPE][WEBHOOK] Signature verification failed:', err?.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Helper per accredito plafond in tbTransazioni (idempotente)
    const creditDealer = async ({ dealerId, amountEuro, descrizione, riferimento, payloadObj }) => {
      if (!Number.isFinite(dealerId) || dealerId <= 0 || !Number.isFinite(amountEuro) || amountEuro <= 0) {
        console.warn('[STRIPE][WEBHOOK] Parametri accredito non validi:', { dealerId, amountEuro, riferimento });
        return;
      }
      try {
        await getPool();
        const payload = JSON.stringify(payloadObj || {});
        const uniqueId = String(riferimento || payloadObj?.id || '').trim();
        const rifInt = Number.isFinite(Number(uniqueId)) ? Number(uniqueId) : null;

        // Idempotency check: by numeric reference, description or payload JSON id
        try {
          const dupReq = new sql.Request();
          dupReq.input('rifStr', sql.NVarChar(128), uniqueId);
          if (rifInt !== null) dupReq.input('rifInt', sql.Int, rifInt);
          const whereParts = [];
          if (rifInt !== null) whereParts.push('(Riferimento = @rifInt)');
          whereParts.push(`(Descrizione LIKE '%' + @rifStr + '%')`);
          whereParts.push(`(Payload LIKE '%"id":"' + @rifStr + '"%')`);
          const whereClause = whereParts.join(' OR ');
          const dupSql = `SELECT TOP 1 IDTransazione FROM dbo.tbTransazioni WHERE ${whereClause}`;
          const dup = await dupReq.query(dupSql);
          if (dup.recordset && dup.recordset.length > 0) {
            console.warn('[STRIPE][WEBHOOK] creditDealer: transazione già presente, skip.', { uniqueId, dealerId });
            return;
          }
        } catch (dupErr) {
          console.warn('[STRIPE][WEBHOOK] creditDealer: dup-check fallito, proseguo con inserimento safe:', dupErr?.message || dupErr);
        }

        console.log('[STRIPE][WEBHOOK] Parametri INSERT', { dealerId, amountEuro, rifInt, descrizione });
        await new sql.Request()
          .input('idDealer', sql.Int, dealerId)
          .input('crediti', sql.Decimal(18, 2), amountEuro)
          .input('descrizione', sql.NVarChar(255), descrizione)
          .input('riferimento', sql.Int, rifInt)
          .input('payload', sql.NVarChar(sql.MAX), payload)
          .query(`INSERT INTO dbo.tbTransazioni (idDealer, Crediti, Descrizione, DataOra, Fonte, Riferimento, Payload)
                  VALUES (@idDealer, @crediti, @descrizione, GETDATE(), 'STRIPE', @riferimento, @payload)`);
        console.log(`[STRIPE][WEBHOOK] INSERT OK dealerId=${dealerId} amountEuro=${amountEuro} ref=${uniqueId}`);
      } catch (dbErr) {
        console.error('[STRIPE][WEBHOOK] Errore inserimento transazione DB:', dbErr?.message || dbErr);
      }
    };

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const amountCents = Number(pi?.amount_received ?? pi?.amount ?? 0) || 0;
        const amountEuro = amountCents / 100;
        const dealerId = Number(pi?.metadata?.dealerId || 0);
        const metodo = String(pi?.metadata?.orderType || 'RIC').toUpperCase();
        console.log('[STRIPE][WEBHOOK] payment_intent.succeeded -> metodo:', metodo, 'dealerId:', dealerId, 'amountEuro:', amountEuro);

        // Se è un ordine PRODOTTI non accreditare il plafond: inserisci l'ordine in tbOrdiniProdotti
        if (metodo === 'PROD') {
          try {
            await getPool();
            const dbName = getDbName();
            const emailCliente = String(pi?.metadata?.emailCliente || '');
            const spese = Number(pi?.metadata?.speseSpedizione || 0) || 0;
            // CALCOLO CORRETTO: Calcola il totale prodotti direttamente dal carrello
            let totaleProdotti = 0;
            try {
              const carrelloData = JSON.parse(pi?.metadata?.carrello || '[]');
              if (Array.isArray(carrelloData) && carrelloData.length > 0) {
                for (const item of carrelloData) {
                  const prezzo = Number(item.prezzo || 0) / 100; // converti da centesimi a euro
                  const quantita = Number(item.quantita || 1);
                  totaleProdotti += prezzo * quantita;
                }
                totaleProdotti = Number(totaleProdotti.toFixed(2));
              } else {
                // Fallback: se non c'è carrello, sottrai le spese dall'importo totale
                totaleProdotti = Number((amountEuro - spese).toFixed(2));
              }
            } catch (e) {
              console.warn('[ORDINI] Errore parsing carrello, uso fallback:', e.message);
              totaleProdotti = Number((amountEuro - spese).toFixed(2));
            }
            
            // Validazione semplice: deve essere positivo
            if (totaleProdotti <= 0) {
              console.error('[ORDINI] ERRORE: totaleProdotti non valido!', { totaleProdotti, amountEuro, spese });
              throw new Error(`Totale prodotti non valido: ${totaleProdotti}€`);
            }
            
            console.log('[ORDINI] CALCOLO CORRETTO: amountEuro=', amountEuro, 'spese=', spese, 'totaleProdotti=', totaleProdotti);
            const payloadStr = (() => {
              try { return pi?.metadata?.carrello || '[]'; } catch { return '[]'; }
            })();
            const stato = 20; // Pagato – In Preparazione (Carta)
            const noteOrdine = (pi?.metadata?.noteOrdine || '').toString();

            const ins = await new sql.Request()
              .input('idDealer', sql.Int, dealerId)
              .input('OrdineDA', sql.NVarChar, emailCliente)
              .input('SpeseSpedizione', sql.Decimal(18, 2), spese)
              .input('TotaleOrdine', sql.Decimal(18, 2), totaleProdotti)
              .input('Payload', sql.NVarChar(sql.MAX), payloadStr)
              .input('idStato', sql.Int, stato)
              .input('NoteOrdine', sql.NVarChar, noteOrdine || null)
              .input('PiId', sql.NVarChar(64), pi.id)
              .query(`INSERT INTO [${dbName}].dbo.tbOrdiniProdotti
                      (idDealer, DataOra, OrdineDA, SpeseSpedizione, TotaleOrdine, Payload, idStatoOrdineProdotto, NoteOrdine, Note4Dealer, NoteInterne, OrdineDaAgente, DataStato, stato_spedizione, PaymentIntentId, PaymentIntentId_UQ, idStatoSpedizione)
                      OUTPUT INSERTED.IDOrdineProdotto
                      VALUES (@idDealer, GETDATE(), @OrdineDA, @SpeseSpedizione, @TotaleOrdine, @Payload, @idStato, @NoteOrdine, NULL, NULL, 0, GETDATE(), 'Non Spedito', @PiId, @PiId, 0)`);
            const orderId = ins.recordset && ins.recordset[0] && ins.recordset[0].IDOrdineProdotto;
            console.log('[ORDINI] INSERT OK (PROD) idOrdine=', orderId, 'dealerId=', dealerId, 'totProdotti=', totaleProdotti, 'spese=', spese, 'PI=', pi.id);

            // Inserimento dettagli ordine
            try {
              let carrelloArr = [];
              try { carrelloArr = JSON.parse(payloadStr); } catch {}
              console.log('[ORDINI][DEBUG] Carrello parsed:', JSON.stringify(carrelloArr));
              if (Array.isArray(carrelloArr) && carrelloArr.length > 0) {
                for (const riga of carrelloArr) {
                  const idOfferta = Number(riga.id || riga.idOfferta || 0);
                  const quantita = Number(riga.quantita || riga.qty || 1);
                  console.log('[ORDINI][DEBUG] Processando riga: idOfferta=', idOfferta, 'quantita=', quantita);
                  if (!idOfferta || quantita <= 0) {
                    console.warn('[ORDINI][DEBUG] Riga saltata: idOfferta o quantita non validi');
                    continue;
                  }
                  // Ricava il prezzo unitario in euro da tbOfferte.Crediti (centesimi)
                  let prezzoUnit = 0;
                  try {
                    const priceRes = await new sql.Request()
                      .input('IdOfferta', sql.Int, idOfferta)
                      .query(`SELECT TOP 1 ISNULL(CAST(Crediti AS INT), 0) AS Crediti FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta = @IdOfferta`);
                    if (priceRes.recordset.length > 0) {
                      const creditiCents = Number(priceRes.recordset[0].Crediti || 0);
                      prezzoUnit = creditiCents / 100.0;
                    }
                    console.log('[ORDINI][DEBUG] Prezzo unitario per offerta', idOfferta, ':', prezzoUnit, 'euro');
                  } catch (priceErr) {
                    console.warn('[ORDINI] Impossibile ricavare prezzo unitario da tbOfferte per idOfferta=', idOfferta, priceErr);
                  }
                  try {
                    const insertRes = await new sql.Request()
                      .input('idOrdineProdotto', sql.Int, orderId)
                      .input('idOfferta', sql.Int, idOfferta)
                      .input('Quantita', sql.Int, quantita)
                      .input('CostoUnitario', sql.Decimal(18,2), prezzoUnit)
                      .query(`INSERT INTO [${dbName}].dbo.tbDettagliOrdiniProdotti (idOrdineProdotto, idOfferta, Quantita, CostoUnitario, SIMTYPE, SIMCOUNT)
                              VALUES (@idOrdineProdotto, @idOfferta, @Quantita, @CostoUnitario, NULL, 0)`);
                    console.log('[ORDINI][DEBUG] INSERT OK per offerta', idOfferta, 'rowsAffected:', insertRes.rowsAffected);
                  } catch (insertErr) {
                    console.error('[ORDINI][ERROR] INSERT fallito per offerta', idOfferta, ':', insertErr?.message || insertErr);
                  }
                }
                console.log('[ORDINI] Dettagli inseriti per idOrdine=', orderId, 'righe=', carrelloArr.length);
              } else {
                console.warn('[ORDINI] Carrello vuoto/non valido nei metadata: nessun dettaglio inserito. PI=', pi.id);
              }
            } catch (detErr) {
              console.error('[ORDINI] Errore inserimento dettagli ordine:', detErr?.message || detErr);
            }

            // Invia email di conferma ordine prodotto
            try {
              const eventType = pi.status === 'succeeded' ? 'ORDINE_PRODOTTO_PAGATO' : 'IN_ATTESA_PAGAMENTO';
              await emailService.sendProductOrderEmail(eventType, orderId, {
                paymentStatus: pi.status,
                paymentMethod: 'stripe',
                emailCliente: emailCliente
              });
              console.log(`[EMAIL] Email ordine prodotto inviata: ${eventType} per ordine ${orderId}`);
            } catch (emailError) {
              console.error('[EMAIL] Errore invio email ordine prodotto:', emailError);
            }

            // Rispondi e interrompi il flusso per evitare accrediti
            return res.status(200).json({ received: true, type: 'PROD', orderId });
          } catch (ordErr) {
            console.error('[ORDINI] Errore inserimento ordine (PROD):', ordErr?.message || ordErr);
            return res.status(500).json({ error: 'Errore inserimento ordine', details: ordErr?.message || String(ordErr) });
          }
        }

        // Default (RICARICA PLAFOND): accredita in tbTransazioni
        const descr = `RICARICA PLAFOND ${metodo} (PI:${pi?.id || ''})`;
        await creditDealer({ dealerId, amountEuro, descrizione: descr, riferimento: pi?.id, payloadObj: { type: event.type, id: pi?.id, metadata: pi?.metadata } });
        return res.status(200).json({ received: true, type: 'RIC' });
      }
      case 'charge.succeeded': {
        const ch = event.data.object;
        const amountCents = Number(ch?.amount ?? 0) || 0;
        const amountEuro = amountCents / 100;
        const dealerId = Number(ch?.metadata?.dealerId || 0);
        const metodo = String(ch?.metadata?.orderType || 'RIC').toUpperCase();
        if (metodo === 'PROD') {
          if (secureDebug) console.log('[STRIPE][WEBHOOK] charge.succeeded ricevuto per PROD: nessun accredito plafond. CH:', ch?.id);
          return res.status(200).json({ received: true, type: 'PROD_CHARGE' });
        }
        const descr = `RICARICA PLAFOND ${metodo} (CH:${ch?.id || ''})`;
        await creditDealer({ dealerId, amountEuro, descrizione: descr, riferimento: ch?.id, payloadObj: { type: event.type, id: ch?.id, metadata: ch?.metadata } });
        return res.status(200).json({ received: true, type: 'RIC_CHARGE' });
      }
      default: {
        // Altri eventi non gestiti
        if (secureDebug) console.log('[STRIPE][WEBHOOK] Evento ignorato:', event.type);
      }
    }
    return res.json({ received: true });
  } catch (e) {
    console.error('[STRIPE][WEBHOOK] Handler error:', e?.message || e);
    return res.sendStatus(500);
  }
});

// Endpoint creazione ordine per BONIFICO (SEPA) per Dealer
app.post('/api/order/bonifico', authenticateToken, express.json(), async (req, res) => {
  try {
    const dbName = getDbName();
    const dealerId = Number(req.user?.dealerId || req.user?.idDealer || 0);
    if (!Number.isInteger(dealerId) || dealerId <= 0) {
      return res.status(400).json({ error: 'dealerId non valido o mancante' });
    }

    const { carrello, emailCliente, speseSpedizione = 0, noteOrdine = '' } = req.body || {};
    if (!Array.isArray(carrello) || carrello.length === 0) {
      return res.status(400).json({ error: 'Carrello vuoto o non valido' });
    }

    const pool = await getPool();

    // Stato spedizione iniziale per Dealer: NON SPEDITO (id=0)
    let statoSpedizioneDesc = 'Non Spedito';

    // Costruisci payload con prezzi in centesimi dal listino tbOfferte
    let payloadItems = [];
    let totaleCents = 0;
    
    for (const prodotto of carrello) {
      const idOff = Number(prodotto.id);
      const quantita = Number(prodotto.quantita || 1);
      if (!idOff || quantita <= 0) continue;
      try {
        const rs = await pool.request()
          .input('IDOfferta', sql.Int, idOff)
          .query(`SELECT TOP 1 ISNULL(Crediti,0) AS Crediti FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta = @IDOfferta`);
        const crediti = rs.recordset.length ? Number(rs.recordset[0].Crediti || 0) : 0; // centesimi
        payloadItems.push({ idOfferta: idOff, prezzo: crediti, quantita });
        totaleCents += (crediti * quantita);
      } catch {}
    }
    const payload = JSON.stringify(payloadItems);
    
    // LOGICA CORRETTA: Le spese vengono gestite dal frontend e inviate direttamente
    const spese = Number(speseSpedizione) || 0;
    console.log(`[BONIFICO] Spese spedizione: €${spese}`);
    
    // CORREZIONE: TotaleOrdine = solo prodotti, SpeseSpedizione = spese separate
    const totaleEuro = Number(((totaleCents || 0) / 100).toFixed(2)); // Solo prodotti
    console.log(`[BONIFICO] Totale prodotti: €${totaleEuro}, Spese: €${spese}, Totale finale: €${totaleEuro + spese}`);

    const now = new Date();
    const ordineRequest = pool.request();
    const insert = await ordineRequest
      .input('idDealer', sql.Int, dealerId)
      .input('DataOra', sql.DateTime, now)
      .input('OrdineDA', sql.VarChar, emailCliente || '')
      .input('SpeseSpedizione', sql.Decimal(10, 2), spese)
      .input('TotaleOrdine', sql.Decimal(10, 2), totaleEuro)
      .input('Payload', sql.Text, payload)
      .input('PiIdUQ', sql.NVarChar(64), null) // nessun payment intent
      .input('idStatoOrdineProdotto', sql.Int, 21) // IN ATTESA DI PAGAMENTO
      .input('NoteOrdine', sql.Text, noteOrdine || '')
      .input('OrdineDaAgente', sql.Bit, 0)
      .input('DataStato', sql.DateTime, now)
      .input('Note4Dealer', sql.Text, '')
      .input('NoteInterne', sql.Text, '')
      .input('StatoSpedizione', sql.NVarChar, statoSpedizioneDesc)
      .input('IdStatoSpedizione', sql.Int, 0)
      .query(`
        INSERT INTO [${dbName}].dbo.tbOrdiniProdotti 
        (idDealer, DataOra, OrdineDA, SpeseSpedizione, TotaleOrdine, Payload, PaymentIntentId_UQ, idStatoOrdineProdotto, NoteOrdine, OrdineDaAgente, DataStato, stato_spedizione, Note4Dealer, NoteInterne, idStatoSpedizione)
        OUTPUT INSERTED.IDOrdineProdotto
        VALUES (@idDealer, @DataOra, @OrdineDA, @SpeseSpedizione, @TotaleOrdine, @Payload, @PiIdUQ, @idStatoOrdineProdotto, @NoteOrdine, @OrdineDaAgente, @DataStato, @StatoSpedizione, @Note4Dealer, @NoteInterne, @IdStatoSpedizione)
      `);

    const idOrdineProdotto = insert.recordset[0].IDOrdineProdotto;

    // Inserisci dettagli
    for (const prodotto of carrello) {
      try {
        const prezzoCents = (payloadItems.find(p => p.idOfferta === Number(prodotto.id))?.prezzo) || 0;
        const prezzoEuro = Number(((prezzoCents || 0) / 100).toFixed(2));
        await pool.request()
          .input('IDOrdineProdotto', sql.Int, idOrdineProdotto)
          .input('IDOfferta', sql.Int, Number(prodotto.id))
          .input('Quantita', sql.Int, Number(prodotto.quantita || 1))
          .input('CostoUnitario', sql.Decimal(10, 2), prezzoEuro)
          .query(`
            INSERT INTO [${dbName}].dbo.tbDettagliOrdiniProdotti 
            (IDOrdineProdotto, IDOfferta, Quantita, CostoUnitario, SIMTYPE, SIMCOUNT)
            VALUES (@IDOrdineProdotto, @IDOfferta, @Quantita, @CostoUnitario,
                    COALESCE(
                      (SELECT TOP 1 ISNULL(SIMTYPE,'') FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta=@IDOfferta),
                      (SELECT TOP 1 'TELEFONO' FROM [${dbName}].dbo.tbTelefoni WHERE IDTelefono=@IDOfferta),
                      ''
                    ), 0)
          `);
      } catch (e) {
        console.warn('[BONIFICO] Errore inserimento dettaglio', prodotto?.id, e?.message || e);
      }
    }

    // Email conferma ordine bonifico
    try {
      await emailService.sendProductOrderEmail('ORDINE_PRODOTTO_BONIFICO', idOrdineProdotto, {
        paymentStatus: 'pending',
        paymentMethod: 'bonifico',
        emailCliente: emailCliente || ''
      });
      console.log(`[EMAIL] Email ordine prodotto BONIFICO inviata per ordine ${idOrdineProdotto}`);
    } catch (emailErr) {
      console.error('[EMAIL] Errore invio email ordine bonifico:', emailErr);
    }

    return res.json({ ok: true, idOrdineProdotto });
  } catch (err) {
    console.error('[BONIFICO] Errore creazione ordine:', err);
    return res.status(500).json({ error: 'Errore creazione ordine bonifico', details: err.message });
  }
});

// Logout idempotente: risponde sempre JSON per compatibilità frontend
app.post('/api/logout', (req, res) => {
  try {
    return res.json({ ok: true, message: 'Logout eseguito', timestamp: new Date().toISOString() });
  } catch (e) {
    return res.json({ ok: true, message: 'Logout eseguito', timestamp: new Date().toISOString() });
  }
});

// Healthcheck (compatibile sia con /health che con /api/health)
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).send('OK'));

// Plafond: restituisce il credito residuo reale del dealer autenticato
async function handleCreditoPlafond(req, res) {
  console.log('--- /api/credito-plafond chiamato ---');
  try {
    const dealerId = Number(req.user?.dealerId ?? req.user?.idDealer);
    if (!Number.isFinite(dealerId)) {
      console.error('ID dealer non trovato nel token JWT (req.user)');
      return res.status(401).json({ error: 'ID dealer non valido nel token' });
    }
    console.log('IDDealer da req.user:', dealerId);

    try {
      await getPool();
      const request = new sql.Request();
      request.input('idDealer', sql.Int, dealerId);
      const creditoQuery = `
        SELECT ISNULL(SUM(t.crediti), 0) AS credito
        FROM dbo.tbtransazioni t
        JOIN dbo.tbdealers d ON t.iddealer = d.iddealer
        WHERE d.iddealer = @idDealer
      `;
      console.log('Eseguo creditoQuery con idDealer:', dealerId);
      const creditoRes = await request.query(creditoQuery);
      const credito = Number(creditoRes?.recordset?.[0]?.credito ?? 0) || 0;
      console.log('Credito calcolato:', credito);
      return res.json({ credito });
    } catch (err) {
      console.error('ERRORE /api/credito-plafond:', err.message, err.stack);
      return res.status(500).json({ error: 'Errore server', details: err.message });
    }
  } catch (err) {
    console.error('ERRORE GRAVE /api/credito-plafond:', err.message, err.stack);
    return res.status(500).json({ error: 'Errore server', details: err.message });
  }
}

app.get('/api/plafond', authenticateToken, handleCreditoPlafond);
app.get('/api/credito-plafond', authenticateToken, handleCreditoPlafond);

// Middleware: richiede token elevato (step-up) per aree sensibili
function requireElevated(req, res, next) {
  try {
    // `authenticateToken` ha già popolato req.user
    if (req.user && req.user.elevated === true) {
      return next();
    }
    return res.status(403).json({ error: 'Accesso elevato richiesto (TOTP)' });
  } catch (e) {
    return res.status(403).json({ error: 'Accesso elevato richiesto (TOTP)' });
  }
}

// ==== MFA TOTP (Dealer) ====
async function ensureDealerTotpColumns() {
  try {
    await getPool();
    const hasSecret = await new sql.Request().query("SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='tbDealers' AND COLUMN_NAME='TOTPSecret'");
    if (!hasSecret.recordset.length) {
      await sql.query("ALTER TABLE dbo.tbDealers ADD TOTPSecret NVARCHAR(64) NULL");
    }
    const hasEnabled = await new sql.Request().query("SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='tbDealers' AND COLUMN_NAME='TOTPEnabled'");
    if (!hasEnabled.recordset.length) {
      await sql.query("ALTER TABLE dbo.tbDealers ADD TOTPEnabled BIT NOT NULL DEFAULT(0)");
    }
  } catch (e) {
    console.warn('[MFA][INIT] Impossibile garantire colonne TOTP su tbDealers:', e?.message || e);
  }
}

// GET /mfa/totp/status -> { enrolled: boolean }
app.get('/api/mfa/totp/status', authenticateToken, async (req, res) => {
  try {
    await ensureDealerTotpColumns();
    const dealerId = Number(req.user?.dealerId ?? req.user?.idDealer);
    if (!Number.isFinite(dealerId)) return res.status(400).json({ enrolled: false });
    const rs = await new sql.Request()
      .input('id', sql.Int, dealerId)
      .query('SELECT TOTPEnabled AS enabled, TOTPSecret AS secret FROM dbo.tbDealers WHERE idDealer = @id');
    const row = rs.recordset?.[0] || {};
    return res.json({ enrolled: !!row.enabled && !!row.secret });
  } catch (e) {
    console.error('[MFA][STATUS] err:', e);
    return res.status(500).json({ enrolled: false });
  }
});

// POST /mfa/totp/reset -> { reset: true }
app.post('/api/mfa/totp/reset', authenticateToken, async (req, res) => {
  try {
    await ensureDealerTotpColumns();
    const dealerId = Number(req.user?.dealerId ?? req.user?.idDealer);
    if (!Number.isFinite(dealerId)) return res.status(400).json({ error: 'Dealer non valido' });
    await new sql.Request().input('id', sql.Int, dealerId).query("UPDATE dbo.tbDealers SET TOTPSecret = NULL, TOTPEnabled = 0 WHERE idDealer = @id");
    return res.json({ reset: true });
  } catch (e) {
    console.error('[MFA][RESET] err:', e);
    return res.status(500).json({ error: 'Errore reset OTP' });
  }
});

// POST /mfa/totp/enroll -> { otpauth, secret }
app.post('/api/mfa/totp/enroll', authenticateToken, async (req, res) => {
  try {
    await ensureDealerTotpColumns();
    const dealerId = Number(req.user?.dealerId ?? req.user?.idDealer);
    const email = String(req.user?.email || req.user?.UserName || 'dealer');
    if (!Number.isFinite(dealerId)) return res.status(400).json({ error: 'Dealer non valido' });
    // genera secret base32
    const random = crypto.randomBytes(20);
    const secret = bufferToBase32(random); // usa helper definito più sotto nel file
    await new sql.Request()
      .input('sec', sql.NVarChar, secret)
      .input('id', sql.Int, dealerId)
      .query("UPDATE dbo.tbDealers SET TOTPSecret = @sec, TOTPEnabled = 0 WHERE idDealer = @id");
    const issuer = encodeURIComponent('KIM STATION');
    const label = encodeURIComponent(`Station:${email}`);
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
    return res.json({ otpauth, secret });
  } catch (e) {
    console.error('[MFA][ENROLL] err:', e);
    return res.status(500).json({ error: 'Errore enroll' });
  }
});

// GET /mfa/totp/qr?otpauth=...
app.get('/api/mfa/totp/qr', async (req, res) => {
  try {
    const data = String(req.query.otpauth || '');
    if (!data.startsWith('otpauth://')) return res.status(400).send('bad request');
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(data)}`;
    return res.redirect(302, url);
  } catch {
    return res.status(400).send('bad request');
  }
});

// POST /mfa/totp/verify-enrollment -> { ok: true }
app.post('/api/mfa/totp/verify-enrollment', authenticateToken, express.json(), async (req, res) => {
  try {
    await ensureDealerTotpColumns();
    const dealerId = Number(req.user?.dealerId ?? req.user?.idDealer);
    const code = String(req.body?.code || '');
    if (!Number.isFinite(dealerId)) return res.status(400).json({ error: 'Dealer non valido' });
    const rs = await new sql.Request().input('id', sql.Int, dealerId).query('SELECT TOTPSecret FROM dbo.tbDealers WHERE idDealer = @id');
    const secret = rs.recordset?.[0]?.TOTPSecret;
    if (!secret) return res.status(400).json({ error: 'Secret non configurato' });
    const ok = verifyTOTP(code, secret, { window: 1 });
    if (!ok) return res.status(400).json({ error: 'Codice non valido' });
    await new sql.Request().input('id', sql.Int, dealerId).query('UPDATE dbo.tbDealers SET TOTPEnabled = 1 WHERE idDealer = @id');
    return res.json({ ok: true });
  } catch (e) {
    console.error('[MFA][VERIFY-ENROLL] err:', e);
    return res.status(500).json({ error: 'Errore verifica' });
  }
});

// POST /auth/totp/verify -> { token }
app.post('/api/auth/totp/verify', authenticateToken, express.json(), async (req, res) => {
  try {
    await ensureDealerTotpColumns();
    const dealerId = Number(req.user?.dealerId ?? req.user?.idDealer);
    const code = String(req.body?.code || '');
    if (!Number.isFinite(dealerId)) return res.status(400).json({ error: 'Dealer non valido' });
    const rs = await new sql.Request().input('id', sql.Int, dealerId).query('SELECT TOTPSecret, TOTPEnabled FROM dbo.tbDealers WHERE idDealer = @id');
    const row = rs.recordset?.[0] || {};
    if (!row.TOTPSecret || Number(row.TOTPEnabled) !== 1) return res.status(400).json({ error: 'OTP non abilitato' });
    const ok = verifyTOTP(code, row.TOTPSecret, { window: 1 });
    if (!ok) return res.status(400).json({ error: 'Codice non valido' });
    // emetti token elevato (15 min)
    const payload = { sub: req.user?.sub || req.user?.id || dealerId, elevated: true, scope: 'incentivi' };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '15m' });
    return res.json({ token });
  } catch (e) {
    console.error('[MFA][AUTH VERIFY] err:', e);
    return res.status(500).json({ error: 'Errore verifica OTP' });
  }
});

// --- API: Trend mensile (giorno per giorno) ---
app.get('/api/supermaster/trend-mensile', authenticateToken, async (req, res) => {
  try {
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) {
      return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    }
    await getPool();
    const dbName = getDbName();
    const now = new Date();
    const y = req.query.year != null ? parseInt(String(req.query.year), 10) : now.getFullYear();
    const m = req.query.month != null ? parseInt(String(req.query.month), 10) : (now.getMonth() + 1);
    const agente = req.query.agente ? String(req.query.agente).trim() : null;
    const firstDay = new Date(y, m - 1, 1);
    const nextFirstDay = new Date(y, m, 1);

    const q = `
      WITH Giorni AS (
        SELECT CAST(@firstDay AS date) AS Giorno
        UNION ALL
        SELECT DATEADD(day, 1, Giorno) FROM Giorni WHERE DATEADD(day, 1, Giorno) < CAST(@nextFirstDay AS date)
      ),
      Ordini AS (
        SELECT CAST(CONVERT(date, o.DataOra) AS date) AS Giorno, COUNT(*) AS Cnt
        FROM dbo.tbOrdini o
        LEFT JOIN dbo.tbDealers d ON d.IDDealer = o.idDealer
        WHERE o.Stato = 1 AND o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay
          AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
        GROUP BY CONVERT(date, o.DataOra)
      ),
      FW AS (
        SELECT CAST(CONVERT(date, f.[Data Inserimento Ordine]) AS date) AS Giorno, COUNT(DISTINCT f.[Codice Ordine]) AS Cnt
        FROM [${dbName}].[dbo].[InseritoFW] f
        INNER JOIN dbo.tbDealers d ON f.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR f.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
        WHERE f.[Data Inserimento Ordine] >= @firstDay AND f.[Data Inserimento Ordine] < @nextFirstDay
          AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
        GROUP BY CONVERT(date, f.[Data Inserimento Ordine])
      ),
      EN AS (
        SELECT CAST(CONVERT(date, fwe.[DataBatch]) AS date) AS Giorno, COUNT(DISTINCT fwe.[Codice Contratto]) AS Cnt
        FROM [${dbName}].[dbo].[FWEnergiaImporter] fwe
        INNER JOIN dbo.tbDealers d ON fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY1] OR fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY2]
        WHERE fwe.[DataBatch] >= @firstDay AND fwe.[DataBatch] < @nextFirstDay
          AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
        GROUP BY CONVERT(date, fwe.[DataBatch])
      )
      SELECT 
        CONVERT(varchar(10), g.Giorno, 120) AS Giorno,
        ISNULL(o.Cnt, 0) + ISNULL(f.Cnt, 0) + ISNULL(e.Cnt, 0) AS Attivazioni
      FROM Giorni g
      LEFT JOIN Ordini o ON o.Giorno = g.Giorno
      LEFT JOIN FW f ON f.Giorno = g.Giorno
      LEFT JOIN EN e ON e.Giorno = g.Giorno
      OPTION (MAXRECURSION 1000);
    `;
    const rs = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(q);
    return res.json(rs.recordset || []);
  } catch (err) {
    console.error('[SUPERMASTER][TREND] Errore:', err);
    return res.status(500).json({ error: 'Errore trend mensile', details: err.message });
  }
});

// Ricerca Dealer per RagioneSociale (autocomplete)
app.get('/api/supermaster/dealers/search', authenticateToken, async (req, res) => {
  try {
    const ruoli = Array.isArray(req.user?.ruoli) ? req.user.ruoli.map(r => String(r || '').toUpperCase()) : [];
    const has = (r) => ruoli.includes(String(r).toUpperCase());
    const isSuperMaster = has('SUPERMASTER') || has('ADMIN');
    if (!isSuperMaster) return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    const q = (req.query.q || '').toString().trim();
    if (q.length === 0) return res.json([]);
    await getPool();
    // Case-insensitive, accent-insensitive search; TOP 5
    // Cerca in tbDealers (RagioneSociale, PartitaIVA) e in tbAgenti (Nome, Cognome) tramite idDealer
    const reqSql = new sql.Request()
      .input('q', sql.NVarChar, '%' + q + '%');
    const rs = await reqSql.query(`
      SELECT TOP 5 
        CAST(d.IDDealer AS INT) AS DealerID,
        CAST(d.RagioneSociale AS NVARCHAR(255)) AS RagioneSociale,
        CAST(d.PIva AS NVARCHAR(50)) AS PartitaIVA,
        CAST(d.AGENTE AS NVARCHAR(100)) AS AGENTE
      FROM dbo.tbDealers d WITH (NOLOCK)
      WHERE 
        d.RagioneSociale LIKE @q COLLATE Latin1_General_CI_AI
        OR d.PIva LIKE @q COLLATE Latin1_General_CI_AI
        OR EXISTS (
          SELECT 1 
          FROM dbo.tbAgenti a WITH (NOLOCK)
          WHERE a.idDealer = d.IDDealer
            AND (
              a.Nome LIKE @q COLLATE Latin1_General_CI_AI
              OR a.Cognome LIKE @q COLLATE Latin1_General_CI_AI
              OR (a.Nome + ' ' + a.Cognome) LIKE @q COLLATE Latin1_General_CI_AI
              OR (a.Cognome + ' ' + a.Nome) LIKE @q COLLATE Latin1_General_CI_AI
            )
        )
      ORDER BY d.RagioneSociale ASC`);
    return res.json(rs.recordset || []);
  } catch (err) {
    console.error('[DEALERS][SEARCH] Errore:', err);
    return res.status(500).json({ error: 'Errore ricerca dealers', details: err.message });
  }
});

// Migrator: crea colonne allegati se mancanti (AttachmentUrl, AttachmentName, AttachmentKey)
app.post('/api/supermaster/news/migrate-attachments', authenticateToken, async (req, res) => {
  try {
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    await getPool();

    const cols = [
      { name: 'AttachmentUrl',   sql: "ALTER TABLE dbo.news ADD AttachmentUrl NVARCHAR(500) NULL" },
      { name: 'AttachmentName',  sql: "ALTER TABLE dbo.news ADD AttachmentName NVARCHAR(300) NULL" },
      { name: 'AttachmentKey',   sql: "ALTER TABLE dbo.news ADD AttachmentKey NVARCHAR(500) NULL" },
    ];
    const created = [];
    for (const c of cols) {
      const exists = await newsColumnExists(c.name);
      if (!exists) {
        await sql.query(c.sql);
        __NEWS_COL_CACHE.set(c.name.toLowerCase(), true);
        created.push(c.name);
      }
    }
    return res.json({ migrated: created.length, created });
  } catch (err) {
    console.error('[NEWS][MIGRATE] Errore:', err);
    return res.status(500).json({ error: 'Errore migrazione news', details: err.message });
  }
});

// --- API: NEWS (CRUD) ---
// Tabella attesa: dbo.news
// Schema suggerito:
// CREATE TABLE dbo.news (
//   ID INT IDENTITY(1,1) PRIMARY KEY,
//   Scope NVARCHAR(20) NOT NULL CHECK (Scope IN ('dealer','agente')),
//   DealerID INT NULL,
//   Agente NVARCHAR(200) NULL,
//   Titolo NVARCHAR(300) NOT NULL,
//   Messaggio NVARCHAR(MAX) NOT NULL,
//   ValidFrom DATE NULL,
//   ValidTo   DATE NULL,
//   Active BIT NOT NULL DEFAULT(1),
//   CreatedAt DATETIME2 NOT NULL DEFAULT(SYSDATETIME())
// );

// Lista news (filtrabile)
app.get('/api/supermaster/news', authenticateToken, async (req, res) => {
  try {
    const ruoli = Array.isArray(req.user?.ruoli) ? req.user.ruoli.map(r => String(r || '').toUpperCase()) : [];
    const has = (r) => ruoli.includes(String(r).toUpperCase());
    const isSuperMaster = has('SUPERMASTER');
    const isAdmin = has('ADMIN');
    const isDealer = has('DEALER') || has('MASTER') || has('MASTERPRODOTTI');
    const isAgente = has('AGENTE');

    await getPool();

    // Parametri in input (usati solo per SM/Admin)
    let scope = req.query.scope ? String(req.query.scope).toLowerCase() : null; // dealer|agente
    let dealerId = req.query.dealerId != null ? parseInt(String(req.query.dealerId), 10) : null;
    let agente = req.query.agente ? String(req.query.agente).trim() : null;
    let activeOnly = req.query.active === '1' || req.query.active === 'true';

    if (!(isSuperMaster || isAdmin)) {
      // Ruoli non-SM: restringi visibilità
      // Priorità: se l'utente è anche AGENTE, e non ha un dealerId valido, tratta come AGENTE
      const myDealerId = Number(req.user?.idDealer ?? req.user?.dealerId);
      const hasValidDealer = Number.isFinite(myDealerId);
      if (isAgente && (!isDealer || !hasValidDealer)) {
        scope = 'agente';
        const myAgente = (req.user?.agenteNome || req.user?.name || req.user?.nome || '').toString().trim();
        if (!myAgente) return res.status(403).json({ error: 'Agente non presente nel token' });
        agente = myAgente;
        if (!(req.query.active === '0' || req.query.active === 'false')) activeOnly = true;
      } else if (isDealer) {
        scope = 'dealer';
        if (!hasValidDealer) return res.status(403).json({ error: 'DealerID non presente nel token' });
        dealerId = myDealerId;
        // Per sicurezza, abilita solo attive se non esplicitato
        if (!(req.query.active === '0' || req.query.active === 'false')) activeOnly = true;
      } else {
        return res.status(403).json({ error: 'Accesso negato' });
      }
    }

    const where = ['1=1'];
    const reqSql = new sql.Request();
    if (scope) { where.push('Scope = @scope'); reqSql.input('scope', sql.NVarChar, scope); }
    // Dealer: se non SM/Admin e filtriamo per dealerId, includi anche broadcast (DealerID IS NULL)
    if (Number.isFinite(dealerId)) {
      if (!(isSuperMaster || isAdmin) && isDealer) {
        where.push('(DealerID = @dealerId OR DealerID IS NULL)');
      } else {
        where.push('DealerID = @dealerId');
      }
      reqSql.input('dealerId', sql.Int, dealerId);
    }
    // Agente: confronto case-insensitive e includi broadcast (Agente IS NULL) per non SM/Admin
    if (agente) {
      if (!(isSuperMaster || isAdmin) && isAgente) {
        where.push("(UPPER(LTRIM(RTRIM(ISNULL(Agente, N'')))) = UPPER(@agente) OR Agente IS NULL)");
      } else {
        where.push("UPPER(LTRIM(RTRIM(ISNULL(Agente, N'')))) = UPPER(@agente)");
      }
      reqSql.input('agente', sql.NVarChar, agente);
    }
    if (activeOnly) { where.push('Active = 1'); }
    const q = `SELECT ID, Scope, DealerID, Agente, Titolo, Messaggio, ValidFrom, ValidTo, Active, CreatedAt
               FROM dbo.news
               WHERE ${where.join(' AND ')}
               ORDER BY CreatedAt DESC, ID DESC`;
    const rs = await reqSql.query(q);
    return res.json(rs.recordset || []);
  } catch (err) {
    console.error('[NEWS][LIST] Errore:', err);
    return res.status(500).json({ error: 'Errore lista news', details: err.message });
  }
});

// Helper: verifica se una colonna esiste su dbo.news (cache semplice in memoria)
const __NEWS_COL_CACHE = new Map();
async function newsColumnExists(colName) {
  const key = String(colName).toLowerCase();
  if (__NEWS_COL_CACHE.has(key)) return __NEWS_COL_CACHE.get(key);
  try {
    const rs = await (new sql.Request())
      .input('col', sql.NVarChar, colName)
      .query(`SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'news' AND COLUMN_NAME = @col`);
    const exists = !!rs.recordset?.[0];
    __NEWS_COL_CACHE.set(key, exists);
    return exists;
  } catch {
    __NEWS_COL_CACHE.set(key, false);
    return false;
  }
}

// Upload allegato per NEWS (multipart)
const uploadNews = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB
app.post('/api/supermaster/news/upload', authenticateToken, uploadNews.single('file'), async (req, res) => {
  try {
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    if (!req.file) return res.status(400).json({ error: 'File mancante' });
    const buf = req.file.buffer;
    const originalName = req.file.originalname || 'allegato';
    const contentType = req.file.mimetype || 'application/octet-stream';
    // Validate types: pdf, jpg, png
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    const ext = (originalName.split('.').pop() || '').toLowerCase();
    const allowedExt = ['pdf','jpg','jpeg','png'];
    if (!allowed.includes(contentType) || !allowedExt.includes(ext)) {
      return res.status(400).json({ error: 'Tipo file non consentito. Ammessi: pdf, jpg, png' });
    }
    const ts = new Date();
    const yyyy = ts.getFullYear();
    const mm = String(ts.getMonth() + 1).padStart(2, '0');
    const safeName = originalName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const key = `uploads/news/${yyyy}/${mm}/${Date.now()}_${safeName}`;
    const out = await uploadToS3(buf, key, contentType);
    // uploadToS3 dovrebbe restituire URL pubblico o chiave; in caso contrario, costruisci URL se hai bucket noto
    const url = out?.url || out?.Location || out?.location || null;
    return res.json({ url, key, contentType, size: req.file.size, originalName: safeName });
  } catch (err) {
    console.error('[NEWS][UPLOAD] Errore:', err);
    return res.status(500).json({ error: 'Errore upload allegato', details: err.message });
  }
});

// Crea news
app.post('/api/supermaster/news', authenticateToken, async (req, res) => {
  try {
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    await getPool();
    const body = req.body || {};
    const scope = String(body.scope || body.Scope || '').toLowerCase();
    if (!scope || !['dealer','agente'].includes(scope)) return res.status(400).json({ error: 'Scope non valido' });
    const titolo = String(body.titolo || body.Titolo || '').trim();
    const messaggio = String(body.messaggio || body.Messaggio || '').trim();
    if (!titolo || !messaggio) return res.status(400).json({ error: 'Titolo e messaggio sono obbligatori' });
    const dealerId = body.dealerId != null ? parseInt(String(body.dealerId), 10) : null;
    const agente = body.agente ? String(body.agente).trim() : null;
    const validFrom = body.validFrom ? new Date(body.validFrom) : null;
    const validTo = body.validTo ? new Date(body.validTo) : null;
    const active = body.active == null ? 1 : (body.active ? 1 : 0);
    // Attachment opzionali
    const attachmentUrl = req.body.attachmentUrl ? String(req.body.attachmentUrl) : null;
    const attachmentName = req.body.attachmentName ? String(req.body.attachmentName) : null;
    const attachmentKey = req.body.attachmentKey ? String(req.body.attachmentKey) : null;

    // Costruisci inserimento dinamico includendo colonne attachment solo se esistono
    const cols = ['Scope','DealerID','Agente','Titolo','Messaggio','ValidFrom','ValidTo','Active'];
    const vals = ['@scope','@dealerId','@agente','@titolo','@messaggio','@validFrom','@validTo','@active'];
    const request = new sql.Request()
      .input('scope', sql.NVarChar, scope)
      .input('dealerId', sql.Int, dealerId)
      .input('agente', sql.NVarChar, agente)
      .input('titolo', sql.NVarChar, titolo)
      .input('messaggio', sql.NVarChar, messaggio)
      .input('validFrom', sql.Date, validFrom)
      .input('validTo', sql.Date, validTo)
      .input('active', sql.Bit, active);
    if (attachmentUrl && await newsColumnExists('AttachmentUrl')) { cols.push('AttachmentUrl'); vals.push('@attachmentUrl'); request.input('attachmentUrl', sql.NVarChar, attachmentUrl); }
    if (attachmentName && await newsColumnExists('AttachmentName')) { cols.push('AttachmentName'); vals.push('@attachmentName'); request.input('attachmentName', sql.NVarChar, attachmentName); }
    if (attachmentKey && await newsColumnExists('AttachmentKey')) { cols.push('AttachmentKey'); vals.push('@attachmentKey'); request.input('attachmentKey', sql.NVarChar, attachmentKey); }
    const sqlInsert = `INSERT INTO dbo.news (${cols.join(', ')}) OUTPUT INSERTED.* VALUES (${vals.join(', ')})`;
    const rs = await request.query(sqlInsert);
    return res.json(rs.recordset?.[0] || { success: true });
  } catch (err) {
    console.error('[NEWS][CREATE] Errore:', err);
    return res.status(500).json({ error: 'Errore creazione news', details: err.message });
  }
});

// Aggiorna news
app.put('/api/supermaster/news/:id', authenticateToken, async (req, res) => {
  try {
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    await getPool();
    const id = parseInt(req.params.id, 10);
    const body = req.body || {};
    const fields = [];
    const reqSql = new sql.Request();
    reqSql.input('id', sql.Int, id);
    if (body.scope) { fields.push('Scope = @scope'); reqSql.input('scope', sql.NVarChar, String(body.scope).toLowerCase()); }
    if (body.dealerId !== undefined) { fields.push('DealerID = @dealerId'); reqSql.input('dealerId', sql.Int, body.dealerId != null ? parseInt(String(body.dealerId), 10) : null); }
    if (body.agente !== undefined) { fields.push('Agente = @agente'); reqSql.input('agente', sql.NVarChar, body.agente ? String(body.agente).trim() : null); }
    if (body.titolo !== undefined) { fields.push('Titolo = @titolo'); reqSql.input('titolo', sql.NVarChar, String(body.titolo || '')); }
    if (body.messaggio !== undefined) { fields.push('Messaggio = @messaggio'); reqSql.input('messaggio', sql.NVarChar, String(body.messaggio || '')); }
    if (body.validFrom !== undefined) { fields.push('ValidFrom = @validFrom'); reqSql.input('validFrom', sql.Date, body.validFrom ? new Date(body.validFrom) : null); }
    if (body.validTo !== undefined) { fields.push('ValidTo = @validTo'); reqSql.input('validTo', sql.Date, body.validTo ? new Date(body.validTo) : null); }
    if (body.active !== undefined) { fields.push('Active = @active'); reqSql.input('active', sql.Bit, body.active ? 1 : 0); }
    // Attachment opzionali
    const attachmentUrl = req.body.attachmentUrl;
    const attachmentName = req.body.attachmentName;
    const attachmentKey = req.body.attachmentKey;
    if (attachmentUrl !== undefined && await newsColumnExists('AttachmentUrl')) { fields.push('AttachmentUrl = @attachmentUrl'); reqSql.input('attachmentUrl', sql.NVarChar, attachmentUrl || null); }
    if (attachmentName !== undefined && await newsColumnExists('AttachmentName')) { fields.push('AttachmentName = @attachmentName'); reqSql.input('attachmentName', sql.NVarChar, attachmentName || null); }
    if (attachmentKey !== undefined && await newsColumnExists('AttachmentKey')) { fields.push('AttachmentKey = @attachmentKey'); reqSql.input('attachmentKey', sql.NVarChar, attachmentKey || null); }
    if (fields.length === 0) return res.json({ updated: 0 });
    const rs = await reqSql.query(`UPDATE dbo.news SET ${fields.join(', ')} WHERE ID = @id; SELECT * FROM dbo.news WHERE ID = @id;`);
    return res.json(rs.recordset?.[0] || { updated: 1 });
  } catch (err) {
    console.error('[NEWS][UPDATE] Errore:', err);
    return res.status(500).json({ error: 'Errore aggiornamento news', details: err.message });
  }
});

// Cancella news
app.delete('/api/supermaster/news/:id', authenticateToken, async (req, res) => {
  try {
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    await getPool();
    const id = parseInt(req.params.id, 10);
    await (new sql.Request()).input('id', sql.Int, id).query('DELETE FROM dbo.news WHERE ID = @id');
    return res.json({ deleted: 1 });
  } catch (err) {
    console.error('[NEWS][DELETE] Errore:', err);
    return res.status(500).json({ error: 'Errore cancellazione news', details: err.message });
  }
});

// MASTER: Dettaglio contratto con storico
app.get('/api/master/contratti/:id', authenticateToken, onlyMaster, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID non valido' });
  try {
    await getPool();
    // Dati principali contratto
    const base = await (await getRequest()).query`
      SELECT fs.ID, fs.idDealer, fs.DataOra, fs.NomeFile, fs.FileUID, fs.CognomeCliente, fs.CodiceProposta,
             fs.FullPath, fs.Utente, fs.MeseContratto, fs.AnnoContratto, fs.Stato, fs.Note,
             d.RagioneSociale AS NomeDealer, d.RecapitoEmail AS DealerEmail,
             so.StatoEsteso
      FROM dbo.tbFilesStorage fs
      LEFT JOIN dbo.tbDealers d ON fs.idDealer = d.IDDealer
      LEFT JOIN dbo.tbStatiOrdiniContratti so ON fs.Stato = so.IDStato
      WHERE fs.ID = ${id}
    `;
    if (base.recordset.length === 0) return res.status(404).json({ error: 'Contratto non trovato' });
    const row = base.recordset[0];

    // Storico (se tabella esiste)
    let storico = [];
    try {
      const stor = await (await getRequest()).query`
        SELECT 
          CONVERT(varchar(33), CAST(SWITCHOFFSET(CONVERT(datetimeoffset, s.DataOra), '+00:00') AS datetime2), 126) + 'Z' AS DataOra,
          s.Utente,
          s.StatoPrecedente,
          sp.StatoEsteso AS StatoPrecedenteNome,
          s.StatoNuovo,
          sn.StatoEsteso AS StatoNuovoNome,
          s.Nota
        FROM dbo.tbStoricoContratti s
        LEFT JOIN dbo.tbStatiOrdiniContratti sp ON sp.IDStato = s.StatoPrecedente
        LEFT JOIN dbo.tbStatiOrdiniContratti sn ON sn.IDStato = s.StatoNuovo
        WHERE s.IDFile = ${id}
        ORDER BY s.DataOra DESC
      `;
      storico = stor.recordset || [];
    } catch (e) {
      storico = [];
    }

    // Costruisci URL documento se disponibile
    let DocumentoUrl = null;
    try {
      const fp = row.FullPath ? String(row.FullPath) : '';
      const path = fp.replace(/^\/uploads\//, '').replace(/^\/+/, '');
      DocumentoUrl = path ? `https://contrattistation.s3.eu-west-1.amazonaws.com/${path}` : null;
    } catch {}

    return res.json({
      ID: row.ID,
      idDealer: row.idDealer,
      DataOra: row.DataOra,
      NomeFile: row.NomeFile,
      FileUID: row.FileUID,
      CognomeCliente: row.CognomeCliente,
      CodiceProposta: row.CodiceProposta,
      FullPath: row.FullPath,
      DocumentoUrl,
      Utente: row.Utente,
      MeseContratto: row.MeseContratto,
      AnnoContratto: row.AnnoContratto,
      Stato: row.StatoEsteso || row.Stato,
      Note: row.Note,
      Dealer: row.NomeDealer,
      DealerEmail: row.DealerEmail,
      Storico: storico
    });
  } catch (err) {
    console.error('[MASTER][CONTRATTI][DETTAGLIO] Errore:', err);
    return res.status(500).json({ error: 'Errore recupero dettaglio contratto', details: err.message });
  }
});

// MASTER: ACCETTA contratto -> Stato = 10
app.post('/api/master/contratti/:id/accetta', authenticateToken, onlyMaster, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID non valido' });
  try {
    await getPool();
    // Recupera stato precedente per storico
    const prev = await (await getRequest()).query`
      SELECT fs.Stato AS VecchioStato, so.StatoEsteso AS VecchioStatoNome
      FROM dbo.tbFilesStorage fs
      LEFT JOIN dbo.tbStatiOrdiniContratti so ON fs.Stato = so.IDStato
      WHERE fs.ID = ${id}
    `;
    // CORREZIONE: Non aggiornare manualmente, lascia che la stored procedure gestisca tutto
    // Recupera StatoEsteso per il nuovo stato (10 = ACCETTATO)
    const rs = await (await getRequest()).query`
      SELECT so.StatoEsteso
      FROM dbo.tbStatiOrdiniContratti so
      WHERE so.IDStato = 10
    `;
    const statoEsteso = rs.recordset?.[0]?.StatoEsteso || 'ACCETTATO';
    const { masterId, masterEmail, ipAddress, userAgent } = extractMasterContext(req);
    try {
      const reqLog = new sql.Request();
      reqLog.input('MasterId', sql.Int, masterId > 0 ? masterId : null);
      reqLog.input('MasterEmail', sql.NVarChar(255), masterEmail);
      reqLog.input('ContrattoId', sql.Int, id);
      reqLog.input('NuovoStato', sql.Int, 10);
      reqLog.input('NuovoStatoNome', sql.NVarChar(510), statoEsteso);
      reqLog.input('NotaStorico', sql.NVarChar(sql.MAX), null);
      reqLog.input('Motivazione', sql.NVarChar(400), req.body?.motivazione || null);
      reqLog.input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify({ action: 'ACCETTA_CONTRATTO', previous: prev.recordset?.[0]?.VecchioStato || null }) || null);
      reqLog.input('IpAddress', sql.VarChar(45), ipAddress);
      reqLog.input('UserAgent', sql.NVarChar(600), userAgent);
      await reqLog.execute('dbo.sp_master_update_contratto');
    } catch (logErr) {
      console.warn('[MASTER][CONTRATTI][ACCETTA][LOG] fallita:', logErr?.message || logErr);
    }
    return res.json({ success: true, id, nuovoStato: 10, statoEsteso });
  } catch (err) {
    console.error('[MASTER][CONTRATTI][ACCETTA] Errore:', err);
    return res.status(500).json({ error: 'Errore accettazione contratto', details: err.message });
  }
});

// MASTER: RIFIUTA contratto -> Stato = 11 + invio email
app.post('/api/master/contratti/:id/rifiuta', authenticateToken, onlyMaster, express.json(), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const nota = (req.body?.nota || req.body?.note || '').toString();
  if (!id) return res.status(400).json({ error: 'ID non valido' });
  try {
    await getPool();
    // Recupera stato precedente per storico
    const prev = await (await getRequest()).query`
      SELECT fs.Stato AS VecchioStato, so.StatoEsteso AS VecchioStatoNome
      FROM dbo.tbFilesStorage fs
      LEFT JOIN dbo.tbStatiOrdiniContratti so ON fs.Stato = so.IDStato
      WHERE fs.ID = ${id}
    `;
    // Aggiorna stato
    // CORREZIONE: Aggiorna solo la nota separatamente, lo stato lo gestisce la stored procedure
    if (nota) {
      await (await getRequest()).query`
        UPDATE dbo.tbFilesStorage
        SET Note = ${nota}
        WHERE ID = ${id}
      `;
    }

    // Recupera dati per email e StatoEsteso
    const rs = await (await getRequest()).query`
      SELECT fs.ID, fs.idDealer, fs.NomeFile, fs.CognomeCliente, fs.CodiceProposta, fs.MeseContratto, fs.AnnoContratto,
             fs.FullPath, fs.Utente,
             d.RagioneSociale AS DealerNome, d.RecapitoEmail AS DealerEmail,
             so.StatoEsteso, so.MailSubject, so.MailTemplate, so.Notifica
      FROM dbo.tbFilesStorage fs
      LEFT JOIN dbo.tbDealers d ON fs.idDealer = d.IDDealer
      LEFT JOIN dbo.tbStatiOrdiniContratti so ON so.IDStato = 11
      WHERE fs.ID = ${id}
    `;
    const row = rs.recordset?.[0];
    const { masterId, masterEmail, ipAddress, userAgent } = extractMasterContext(req);
    try {
      const reqLog = new sql.Request();
      reqLog.input('MasterId', sql.Int, masterId > 0 ? masterId : null);
      reqLog.input('MasterEmail', sql.NVarChar(255), masterEmail);
      reqLog.input('ContrattoId', sql.Int, id);
      reqLog.input('NuovoStato', sql.Int, 11);
      reqLog.input('NuovoStatoNome', sql.NVarChar(510), row?.StatoEsteso || 'RIFIUTATO');
      reqLog.input('NotaStorico', sql.NVarChar(sql.MAX), nota || null);
      reqLog.input('Motivazione', sql.NVarChar(400), req.body?.motivazione || null);
      reqLog.input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify({ action: 'RIFIUTA_CONTRATTO', previous: prev.recordset?.[0]?.VecchioStato || null }) || null);
      reqLog.input('IpAddress', sql.VarChar(45), ipAddress);
      reqLog.input('UserAgent', sql.NVarChar(600), userAgent);
      await reqLog.execute('dbo.sp_master_update_contratto');
    } catch (logErr) {
      console.warn('[MASTER][CONTRATTI][RIFIUTA][LOG] fallita:', logErr?.message || logErr);
    }
    // Invia email solo se Notifica = 1 e abbiamo un template
    if (row && Number(row.Notifica) === 1 && row.MailTemplate) {
      try {
        const subjectRaw = row.MailSubject || `KIM STATION: Contratto ${row.CodiceProposta || id} — RIFIUTATO`;
        const html = String(row.MailTemplate)
          .replace(/{{CODICE_PROPOSTA}}/g, row.CodiceProposta || '')
          .replace(/{{DEALER_NOME}}/g, row.DealerNome || '')
          .replace(/{{COGNOME_CLIENTE}}/g, row.CognomeCliente || '')
          .replace(/{{NOME_FILE}}/g, row.NomeFile || '')
          .replace(/{{MESE_CONTRATTO}}/g, String(row.MeseContratto || ''))
          .replace(/{{ANNO_CONTRATTO}}/g, String(row.AnnoContratto || ''))
          .replace(/{{NOTE}}/g, nota || 'Nessuna nota');
        const subject = String(subjectRaw)
          .replace(/{{CODICE_PROPOSTA}}/g, row.CodiceProposta || '');
        const emailContent = {
          to: row.DealerEmail || process.env.EMAIL_ADMIN,
          cc: undefined,
          bcc: undefined,
          subject,
          html,
          text: undefined,
        };
        try {
          const emailService = (await import('./email-service.mjs')).default;
          await emailService.sendEmail(emailContent);
        } catch (e) {
          console.warn('[MASTER][CONTRATTI][RIFIUTA] Invio email fallito:', e?.message || e);
        }
      } catch (tplErr) {
        console.warn('[MASTER][CONTRATTI][RIFIUTA] Template email non valido:', tplErr?.message || tplErr);
      }
    }
    return res.json({ success: true, id, nuovoStato: 11, statoEsteso: row?.StatoEsteso || 'RIFIUTATO' });
  } catch (err) {
    console.error('[MASTER][CONTRATTI][RIFIUTA] Errore:', err);
    return res.status(500).json({ error: 'Errore rifiuto contratto', details: err.message });
  }
});

// --- Helpers: Base32 encoder (RFC 4648, no padding) ---
function bufferToBase32(buf) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5);
    if (chunk.length < 5) break;
    out += alphabet[parseInt(chunk, 2) & 31];
  }
  return out;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache templates.json e helper per mappare TemplateDatiOfferta -> TemplateCodice/Template
const templatesPath = path.join(__dirname, 'templates.json');
let TEMPLATES_CACHE = null;
function loadTemplates() {
  if (!TEMPLATES_CACHE) {
    try {
      const raw = fs.readFileSync(templatesPath, 'utf-8');
      TEMPLATES_CACHE = JSON.parse(raw);
    } catch (e) {
      console.error('[TEMPLATES] Impossibile caricare templates.json:', e?.message);
      TEMPLATES_CACHE = [];
    }
  }
  return TEMPLATES_CACHE;
}
function normalizeTemplateCode(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase().replace(/\s+/g, '_');
}
function findTemplateByCode(rawCode) {
  const code = normalizeTemplateCode(rawCode);
  if (!code) return { code: null, template: null };
  const list = loadTemplates();
  const tpl = list.find(t => normalizeTemplateCode(t?.template) === code) || null;
  return { code, template: tpl };
}

// Whitelist email "MASTER" centralizzata (aggiungi qui altri account autorizzati)
const MASTER_EMAIL_WHITELIST = new Set([
  'attivazioni@kimweb.it',
  'a.spalluto@kimweb.it',
  'c.loiacono@kimweb.it',
  'comunicazioni@kimweb.it'
]);

const SUPERMASTER_BACKEND_TARGETS = Object.freeze([
  'attivazioni@kimweb.it',
  'c.loiacono@kimweb.it'
]);

function extractMasterContext(req) {
  // Supporta sia ID numerici che GUID (stringa)
  const rawIdValue = req?.user?.userId ?? req?.user?.id ?? req?.user?.Id ?? req?.user?.idUtente ?? req?.user?.ID;
  let masterId = 0;
  
  // Se è un numero, usalo direttamente
  if (typeof rawIdValue === 'number' && Number.isInteger(rawIdValue) && rawIdValue > 0) {
    masterId = rawIdValue;
  } 
  // Se è una stringa (GUID), prova a convertirla in numero, altrimenti usa 0
  else if (typeof rawIdValue === 'string' && rawIdValue.trim()) {
    const numericId = Number(rawIdValue);
    masterId = Number.isInteger(numericId) && numericId > 0 ? numericId : 0;
  }
  
  let masterEmail = (req?.user?.email || req?.user?.UserName || req?.user?.Nome || 'master@kimweb.it');
  
  // CORREZIONE: Usa l'email reale dell'utente loggato se è un Master
  const userRoles = Array.isArray(req?.user?.ruoli) ? req.user.ruoli.map(r => String(r).toUpperCase()) : [];
  const isMaster = userRoles.includes('MASTER') || userRoles.includes('SUPERMASTER') || userRoles.includes('MASTERPRODOTTI');
  
  if (isMaster) {
    // Usa l'email reale dell'utente dal token JWT
    const tokenEmail = req?.user?.email || req?.user?.UserName || req?.user?.Nome;
    if (tokenEmail) {
      masterEmail = String(tokenEmail).toLowerCase().trim();
    }
    
    // Per utenti Master con GUID, non serve il warning perché l'email è sufficiente
    // Il warning viene mostrato solo se serve davvero un ID numerico
  }
  
  const forwarded = (req?.headers?.['x-forwarded-for'] || '').split(',').map(s => s.trim()).find(Boolean);
  const ipAddress = forwarded || req?.socket?.remoteAddress || null;
  const userAgent = req?.headers?.['user-agent'] || null;
  
  return { masterId, masterEmail, ipAddress, userAgent };
}

function isMasterEmail(email) {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  return MASTER_EMAIL_WHITELIST.has(e);
}

// Helpers ruoli (case-insensitive)
function normalizeRoles(input) {
  try {
    if (!input) return [];
    if (Array.isArray(input)) return input.map(r => String(r || '').toLowerCase());
    const s = String(input || '').toLowerCase();
    // supporta csv: "superuser, master"
    return s.split(/[,;\s]+/).filter(Boolean);
  } catch { return []; }
}
function isSuperOrMaster(user) {
  if (!user) return false;
  const sources = [user.ruoli, user.roles, user.role, user.Ruoli, user.Roles];
  const roles = sources.flatMap(normalizeRoles);
  const set = new Set(roles);
  return set.has('superuser') || set.has('master') || set.has('supermaster');
}
// Middleware: solo SuperUser o Master (oltre all'admin email)
function onlyAdmin(req, res, next) {
  if (
    req.user && (
      req.user.email === 'admin@kim.local' ||
      isSuperOrMaster(req.user) ||
      isMasterEmail(req.user.email)
    )
  ) {
    return next();
  }
  try {
    console.warn('[AUTH][onlyAdmin][DENY]', {
      email: req.user?.email,
      ruoli: req.user?.ruoli,
      roles: req.user?.roles,
      role: req.user?.role
    });
  } catch {}
  return res.status(403).json({ error: 'Accesso riservato a SuperUser o Master' });
}
 

// Funzione per caricare template dinamicamente
async function loadTemplate(templateName) {
  try {
    const templatesPath = path.join(__dirname, 'templates.json');
    const templatesData = await fs.promises.readFile(templatesPath, 'utf8');
    const templates = JSON.parse(templatesData);
    const template = templates.find(t => t.template === templateName);
    
    if (!template) {
      console.warn(`[TEMPLATE] Template '${templateName}' non trovato`);
      return null;
    }
    
    console.log(`[TEMPLATE] Template '${templateName}' caricato con ${template.campi?.length || 0} campi e ${template.documenti?.length || 0} documenti`);
    return template;
  } catch (error) {
    console.error(`[TEMPLATE] Errore caricamento template '${templateName}':`, error);
    return null;
  }
}

// Carica le variabili d'ambiente
const result = dotenv.config({ path: path.join(__dirname, '.env') });
// Secure logging controls
const secureDebug = (process.env.DEBUG_SECURE_LOGS === 'true') && (process.env.NODE_ENV !== 'production');
const mask = (k) => (k ? (k.slice(0, 4) + '...' + k.slice(-4)) : 'undefined');
if (secureDebug) {
  console.log('[DEBUG][STRIPE] Chiave usata (masked):', mask(process.env.STRIPE_SECRET_KEY));
}
console.log('[DEBUG] dotenv result:', result);
console.log('[DEBUG] DB_NAME loaded:', process.env.DB_NAME);
console.log('[DEBUG] MAINTENANCE_MODE from .env:', process.env.MAINTENANCE_MODE);

// FORZA MAINTENANCE_MODE = false per produzione
process.env.MAINTENANCE_MODE = 'false';
console.log('[DEBUG] MAINTENANCE_MODE FORCED to:', process.env.MAINTENANCE_MODE);

// NOTA: getDbName() ora importata da db-pool.mjs
console.log('[DEBUG] Database determinato:', getDbName());
if (secureDebug) {
  console.log('[DEBUG] Stripe key (masked):', mask(process.env.STRIPE_SECRET_KEY));
}

// Configura axios per non verificare i certificati SSL
axios.defaults.httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

// (route spostata più in basso, dopo l'inizializzazione di app)

// === UPLOAD ALLEGATO NOTA (qualsiasi tipo) ===
const uploadNota = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// app già inizializzata sopra

// --- IMPERSONATE DEALER ENDPOINT ---
// Consente agli utenti in whitelist MASTER di ottenere un token impersonando un dealer specifico (per test/assistenza)
// Body opzionale: { email: 'dealer@example.com' } altrimenti usa un default configurato lato frontend
app.post('/api/impersonate-dealer', authenticateToken, express.json(), async (req, res) => {
  try {
    const caller = req.user || {};
    const callerEmail = (caller.email || '').toLowerCase();

    if (!callerEmail) {
      return res.status(401).json({ error: 'Token non valido: email mancante' });
    }
    const callerRoles = Array.isArray(caller.ruoli) ? caller.ruoli.map(r => String(r).toUpperCase()) : [];
    const isAllowed = isMasterEmail(callerEmail) || callerRoles.includes('SUPERMASTER') || callerRoles.includes('MASTERPRODOTTI') || callerRoles.includes('MASTER');
    if (!isAllowed) {
      return res.status(403).json({ error: 'Accesso negato: solo MASTER/SuperMaster può impersonare DEALER' });
    }

    const targetId = Number(req.body?.idDealer || req.body?.dealerId);
    const targetEmail = (req.body?.email || '').toLowerCase();
    if (!targetId && !targetEmail) {
      return res.status(400).json({ error: 'Specificare idDealer oppure email del dealer target' });
    }

    // Recupera dealer dal DB (priorità: idDealer)
    await getPool();
    let dealerRes;
    if (Number.isInteger(targetId) && targetId > 0) {
      dealerRes = await new sql.Request()
        .input('idDealer', sql.Int, targetId)
        .query(`SELECT TOP 1 IDDealer, Email, Nome, Cognome, RagioneSociale FROM dbo.tbDealers WHERE IDDealer = @idDealer AND Attivo = 1`);
    } else {
      dealerRes = await new sql.Request()
        .input('email', sql.NVarChar, targetEmail)
        .query(`SELECT TOP 1 IDDealer, Email, Nome, Cognome, RagioneSociale FROM dbo.tbDealers WHERE Email = @email AND Attivo = 1`);
    }

    if (!dealerRes.recordset?.length) {
      return res.status(404).json({ error: 'Dealer non trovato o non attivo', idDealer: targetId || undefined, email: targetEmail || undefined });
    }
    const dealer = dealerRes.recordset[0];

    const ruoli = Array.isArray(caller.ruoli) ? caller.ruoli.slice() : [];
    if (!ruoli.map(r => String(r).toUpperCase()).includes('DEALER')) ruoli.push('DEALER');

    const impersonated = {
      ...caller,
      email: dealer.Email?.toLowerCase() || targetEmail,
      ruolo: 'DEALER',
      ruoli,
      // Identificatori coerenti usati in varie parti dell'app
      userId: dealer.IDDealer,
      dealerId: dealer.IDDealer,
      idDealer: dealer.IDDealer,
      nome: dealer.Nome || caller.nome,
      cognome: dealer.Cognome || caller.cognome,
      ragioneSociale: dealer.RagioneSociale || undefined,
      impersonatedFrom: callerEmail
    };

    const { exp, iat, nbf, ...payload } = impersonated;
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    return res.json({
      token,
      user: impersonated,
      message: 'Impersonazione DEALER riuscita'
    });
  } catch (err) {
    console.error('[IMPERSONATE DEALER] Errore:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

// === CAMBIO STATO (multipart con allegato opzionale) ===
// Nota: questa route è definita PRIMA della versione JSON.
// Se il Content-Type è multipart/form-data, verrà intercettata qui.
app.post('/api/master/attivazione/:id/stato', authenticateToken, onlyMaster, (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) return next();
  // Non multipart: passa alla route successiva (JSON)
  return next('route');
}, uploadNota.single('allegato'), async (req, res) => {
  try {
    const id = req.params.id;
    // I campi testo arrivano in req.body
    let { nuovoStato, nota, pulsanteCliccato } = req.body || {};

    // MAPPATURA STATI (stessa della route JSON)
    const statoStringToNumber = {
      '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
      'ATTESA_MODULO': 10,
      'SIM_SOSTITUITA': 11,
      'CLIENTE_ACQUISIBILE': 12,
      'CLIENTE_NON_ACQUISIBILE': 24,
      'IN_LAVORAZIONE': 13,
      'GESTITO_CON_NOTA': 14,
      'TICKET_IN_LAVORAZIONE': 25,
      'TICKET_GESTITO_CON_NOTA': 26,
      'RILANCIO_ESEGUITO': 15,
      'ATTESA_INTEGRAZIONE': 3,
      'RESET_ESEGUITO': 16,
      'RESET_IN_GESTIONE': 17,
      'ORDINE_SBLOCCATO': 18,
      'RICONTATTO_PRENOTATO': 19,
      'SUBENTRO_EFFETTUATO': 27
    };

    let statoFinale;
    if (typeof nuovoStato === 'string' && Object.prototype.hasOwnProperty.call(statoStringToNumber, nuovoStato)) {
      statoFinale = statoStringToNumber[nuovoStato];
    } else {
      statoFinale = Number(nuovoStato);
    }
    if (isNaN(statoFinale) || statoFinale < 0 || statoFinale > 31) {
      return res.status(400).json({ error: `Stato non valido: '${nuovoStato}'.` });
    }

    // Se è presente un file allegato, caricalo su S3 in NOTE/
    if (req.file) {
      const originalName = req.file.originalname || 'allegato';
      const safeExt = path.extname(originalName) || '';
      const uniqueName = `${crypto.randomUUID()}${safeExt}`;
      const s3Key = `NOTE/${uniqueName}`;
      const uploadResult = await uploadToS3(
        req.file,
        Number(id),
        new Date().getMonth() + 1,
        new Date().getFullYear(),
        s3Key,
        'attivazionistation'
      );
      const url = uploadResult.url;
      // Appendi link all'interno della nota per persistenza senza modifiche DB
      const linkText = `\nAllegato: ${url}`;
      nota = (nota || '') + linkText;
    }

    // Verifica che l'ordine esista
    const prevRes = await new sql.Request()
      .input('id', sql.Int, id)
      .query(`SELECT Stato FROM dbo.tbOrdini WHERE IDOrdine = @id`);
    if (!prevRes.recordset || prevRes.recordset.length === 0) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    
    // CORREZIONE: Aggiorna la nota separatamente se presente
    if (nota) {
      await new sql.Request()
        .input('nota', sql.NVarChar, nota)
        .input('id', sql.Int, id)
        .query(`UPDATE dbo.tbOrdini SET NoteDealer = @nota WHERE IDOrdine = @id`);
    }

    const { masterId, masterEmail, ipAddress, userAgent } = extractMasterContext(req);
    try {
      const logReq = new sql.Request();
      logReq.input('MasterId', sql.Int, masterId || null);
      logReq.input('MasterEmail', sql.NVarChar(255), masterEmail);
      logReq.input('OrdineId', sql.Int, id);
      logReq.input('NuovoStato', sql.Int, statoFinale);
      logReq.input('NotaStorico', sql.NVarChar(sql.MAX), nota || '');
      logReq.input('Motivazione', sql.NVarChar(400), req.body?.motivazione || null);
      logReq.input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify({ action: 'CAMBIO_STATO_MULTIPART', nuovoStato, pulsanteCliccato }) || null);
      logReq.input('IpAddress', sql.VarChar(45), ipAddress);
      logReq.input('UserAgent', sql.NVarChar(600), userAgent);
      const azione = statoFinale === 1 ? 'APPROVE' : (statoFinale === 2 ? 'REJECT' : 'CHANGE_STATUS');
      logReq.input('Azione', sql.VarChar(50), azione);
      await logReq.execute('dbo.sp_master_update_attivazione');
    } catch (logErr) {
      console.warn('[MASTER][ATTIVAZIONI][LOG][MULTIPART] fallita:', logErr?.message || logErr);
    }

    // Riutilizza il codice invio email ecc. chiamando la stessa logica della route JSON
    // Per non duplicare tutto, rispondiamo come la route JSON (senza reinvio email qui).
    // N.B.: l'invio email è opzionale. Se necessario, potremmo estrarre la logica comune.

    console.log('[SUPERMASTER][KPI] DealerAttivi:', dealerAttiviRes.recordset[0]?.totale || 0);
    res.json({
      success: true,
      message: 'Stato aggiornato con successo (multipart)',
      nuovoStato: statoFinale,
      pulsanteCliccato: pulsanteCliccato || null
    });
  } catch (err) {
    console.error('[MASTER][CAMBIO STATO MULTIPART] Errore:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// --- MFA: QR proxy (PNG) ---
// Genera/recupera un'immagine PNG del QR a partire dall'URL otpauth, evitando dipendenze front-end
app.get('/api/mfa/totp/qr', async (req, res) => {
  try {
    const data = String(req.query.otpauth || req.query.data || '').trim();
    if (!data || !data.startsWith('otpauth://')) {
      return res.status(400).send('Parametro otpauth mancante o non valido');
    }
    const providers = [
      (d) => `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(d)}`,
      (d) => `https://quickchart.io/qr?size=220&text=${encodeURIComponent(d)}`
    ];
    for (const makeUrl of providers) {
      try {
        const url = makeUrl(data);
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 6000 });
        if (resp.status === 200 && resp.data) {
          res.setHeader('Content-Type', 'image/png');
          return res.send(Buffer.from(resp.data));
        }
      } catch (_e) {
        // prova provider successivo
      }
    }
    return res.status(502).send('Impossibile generare il QR al momento');
  } catch (err) {
    console.error('[MFA][QR] Errore:', err);
    return res.status(500).send('Errore interno');
  }
});

// --- IMPERSONATE AGENTE ENDPOINT ---
// Consente agli utenti in whitelist MASTER di ottenere un token impersonando un agente specifico
// Body: { email: 'agente@example.com' }
app.post('/api/impersonate-agente', authenticateToken, express.json(), async (req, res) => {
  try {
    const caller = req.user || {};
    const callerEmail = (caller.email || '').toLowerCase();

    if (!callerEmail) {
      return res.status(401).json({ error: 'Token non valido: email mancante' });
    }
    const callerRoles2 = Array.isArray(caller.ruoli) ? caller.ruoli.map(r => String(r).toUpperCase()) : [];
    const isAllowed2 = isMasterEmail(callerEmail) || callerRoles2.includes('SUPERMASTER') || callerRoles2.includes('MASTERPRODOTTI') || callerRoles2.includes('MASTER');
    if (!isAllowed2) {
      return res.status(403).json({ error: 'Accesso negato: solo MASTER/SuperMaster può impersonare AGENTE' });
    }

    const targetAgentId = Number(req.body?.idAgente || req.body?.agenteId);
    const targetEmail = (req.body?.email || '').toLowerCase();
    if (!targetAgentId && !targetEmail) {
      return res.status(400).json({ error: 'Specificare idAgente oppure email dell\'agente target' });
    }

    // Recupera agente dal DB (priorità: idAgente)
    await getPool();
    let agenteRes;
    if (Number.isInteger(targetAgentId) && targetAgentId > 0) {
      agenteRes = await new sql.Request()
        .input('idAgente', sql.Int, targetAgentId)
        .query(`SELECT TOP 1 IdAgente, Nome, RecapitoEmail FROM dbo.tbAgenti WHERE IdAgente = @idAgente AND Attivo = 1`);
    } else {
      agenteRes = await new sql.Request()
        .input('email', sql.NVarChar, targetEmail)
        .query(`SELECT TOP 1 IdAgente, Nome, RecapitoEmail FROM dbo.tbAgenti WHERE RecapitoEmail = @email AND Attivo = 1`);
    }

    if (!agenteRes.recordset?.length) {
      return res.status(404).json({ error: 'Agente non trovato o non attivo', email: targetEmail });
    }
    const agente = agenteRes.recordset[0];

    const ruoli = Array.isArray(caller.ruoli) ? caller.ruoli.slice() : [];
    if (!ruoli.map(r => String(r).toUpperCase()).includes('AGENTE')) ruoli.push('AGENTE');

    const impersonated = {
      ...caller,
      email: agente.RecapitoEmail?.toLowerCase() || targetEmail,
      ruolo: 'AGENTE',
      ruoli,
      // Identificatori coerenti usati in varie parti dell'app
      userId: agente.IdAgente,
      idAgente: agente.IdAgente,
      agenteNome: agente.Nome,
      impersonatedFrom: callerEmail
    };

    const { exp, iat, nbf, ...payload } = impersonated;
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    return res.json({
      token,
      user: impersonated,
      message: 'Impersonazione AGENTE riuscita'
    });
  } catch (err) {
    console.error('[IMPERSONATE AGENTE] Errore:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

// --- STEP-UP AUTH: Verifica TOTP e rilascio JWT elevato (scadenza breve) ---
// Body: { code: '123456' }
// Header: Authorization: Bearer <token base>
app.post('/api/auth/totp/verify', authenticateToken, express.json(), async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Codice TOTP non valido' });
    }

    // 1) Prova con secret per-dealer da DB (se VerifiedAt non è null)
    const user = req.user || {};
    const dealerId = Number(user.dealerId || user.idDealer || user.userId);
    let secretToUse = null;
    if (Number.isInteger(dealerId) && dealerId > 0) {
      try {
        await getPool();
        const rs = await getRequest()
          .input('DealerId', sql.Int, dealerId)
          .query(`SELECT TOP 1 SecretCiphertext, SecretIv, SecretAuthTag, VerifiedAt FROM dbo.DealerMfaTotp WHERE DealerId = @DealerId AND VerifiedAt IS NOT NULL`);
        if (rs.recordset && rs.recordset.length > 0) {
          const row = rs.recordset[0];
          const ciphertext = row.SecretCiphertext;
          const iv = row.SecretIv;
          const authTag = row.SecretAuthTag;
          if (ciphertext && iv && authTag) {
            try {
              const dec = decryptGCM(Buffer.from(ciphertext), Buffer.from(iv), Buffer.from(authTag));
              secretToUse = dec.toString('utf8'); // base32 secret
            } catch (decErr) {
              console.error('[TOTP] Decrypt segreto dealer fallito:', decErr);
            }
          }
        }
      } catch (dbErr) {
        console.warn('[TOTP] Lettura DealerMfaTotp fallita, uso fallback owner:', dbErr);
      }
    }

    // 2) Fallback a secret titolare da .env
    if (!secretToUse) {
      secretToUse = process.env.TOTP_OWNER_SECRET || process.env.TOTP_SECRET || '';
    }
    if (!secretToUse) {
      console.error('[TOTP] Secret assente (dealer e owner).');
      return res.status(500).json({ error: 'Configurazione TOTP mancante' });
    }

    const ok = verifyTOTP(code, secretToUse, { window: 1 });
    if (!ok) {
      return res.status(401).json({ error: 'Codice TOTP errato o scaduto' });
    }

    // Emissione token elevato 15 minuti
    const base = req.user || {};
    const { exp, iat, nbf, ...payload } = base;
    const elevatedPayload = {
      ...payload,
      elevated: true,
      elevatedScope: 'INCENTIVI',
      elevatedAt: Date.now()
    };
    const elevatedToken = jwt.sign(elevatedPayload, process.env.JWT_SECRET, { expiresIn: '15m' });
    return res.json({ token: elevatedToken, expiresIn: 900 });
  } catch (err) {
    console.error('[TOTP] Errore verifica:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
});

// --- MFA: Enrollment segreto TOTP per-dealer ---
// Ritorna: { otpauth, secret } (secret mostrato solo per onboarding, gestire visibilità lato UI)
app.post('/api/mfa/totp/enroll', authenticateToken, async (req, res) => {
  try {
    const user = req.user || {};
    const dealerId = Number(user.dealerId || user.idDealer || user.userId);
    if (!Number.isInteger(dealerId) || dealerId <= 0) {
      return res.status(400).json({ error: 'DealerId mancante' });
    }

    // genera secret base32
    const raw = crypto.randomBytes(20); // 160-bit
    const secretBase32 = bufferToBase32(raw);

    // cifra con AES-GCM
    const { ciphertext, iv, authTag } = encryptGCM(secretBase32);

    await getPool();
    const req = await getRequest();
    await req
      .input('DealerId', sql.Int, dealerId)
      .input('Cipher', sql.VarBinary(sql.MAX), ciphertext)
      .input('Iv', sql.VarBinary(12), iv)
      .input('Tag', sql.VarBinary(16), authTag)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.DealerMfaTotp WHERE DealerId = @DealerId)
          UPDATE dbo.DealerMfaTotp
          SET SecretCiphertext = @Cipher,
              SecretIv = @Iv,
              SecretAuthTag = @Tag,
              VerifiedAt = NULL
          WHERE DealerId = @DealerId;
        ELSE
          INSERT INTO dbo.DealerMfaTotp(DealerId, SecretCiphertext, SecretIv, SecretAuthTag, VerifiedAt)
          VALUES(@DealerId, @Cipher, @Iv, @Tag, NULL);
      `);

    const issuer = encodeURIComponent('KimStation');
    const label = encodeURIComponent(`Dealer:${dealerId}`);
    const otpauth = `otpauth://totp/${issuer}:${label}?secret=${secretBase32}&issuer=${issuer}&period=30&digits=6&algorithm=SHA1`;

    return res.json({ otpauth, secret: secretBase32 });
  } catch (err) {
    console.error('[MFA][ENROLL] Errore:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
});

// --- MFA: Verifica enrollment (conferma codice iniziale) ---
app.post('/api/mfa/totp/verify-enrollment', authenticateToken, express.json(), async (req, res) => {
  try {
    const user = req.user || {};
    const dealerId = Number(user.dealerId || user.idDealer || user.userId);
    const code = String(req.body?.code || '').trim();
    if (!Number.isInteger(dealerId) || dealerId <= 0) return res.status(400).json({ error: 'DealerId mancante' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Codice non valido' });

    await getPool();
    const rs = await (await getRequest())
      .input('DealerId', sql.Int, dealerId)
      .query('SELECT SecretCiphertext, SecretIv, SecretAuthTag FROM dbo.DealerMfaTotp WHERE DealerId = @DealerId');
    if (!rs.recordset || rs.recordset.length === 0) return res.status(404).json({ error: 'Nessun enrollment trovato' });
    const row = rs.recordset[0];
    const dec = decryptGCM(Buffer.from(row.SecretCiphertext), Buffer.from(row.SecretIv), Buffer.from(row.SecretAuthTag));
    const secret = dec.toString('utf8');

    const ok = verifyTOTP(code, secret, { window: 1 });
    if (!ok) return res.status(401).json({ error: 'Codice errato o scaduto' });

    await new sql.Request()
      .input('DealerId', sql.Int, dealerId)
      .query('UPDATE dbo.DealerMfaTotp SET VerifiedAt = SYSDATETIMEOFFSET() WHERE DealerId = @DealerId');

    return res.json({ ok: true });
  } catch (err) {
    console.error('[MFA][VERIFY-ENROLL] Errore:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
});

// --- MFA: Stato ---
app.get('/api/mfa/status', authenticateToken, async (req, res) => {
  try {
    const user = req.user || {};
    const dealerId = Number(user.dealerId || user.idDealer || user.userId);
    if (!Number.isInteger(dealerId) || dealerId <= 0) return res.status(400).json({ error: 'DealerId mancante' });
    await getPool();
    const rs = await (await getRequest())
      .input('DealerId', sql.Int, dealerId)
      .query(`SELECT VerifiedAt FROM dbo.DealerMfaTotp WHERE DealerId = @DealerId;`);
    const enabled = !!(rs.recordset?.[0]?.VerifiedAt);
    const rs2 = await new sql.Request()
      .input('DealerId', sql.Int, dealerId)
      .query(`SELECT COUNT(*) AS Cnt FROM dbo.DealerMfaBackupCodes WHERE DealerId = @DealerId AND UsedAt IS NULL;`);
    const backupAvailable = rs2.recordset?.[0]?.Cnt ?? 0;
    return res.json({ enabled, backupAvailable });
  } catch (err) {
    console.error('[MFA][STATUS] Errore:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
});

// --- MFA: Rigenera backup codes ---
app.post('/api/mfa/backup-codes/regenerate', authenticateToken, async (req, res) => {
  try {
    const user = req.user || {};
    const dealerId = Number(user.dealerId || user.idDealer || user.userId);
    if (!Number.isInteger(dealerId) || dealerId <= 0) return res.status(400).json({ error: 'DealerId mancante' });

    const genCode = () => {
      // 10 chars alfanumerici (gruppati lato UI se serve)
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let s = '';
      for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      return s;
    };

    const pbkdf2Hash = (code) => new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16);
      crypto.pbkdf2(Buffer.from(code, 'utf8'), salt, 100000, 32, 'sha256', (err, dk) => {
        if (err) return reject(err);
        resolve(`pbkdf2$sha256$100000$${salt.toString('base64')}$${dk.toString('base64')}`);
      });
    });

    const codes = Array.from({ length: 10 }, () => genCode());
    const hashes = await Promise.all(codes.map(c => pbkdf2Hash(c)));

    await getPool();
    const delReq = await getRequest();
    await delReq.input('DealerId', sql.Int, dealerId).query('DELETE FROM dbo.DealerMfaBackupCodes WHERE DealerId = @DealerId');

    const table = new sql.Table('DealerMfaBackupCodes');
    table.create = false;
    table.columns.add('DealerId', sql.Int, { nullable: false });
    table.columns.add('CodeHash', sql.NVarChar(255), { nullable: false });
    table.columns.add('UsedAt', sql.DateTimeOffset, { nullable: true });
    table.columns.add('CreatedAt', sql.DateTimeOffset, { nullable: true });
    const now = new Date();
    for (const h of hashes) table.rows.add(dealerId, h, null, now);

    const pool = await getPool();
    await pool.request().bulk(table);

    return res.json({ codes }); // Attenzione: mostrare solo una volta al client!
  } catch (err) {
    console.error('[MFA][BACKUP-REGEN] Errore:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
});

console.log('aspnetIdentityPw export:', aspnetIdentityPw);
console.log('aspnetIdentityPw.validatePassword:', typeof aspnetIdentityPw.validatePassword);

// Verifica chiave Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('[FATAL] STRIPE_SECRET_KEY non definita! Arresto server.');
  process.exit(1);
}

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (secureDebug) {
  console.log('[DEBUG] Stripe Secret Key (masked):', mask(stripeKey));
}
const stripe = new Stripe(stripeKey);

// Helper: normalize a euro amount into integer cents
// Accepts inputs like 33, 33.0, '33', '33.00', '33,00', '1.234,56', '1,234.56'
// Returns integer cents or throws on invalid
function toCents(amount) {
  if (amount == null) throw new Error('Importo mancante');
  // If already a number
  if (typeof amount === 'number') {
    // Heuristic: if seems already cents (large integer without decimals), keep if >= 100 and divisible by 1
    // Prefer euros-by-default: treat numbers as euros and scale by 100
    return Math.round(amount * 100);
  }
  let s = String(amount).trim();
  if (s === '') throw new Error('Importo vuoto');
  // Remove spaces
  s = s.replace(/\s+/g, '');
  // Handle Italian format: thousands '.' and decimal ','
  // Strategy: if there are both '.' and ',', assume '.' are thousands separators, remove them and replace ',' with '.'
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // Only comma present => decimal comma
    s = s.replace(',', '.');
  } else {
    // Only dots: could be decimal point or thousands separator. If more than one dot, strip all but last.
    const first = s.indexOf('.');
    const last = s.lastIndexOf('.');
    if (first !== -1 && first !== last) {
      // remove all dots, keep last as decimal
      const parts = s.split('.');
      const dec = parts.pop();
      s = parts.join('') + '.' + dec;
    }
  }
  const euros = parseFloat(s);
  if (!isFinite(euros)) throw new Error('Importo non numerico');
  return Math.round(euros * 100);
}
let sqlErrorListenerAdded = false;

// Verifica delle variabili d'ambiente richieste
const requiredEnvVars = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`Errore: Le seguenti variabili d'ambiente sono richieste ma mancanti: ${missingVars.join(', ')}`);
  process.exit(1);
}

// NOTA: dbConfig ora importato da db-pool.mjs
// Rimosse definizioni duplicate per evitare conflitti di connessione
// La gestione del pool è ora centralizzata in db-pool.mjs

// --- MAINTENANCE MODE MIDDLEWARE ---
// Middleware per gestire il maintenance mode
app.use((req, res, next) => {
  // Skip per webhook Stripe, endpoint di master login e controllo maintenance status
  // Nota: il webhook corretto è '/api/stripe/webhook'. Manteniamo anche '/webhook/stripe' per retrocompatibilità.
  if (req.path === '/api/stripe/webhook' || req.path === '/webhook/stripe' || req.path === '/api/master-login' || req.path === '/api/maintenance-status') {
    return next();
  }
  
  // Se MAINTENANCE_MODE è attivo, blocca tutte le altre richieste
  if (process.env.MAINTENANCE_MODE === 'true') {
    // Permetti solo richieste autenticate con ruolo MASTER
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Verifica se l'utente è autenticato con token master (qualsiasi ruolo master)
        const ruoli = decoded.ruoli 
          ? decoded.ruoli.map(r => r.toUpperCase()) 
          : decoded.ruolo 
            ? [decoded.ruolo.toUpperCase()] 
            : [];
        
        // Permetti accesso per tutti i ruoli master o email in whitelist o flag isMaster
        if (ruoli.includes('MASTER') || ruoli.includes('DEALER') || ruoli.includes('MASTERPRODOTTI') || 
            isMasterEmail(decoded.email) || decoded.isMaster === true) {
          req.user = decoded;
          return next();
        }
      } catch (err) {
        // Token non valido, continua con il blocco
      }
    }
    
    return res.status(503).json({ 
      error: 'Sistema in manutenzione', 
      maintenanceMode: true,
      message: 'Il sistema è temporaneamente in manutenzione. Accesso consentito solo con credenziali master.' 
    });
  }
  
  next();
});

// --- WEBHOOK STRIPE - DEVE ESSERE LA PRIMA ROUTE! ---
// Webhook Stripe con raw body parsing per verifica signature
app.post('/api/stripe/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const rb = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : (typeof req.body === 'string' ? req.body : '[non-buffer]');
    console.log('[STRIPE WEBHOOK] Ricevuta richiesta:', { headers: req.headers, rawBody: rb ? rb.slice(0, 2000) : '[vuoto]' });
  } catch { console.log('[STRIPE WEBHOOK] Ricevuta richiesta (no raw body log)'); }
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, stripeWebhookSecret);
    console.log('[STRIPE WEBHOOK] Evento verificato:', event.type);
    try {
      // Gestione eventi principali
      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object;
        // dealerId SOLO dal metadata.dealerId (userId può essere GUID)
        const dealerId = Number(pi.metadata.dealerId || 0);
        // --- Validazione dealerId (deve essere un intero positivo) ---
        if (!Number.isInteger(dealerId) || dealerId <= 0) {
          console.error('[STRIPE WEBHOOK] dealerId non valido nel metadata Stripe:', pi.metadata);
          return res.status(400).json({ error: 'dealerId non valido o mancante nel metadata Stripe', metadata: pi.metadata });
        }
        // --- Fine validazione dealerId ---
        const amount = pi.amount / 100;
        const payload = JSON.stringify(pi);
        let emailCliente = pi.metadata.emailCliente || '';
        let orderType = pi.metadata.orderType || '';
        
        // Determina automaticamente orderType se non specificato
        if (!orderType) {
          if (pi.metadata.carrello) {
            orderType = 'ORD'; // Ordine prodotti
          } else if (pi.metadata.ricarica || pi.metadata.plafond) {
            orderType = 'RIC'; // Ricarica plafond
          } else if (pi.metadata.orderToken) {
            // Se abbiamo un orderToken, trattiamo come ordine prodotti (carrello recuperabile da tbOrdiniTemp)
            orderType = 'ORD';
          }
        }
        
        console.log('[DEBUG][STRIPE] orderType:', orderType, 'metadata:', pi.metadata, 'emailCliente:', emailCliente);
        if (!orderType) {
          console.warn('[DEBUG][STRIPE] orderType VUOTO! Metadata Stripe:', pi.metadata);
        }
        console.log('[DEBUG][STRIPE] emailCliente:', emailCliente);
        let carrello = [];
        let speseSpedizione = 0;
        let totaleOrdine = amount; // verrà ricalcolato sottraendo le spese
        let noteOrdine = '';
        // Determina lo stato in base al metodo di pagamento (card -> 20, sepa/bonifico -> 21)
        let idStatoOrdineProdotto = 20; // default: Pagato con Carta di Credito
        try {
          const metodoMeta = (pi?.metadata?.metodo || '').toLowerCase();
          const pmTypes = Array.isArray(pi?.payment_method_types) ? pi.payment_method_types : [];
          const chargePmType = pi?.charges?.data?.[0]?.payment_method_details?.type || '';
          const isSepa = pmTypes.includes('sepa_debit') || chargePmType === 'sepa_debit' || metodoMeta.includes('sepa') || metodoMeta.includes('bonifico');
          if (isSepa) idStatoOrdineProdotto = 21; // Bonifico SEPA
        } catch (_) {}

        // Parsing del carrello dal metadata (solo se non RIC)
        if (pi.metadata.carrello && (orderType || '').toString().toUpperCase() !== 'RIC') {
          try {
            carrello = JSON.parse(pi.metadata.carrello);
            console.log('[DEBUG][STRIPE] Carrello parsato:', carrello.length, 'prodotti');
          } catch (e) {
            console.error('[DEBUG][STRIPE] Errore parsing carrello:', e);
          }
        }

        // Se RICARICA PLAFOND: opzionalmente crea una riga prodotto sintetica usando RICARICA_OFFERTA_ID
        if ((orderType || '').toString().toUpperCase() === 'RIC') {
          try {
            const offId = Number(process.env.RICARICA_OFFERTA_ID || 0);
            if (Number.isInteger(offId) && offId > 0) {
              const prezzoCents = Math.round((amount || 0) * 100);
              carrello = [{ id: offId, quantita: 1, prezzo: prezzoCents }];
              console.log('[DEBUG][STRIPE] RIC: riga sintetica aggiunta con offerta', offId, 'prezzoCents', prezzoCents);
            } else {
              console.log('[DEBUG][STRIPE] RIC: nessun RICARICA_OFFERTA_ID configurato, nessun dettaglio prodotto creato');
            }
            // Nota ordine esplicita
            const noteRIC = `RICARICA PLAFOND: EUR ${amount.toFixed(2)}`;
            noteOrdine = noteOrdine ? `${noteOrdine} | ${noteRIC}` : noteRIC;
          } catch (ricSetupErr) {
            console.warn('[STRIPE][WEBHOOK] RIC setup dettaglio sintetico fallito:', ricSetupErr?.message || ricSetupErr);
          }
        }

        // Calcolo spese spedizione in EURO (mantieni 2 decimali)
        // LOGICA CORRETTA: Le spese vengono gestite dal frontend e inviate nei metadata
        // Il backend deve solo applicarle come ricevute (no duplicazioni, no controlli complessi)
        if (pi.metadata.speseSpedizione) {
          speseSpedizione = Number(((parseFloat(pi.metadata.speseSpedizione) || 0)).toFixed(2));
          console.log(`[STRIPE WEBHOOK] Spese spedizione applicate: €${speseSpedizione}`);
        } else {
          speseSpedizione = 0;
          console.log(`[STRIPE WEBHOOK] Nessuna spesa di spedizione`);
        }
        
        totaleOrdine = Number((amount - speseSpedizione).toFixed(2));

        if (pi.metadata.noteOrdine) {
          noteOrdine = pi.metadata.noteOrdine;
        }

        // Inserimento ordine nel database
        try {
          const dbName = getDbName();
          console.log('[DEBUG] DB_NAME from env:', process.env.DB_NAME, 'Using:', dbName);
          const pool = await getPool();

          // Acquire application lock per PaymentIntent to prevent races
          try {
            const lockRes = await pool.request()
              .input('Res', sql.NVarChar(100), `PI:${pi.id}`)
              .query(`DECLARE @r INT; EXEC @r = sp_getapplock @Resource=@Res, @LockMode='Exclusive', @LockOwner='Session', @LockTimeout=10000; SELECT Result=@r;`);
            const lockResult = (lockRes.recordset && lockRes.recordset[0] && lockRes.recordset[0].Result) || -1;
            if (lockResult < 0) {
              console.warn('[STRIPE WEBHOOK] (payment_intent.succeeded) Lock non acquisito per PI:', pi.id, 'lockResult=', lockResult, '— proseguo con dupCheck/insert idempotente senza lock');
              // Non ritorniamo: procediamo comunque con dupCheck/insert. L'indice unico su PaymentIntentId_UQ proteggerà da race una volta presente.
            }
          } catch (lockErr) {
            console.warn('[STRIPE WEBHOOK] (payment_intent.succeeded) Errore acquisizione lock, procedo con dupCheck soltanto:', lockErr);
          }

          // Idempotency: skip if an order for this PaymentIntent already exists
          const dupCheck = await pool.request()
            .input('PiId', sql.NVarChar(64), pi.id)
            .query(`SELECT TOP 1 IDOrdineProdotto FROM [${dbName}].dbo.tbOrdiniProdotti WHERE PaymentIntentId_UQ = @PiId`);
          if (dupCheck.recordset.length > 0) {
            console.warn('[STRIPE WEBHOOK] (payment_intent.succeeded) Ordine già presente per PI:', pi.id, 'IDOrdineProdotto=', dupCheck.recordset[0].IDOrdineProdotto);
            // Release application lock before returning to avoid leaving it held on pooled connection
            try {
              await pool.request()
                .input('Res', sql.NVarChar(100), `PI:${pi.id}`)
                .query(`EXEC sp_releaseapplock @Resource=@Res, @LockOwner='Session'`);
            } catch (unlockErr) {
              console.warn('[STRIPE WEBHOOK] (payment_intent.succeeded) Errore rilascio lock (dup path):', unlockErr);
            }
            return res.status(200).json({ received: true, duplicate: true, orderId: dupCheck.recordset[0].IDOrdineProdotto });
          }

          const ordineRequest = pool.request();

          // Ricava descrizione stato spedizione per id=31, fallback a 'Non Spedito'
          let statoSpedizioneDesc = 'Non Spedito';
          try {
            const rsSped = await pool.request().query(`SELECT TOP 1 StatoSpedizione FROM [${dbName}].dbo.tbStatiSpedizioneOrdiniProdotti WHERE ID = 31`);
            if (rsSped.recordset.length > 0 && rsSped.recordset[0].StatoSpedizione) {
              statoSpedizioneDesc = String(rsSped.recordset[0].StatoSpedizione);
            }
          } catch (e) {
            console.warn('[ORDINI] Lookup tbStatiSpedizioneOrdiniProdotti fallito, uso fallback \'Non Spedito\'');
          }

          // Costruisci il Payload come array di righe carrello con {idOfferta, prezzo(centesimi), quantita}
          let payloadItems = [];
          if (Array.isArray(carrello) && carrello.length > 0) {
            for (const prodotto of carrello) {
              try {
                const idOff = Number(prodotto.id);
                if (!idOff) continue;
                const rs = await pool.request()
                  .input('IDOfferta', sql.Int, idOff)
                  .query(`SELECT TOP 1 ISNULL(Crediti,0) AS Crediti, ISNULL(SIMTYPE,'') AS SIMTYPE FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta = @IDOfferta`);
                const crediti = rs.recordset.length ? Number(rs.recordset[0].Crediti || 0) : 0; // centesimi
                const quantita = Number(prodotto.quantita || 1);
                payloadItems.push({ idOfferta: idOff, prezzo: crediti, quantita });
              } catch (e) {
                console.warn('[STRIPE][WEBHOOK] Impossibile costruire payload per offerta', prodotto?.id, e?.message || e);
              }
            }
          }
          const payload = JSON.stringify(payloadItems);
          
          const now = new Date();
          const result = await ordineRequest
            .input('idDealer', sql.Int, dealerId)
            .input('DataOra', sql.DateTime, now)
            .input('OrdineDA', sql.VarChar, emailCliente)
            .input('SpeseSpedizione', sql.Decimal(10, 2), speseSpedizione)
            .input('TotaleOrdine', sql.Decimal(10, 2), totaleOrdine)
            .input('Payload', sql.Text, payload)
            .input('PiIdUQ', sql.NVarChar(64), pi.id)
            .input('idStatoOrdineProdotto', sql.Int, idStatoOrdineProdotto)
            .input('NoteOrdine', sql.Text, noteOrdine)
            .input('OrdineDaAgente', sql.Bit, 0)
            .input('DataStato', sql.DateTime, now)
            .input('Note4Dealer', sql.Text, '')
            .input('NoteInterne', sql.Text, '')
            .input('StatoSpedizione', sql.NVarChar, statoSpedizioneDesc)
            .input('IdStatoSpedizione', sql.Int, 31)
            .query(`
              INSERT INTO [${dbName}].dbo.tbOrdiniProdotti 
              (idDealer, DataOra, OrdineDA, SpeseSpedizione, TotaleOrdine, Payload, PaymentIntentId_UQ, idStatoOrdineProdotto, NoteOrdine, OrdineDaAgente, DataStato, stato_spedizione, Note4Dealer, NoteInterne, idStatoSpedizione)
              OUTPUT INSERTED.IDOrdineProdotto
              VALUES (@idDealer, @DataOra, @OrdineDA, @SpeseSpedizione, @TotaleOrdine, @Payload, @PiIdUQ, @idStatoOrdineProdotto, @NoteOrdine, @OrdineDaAgente, @DataStato, @StatoSpedizione, @Note4Dealer, @NoteInterne, @IdStatoSpedizione)
            `);
          
          const idOrdineProdotto = result.recordset[0].IDOrdineProdotto;
          
          // Se il carrello è vuoto ma abbiamo un orderToken, prova a recuperarlo da tbOrdiniTemp
          try {
            if ((!carrello || carrello.length === 0) && pi && pi.metadata && pi.metadata.orderToken) {
              console.log('[DEBUG][STRIPE] (payment_intent.succeeded) Carrello vuoto, tento recupero da tbOrdiniTemp con orderToken:', pi.metadata.orderToken);
              const tempRes = await pool.request()
                .input('OrderToken', sql.NVarChar(64), pi.metadata.orderToken)
                .query(`SELECT TOP 1 Carrello FROM [${dbName}].dbo.tbOrdiniTemp WHERE OrderToken = @OrderToken`);
              if (tempRes.recordset.length > 0 && tempRes.recordset[0].Carrello) {
                try {
                  carrello = JSON.parse(tempRes.recordset[0].Carrello);
                  console.log('[DEBUG][STRIPE] (payment_intent.succeeded) Carrello recuperato da tbOrdiniTemp:', Array.isArray(carrello) ? carrello.length : 0, 'prodotti');
                } catch (e) {
                  console.error('[DEBUG][STRIPE] (payment_intent.succeeded) Errore parse carrello da tbOrdiniTemp:', e);
                }
              } else {
                console.warn('[DEBUG][STRIPE] (payment_intent.succeeded) Nessun record trovato in tbOrdiniTemp per orderToken:', pi.metadata.orderToken);
              }
            }
          } catch (recErr) {
            console.error('[DEBUG][STRIPE] (payment_intent.succeeded) Errore recupero carrello da tbOrdiniTemp:', recErr);
          }

          // Inserimento dettagli prodotti
          let contains446_bon = false;
          if (carrello && carrello.length > 0) {
            for (const prodotto of carrello) {
              try {
                // Recupera il prezzo dalla tabella tbOfferte se non presente nel carrello
                let prezzoUnitarioCents = prodotto.prezzo || 0; // centesimi
                if (!prezzoUnitarioCents || prezzoUnitarioCents === 0) {
                  const prezzoQuery = await pool.request()
                    .input('IDOfferta', sql.Int, prodotto.id)
                    .query(`SELECT Crediti, ISNULL(SIMTYPE,'') AS SIMTYPE FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta = @IDOfferta`);
                  if (prezzoQuery.recordset.length > 0) {
                    prezzoUnitarioCents = prezzoQuery.recordset[0].Crediti || 0; // centesimi
                  }
                }
                // Regole speciali per offerta 446: codice obbligatorio e sconto fisso 3%
                if (Number(prodotto.id) === 446) {
                  contains446 = true;
                  const code = (prodotto.customCode || '').toString().trim();
                  const valid = /^cim-flora-kim-d\d{1,3}$/.test(code);
                  if (!valid) {
                    console.error('[ORDINI] Offerta 446: codice mancante/invalid:', code);
                    // Appendi nota sull'ordine e salta la riga
                    try {
                      await pool.request()
                        .input('note', sql.NVarChar, 'OFFERTA 446: codice mancante/invalid')
                        .input('id', sql.Int, idOrdineProdotto)
                        .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET NoteOrdine = COALESCE(NoteOrdine, '') + CASE WHEN COALESCE(NoteOrdine,'')='' THEN '' ELSE ' | ' END + @note WHERE IDOrdineProdotto = @id`);
                    } catch (noteErr) {
                      console.warn('[ORDINI] Impossibile scrivere nota ordine per codice mancante/invalid:', noteErr);
                    }
                    continue; // non inserire la riga senza codice valido
                  }
                  // Applica sconto 3% sul prezzo unitario (centesimi)
                  prezzoUnitarioCents = Math.round(Number(prezzoUnitarioCents) * 0.97);
                }
                const prezzoUnitarioEuro = Number(((prezzoUnitarioCents || 0) / 100).toFixed(2));
                if (Number(prodotto.id) === 446) contains446_bon = true;
                const dettaglioRequest = pool.request();
                await dettaglioRequest
                  .input('IDOrdineProdotto', sql.Int, idOrdineProdotto)
                  .input('IDOfferta', sql.Int, prodotto.id)
                  .input('Quantita', sql.Int, prodotto.quantita || 1)
                  .input('CostoUnitario', sql.Decimal(10, 2), prezzoUnitarioEuro)
                  .query(`
                    INSERT INTO [${dbName}].dbo.tbDettagliOrdiniProdotti 
                    (IDOrdineProdotto, IDOfferta, Quantita, CostoUnitario, SIMTYPE, SIMCOUNT)
                    VALUES (@IDOrdineProdotto, @IDOfferta, @Quantita, @CostoUnitario, 
                    COALESCE(
                      (SELECT TOP 1 ISNULL(SIMTYPE,'') FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta=@IDOfferta),
                      (SELECT TOP 1 'TELEFONO' FROM [${dbName}].dbo.tbTelefoni WHERE IDTelefono=@IDOfferta),
                      ''
                    ), 0)
                  `);
                // Se offerta 446 con codice valido, salva il codice nelle NOTE dell'ordine
                try {
                  if (Number(prodotto.id) === 446 && prodotto.customCode) {
                    await pool.request()
                      .input('note', sql.NVarChar, `OFFERTA 446 CODE: ${prodotto.customCode}`)
                      .input('id', sql.Int, idOrdineProdotto)
                      .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET NoteOrdine = COALESCE(NoteOrdine, '') + CASE WHEN COALESCE(NoteOrdine,'')='' THEN '' ELSE ' | ' END + @note WHERE IDOrdineProdotto = @id`);
                  }
                } catch (noteOkErr) {
                  console.warn('[ORDINI] Impossibile scrivere nota ordine con codice offerta 446:', noteOkErr);
                }
                console.log(`[DEBUG][STRIPE] Dettaglio inserito: ${prodotto.nome || prodotto.id} - Prezzo(EUR): ${prezzoUnitarioEuro}`);
              } catch (err) {
                console.error('[ERRORE DETTAGLIO ORDINE]', err);
              }
            }
          } else {
            console.warn('[WARN] Carrello vuoto o non valido, nessun dettaglio inserito.');
          }
          // Se tra i dettagli è presente l'offerta 446, imposta stato spedizione iniziale a 25 (DA RICARICARE)
          if (contains446_bon) {
            try {
              await ordineRequest
                .input('id', sql.Int, idOrdineProdotto)
                .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET idStatoSpedizione = 25, stato_spedizione = 'DA RICARICARE', DataStato = GETDATE() WHERE IDOrdineProdotto = @id`);
            } catch (e) {
              try {
                await ordineRequest
                  .input('id', sql.Int, idOrdineProdotto)
                  .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET stato_spedizione = 'DA RICARICARE', DataStato = GETDATE() WHERE IDOrdineProdotto = @id`);
              } catch (e2) {
                console.warn('[ORDINI][446][bonifico] Update stato_spedizione iniziale fallito:', e2?.message || e2);
              }
            }
          }
          console.log(`[STRIPE WEBHOOK] Ordine inserito: IDOrdineProdotto=${idOrdineProdotto}, Dealer=${dealerId}, Totale(EUR)=${totaleOrdine}, Spedizione(EUR)=${speseSpedizione}`);
          
          // Invia email di conferma ordine prodotto
          try {
            const eventType = pi.status === 'succeeded' ? 'ORDINE_PRODOTTO_PAGATO' : 'IN_ATTESA_PAGAMENTO';
            await emailService.sendProductOrderEmail(eventType, idOrdineProdotto, {
              paymentStatus: pi.status,
              paymentMethod: 'stripe',
              emailCliente: emailCliente
            });
            console.log(`[EMAIL] Email ordine prodotto inviata: ${eventType} per ordine ${idOrdineProdotto}`);
          } catch (emailError) {
            console.error('[EMAIL] Errore invio email ordine prodotto:', emailError);
          }

          // Cleanup tbOrdiniTemp dopo successo
          try {
            if (pi && pi.metadata && pi.metadata.orderToken) {
              await pool.request()
                .input('OrderToken', sql.NVarChar(64), pi.metadata.orderToken)
                .query(`DELETE FROM [${dbName}].dbo.tbOrdiniTemp WHERE OrderToken = @OrderToken`);
              console.log('[DEBUG][STRIPE] (payment_intent.succeeded) tbOrdiniTemp ripulita per orderToken:', pi.metadata.orderToken);
            }
          } catch (cleanupErr) {
            console.warn('[DEBUG][STRIPE] (payment_intent.succeeded) Cleanup tbOrdiniTemp fallito:', cleanupErr);
          }

          // Release application lock
          try {
            await pool.request()
              .input('Res', sql.NVarChar(100), `PI:${pi.id}`)
              .query(`EXEC sp_releaseapplock @Resource=@Res, @LockOwner='Session'`);
          } catch (unlockErr) {
            console.warn('[STRIPE WEBHOOK] (payment_intent.succeeded) Errore rilascio lock:', unlockErr);
          }
        } catch (dbErr) {
          console.error('[STRIPE WEBHOOK] Errore inserimento ordine:', dbErr);
        }

        // Se è una ricarica plafond, accredita tramite helper (colonna Crediti) con idempotenza su Riferimento/Payload
        try {
          if (orderType === 'RIC') {
            const descr = `RICARICA PLAFOND RIC (PI:${pi?.id || ''})`;
            await creditDealer({
              dealerId,
              amountEuro: amount,
              descrizione: descr,
              riferimento: pi?.id,
              payloadObj: { type: event.type, id: pi?.id, metadata: pi?.metadata }
            });
            // Invia email per ricarica completata
            try {
              await emailService.sendRechargeCompletedEmail(dealerId, amount, {
                transactionId: `PI:${pi?.id || ''}`,
                emailCliente
              });
              console.log(`[EMAIL] Email ricarica completata inviata (PI:${pi?.id || ''})`);
            } catch (emailError) {
              console.error('[EMAIL] Errore invio email ricarica:', emailError);
            }
          }
        } catch (transazioneErr) {
          console.error('[STRIPE WEBHOOK] Errore accredito ricarica (helper):', transazioneErr);
        }
      }
      else if (event.type === 'charge.succeeded') {
        // Alcuni flussi inviano solo charge.succeeded in Live.
        // Recupera il PaymentIntent per ottenere metadata e carrello.
        const charge = event.data.object;
        const paymentIntentId = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : (charge.payment_intent && charge.payment_intent.id);
        if (!paymentIntentId) {
          console.error('[STRIPE WEBHOOK] charge.succeeded senza payment_intent id');
          return res.status(400).json({ error: 'Charge senza payment_intent collegato' });
        }
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        console.log('[STRIPE WEBHOOK] charge.succeeded -> PI recuperato:', pi.id);
        // Estrai dealerId subito, così è disponibile in tutti i rami
        const dealerId = Number(pi.metadata.dealerId || pi.metadata.userId || 0);
        // Se l'orderType è PROD, processa come fallback (alcuni ambienti inviano solo charge.succeeded)
        // Altri tipi (RIC) non vengono inseriti come ordini prodotti
        const orderType = (pi.metadata.orderType || '').toString().toUpperCase();
        if (orderType !== 'PROD') {
          console.log('[STRIPE WEBHOOK] charge.succeeded non-PROD: process RIC credit (orderType=', orderType, ')');
          const importo = (pi.amount / 100);
          const descr = `Ricarica plafond (CH:${charge.id || ''})`;
          const payloadJson = JSON.stringify({ type: event.type, id: charge.id, metadata: pi.metadata });
          try {
            const dbName = getDbName();
            const poolRic = await getPool();
            // Dup-check per idempotenza
            const dup = await poolRic.request()
              .input('rif', sql.NVarChar(128), String(charge.id || ''))
              .query(`SELECT TOP 1 IDTransazione FROM [${dbName}].dbo.tbTransazioni 
                      WHERE (CAST(Riferimento AS NVARCHAR(128)) = @rif)
                         OR (Descrizione LIKE '%' + @rif + '%')`);
            if (dup.recordset.length > 0) {
              console.warn('[STRIPE WEBHOOK] (charge.succeeded) Ricarica già presente per CH:', charge.id, 'IDTransazione=', dup.recordset[0].IDTransazione);
              return res.status(200).json({ received: true, duplicate: true, type: 'RIC_CHARGE' });
            }
            // Primo tentativo: schema con Crediti/DataOra/Fonte/Payload/Riferimento/Descrizione
            try {
              const ins = await poolRic.request()
                .input('idDealer', sql.Int, dealerId)
                .input('Crediti', sql.Decimal(10,2), importo)
                .input('Fonte', sql.NVarChar(32), 'STRIPE')
                .input('Descrizione', sql.NVarChar(255), descr)
                .input('Payload', sql.NVarChar(sql.MAX), payloadJson)
                .input('rif', sql.NVarChar(128), String(charge.id || ''))
                .query(`INSERT INTO [${dbName}].dbo.tbTransazioni (idDealer, Crediti, Fonte, Descrizione, DataOra, Payload, Riferimento)
                        OUTPUT INSERTED.IDTransazione
                        VALUES (@idDealer, @Crediti, @Fonte, @Descrizione, GETDATE(), @Payload, TRY_CONVERT(INT, @rif))`);
              const idT = ins.recordset[0].IDTransazione;
              console.log(`[STRIPE WEBHOOK] (charge.succeeded) Ricarica plafond inserita (schema Crediti): IDTransazione=${idT}, Dealer=${dealerId}, Importo(EUR)=${importo}`);
            } catch (schemaErr) {
              console.warn('[STRIPE WEBHOOK] (charge.succeeded) Schema Crediti non disponibile, fallback creditDealer:', schemaErr?.message || schemaErr);
              await creditDealer({
                dealerId,
                amountEuro: importo,
                descrizione: descr,
                riferimento: charge.id,
                payloadObj: { type: event.type, id: charge.id, metadata: pi.metadata }
              });
            }
          } catch (ricErr) {
            console.error('[STRIPE WEBHOOK] (charge.succeeded) Errore inserimento ricarica:', ricErr);
          }
          return res.status(200).json({ received: true, type: 'RIC_CHARGE_CREDITED' });
        }
        // --- Validazione dealerId (deve essere un intero positivo) ---
        if (!Number.isInteger(dealerId) || dealerId <= 0) {
          console.error('[STRIPE WEBHOOK] dealerId non valido nel metadata Stripe (da PI):', pi.metadata);
          return res.status(400).json({ error: 'dealerId non valido o mancante nel metadata Stripe', metadata: pi.metadata });
        }
        // --- Fine validazione dealerId ---
        const amount = pi.amount / 100;
        let emailCliente = pi.metadata.emailCliente || '';
        let metodo = orderType;
        
        // Determina automaticamente orderType se non specificato
        if (!orderType) {
          if (pi.metadata.carrello) {
            orderType = 'ORD'; // Ordine prodotti
          } else if (pi.metadata.ricarica || pi.metadata.plafond) {
            orderType = 'RIC'; // Ricarica plafond
          }
        }
        
        console.log('[DEBUG][STRIPE] (charge.succeeded) orderType:', orderType, 'metadata:', pi.metadata, 'emailCliente:', emailCliente);
        if (!orderType) {
          console.warn('[DEBUG][STRIPE] orderType VUOTO! Metadata Stripe (da PI):', pi.metadata);
        }
        console.log('[DEBUG][STRIPE] emailCliente:', emailCliente);
        let carrello = [];
        let speseSpedizione = 0;
        let totaleOrdine = amount; // verrà ricalcolato
        let noteOrdine = '';
        let idStatoOrdineProdotto = 20; // Pagato con Carta di Credito

        // Parsing del carrello dal metadata
        if (pi.metadata.carrello) {
          try {
            carrello = JSON.parse(pi.metadata.carrello);
            console.log('[DEBUG][STRIPE] (charge.succeeded) Carrello parsato:', carrello.length, 'prodotti');
          } catch (e) {
            console.error('[DEBUG][STRIPE] Errore parsing carrello (charge.succeeded):', e);
          }
        }

        // Calcolo spese spedizione in EURO (mantieni 2 decimali)
        if (pi.metadata.speseSpedizione) {
          speseSpedizione = Number(((parseFloat(pi.metadata.speseSpedizione) || 0)).toFixed(2));
        }

        if (pi.metadata.noteOrdine) {
          noteOrdine = pi.metadata.noteOrdine;
        }

        // Inserimento ordine nel database
        try {
          const dbName = getDbName();
          console.log('[DEBUG] DB_NAME from env:', process.env.DB_NAME, 'Using:', dbName);
          const pool = await getPool();
          const ordineRequest = pool.request();
          // Lookup descrizione stato spedizione (ID=31); fallback 'Non Spedito' se non trovato
          let statoSpedizioneDesc = 'Non Spedito';
          try {
            const rsSped = await pool.request()
              .query(`SELECT TOP 1 StatoSpedizione FROM [${dbName}].dbo.tbStatiSpedizioneOrdiniProdotti WHERE ID = 31`);
            if (rsSped.recordset.length > 0 && rsSped.recordset[0].StatoSpedizione) {
              statoSpedizioneDesc = String(rsSped.recordset[0].StatoSpedizione);
            }
          } catch (e) {
            console.warn('[ORDINI] (charge.succeeded) Lookup stato spedizione fallito, uso fallback \'Non Spedito\'');
          }

          // Idempotency: se esiste già un ordine per questo PaymentIntent, esci
          const dupCheck = await ordineRequest
            .input('PiId', sql.NVarChar(64), pi.id)
            .query(`SELECT TOP 1 IDOrdineProdotto FROM [${dbName}].dbo.tbOrdiniProdotti WHERE PaymentIntentId_UQ = @PiId`);
          if (dupCheck.recordset.length > 0) {
            console.warn('[STRIPE WEBHOOK] (charge.succeeded) Ordine già presente per PI:', pi.id, 'IDOrdineProdotto=', dupCheck.recordset[0].IDOrdineProdotto);
            return res.status(200).json({ received: true, duplicate: true, orderId: dupCheck.recordset[0].IDOrdineProdotto });
          }

          // Costruisci payload [{idOfferta, prezzo(centesimi), quantita}]
          let payloadItems = [];
          if (Array.isArray(carrello) && carrello.length > 0) {
            for (const prodotto of carrello) {
              try {
                const idOff = Number(prodotto.id);
                if (!idOff) continue;
                const rs = await pool.request()
                  .input('IDOfferta', sql.Int, idOff)
                  .query(`SELECT TOP 1 ISNULL(Crediti,0) AS Crediti FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta = @IDOfferta`);
                const crediti = rs.recordset.length ? Number(rs.recordset[0].Crediti || 0) : 0; // centesimi
                const quantita = Number(prodotto.quantita || 1);
                payloadItems.push({ idOfferta: idOff, prezzo: crediti, quantita });
              } catch (e) {
                console.warn('[STRIPE][WEBHOOK] (charge.succeeded) Impossibile costruire payload per offerta', prodotto?.id, e?.message || e);
              }
            }
          }
          const payload = JSON.stringify(payloadItems);
          
          const now = new Date();
          const result = await ordineRequest
            .input('idDealer', sql.Int, dealerId)
            .input('DataOra', sql.DateTime, now)
            .input('OrdineDA', sql.VarChar, emailCliente)
            .input('SpeseSpedizione', sql.Decimal(10, 2), speseSpedizione)
            .input('TotaleOrdine', sql.Decimal(10, 2), totaleOrdine)
            .input('Payload', sql.Text, payload)
            .input('PiIdUQ', sql.NVarChar(64), pi.id)
            .input('idStatoOrdineProdotto', sql.Int, idStatoOrdineProdotto)
            .input('NoteOrdine', sql.Text, noteOrdine)
            .input('OrdineDaAgente', sql.Bit, 0)
            .input('DataStato', sql.DateTime, now)
            .input('Note4Dealer', sql.Text, '')
            .input('NoteInterne', sql.Text, '')
            .input('StatoSpedizione', sql.NVarChar, statoSpedizioneDesc)
            .input('IdStatoSpedizione', sql.Int, 31)
            .query(`
              INSERT INTO [${dbName}].dbo.tbOrdiniProdotti 
              (idDealer, DataOra, OrdineDA, SpeseSpedizione, TotaleOrdine, Payload, PaymentIntentId_UQ, idStatoOrdineProdotto, NoteOrdine, OrdineDaAgente, DataStato, stato_spedizione, Note4Dealer, NoteInterne, idStatoSpedizione)
              OUTPUT INSERTED.IDOrdineProdotto
              VALUES (@idDealer, @DataOra, @OrdineDA, @SpeseSpedizione, @TotaleOrdine, @Payload, @PiIdUQ, @idStatoOrdineProdotto, @NoteOrdine, @OrdineDaAgente, @DataStato, @StatoSpedizione, @Note4Dealer, @NoteInterne, @IdStatoSpedizione)
            `);
          
          const idOrdineProdotto = result.recordset[0].IDOrdineProdotto;
          
          // Inserimento dettagli prodotti
          let contains446 = false;
          if (carrello && carrello.length > 0) {
            for (const prodotto of carrello) {
              try {
                // Recupera il prezzo dalla tabella tbOfferte se non presente nel carrello
                let prezzoUnitarioCents = prodotto.prezzo || 0; // centesimi
                if (!prezzoUnitarioCents || prezzoUnitarioCents === 0) {
                  const prezzoQuery = await pool.request()
                    .input('IDOfferta', sql.Int, prodotto.id)
                    .query(`SELECT Crediti FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta = @IDOfferta`);
                  if (prezzoQuery.recordset.length > 0) {
                    prezzoUnitarioCents = prezzoQuery.recordset[0].Crediti || 0; // centesimi
                  }
                }
                if (Number(prodotto.id) === 446) {
                  contains446 = true;
                }
                const prezzoUnitarioEuro = Number(((prezzoUnitarioCents || 0) / 100).toFixed(2));
                const dettaglioRequest = pool.request();
                await dettaglioRequest
                  .input('IDOrdineProdotto', sql.Int, idOrdineProdotto)
                  .input('IDOfferta', sql.Int, prodotto.id)
                  .input('Quantita', sql.Int, prodotto.quantita || 1)
                  .input('CostoUnitario', sql.Decimal(10, 2), prezzoUnitarioEuro)
                  .query(`
                    INSERT INTO [${dbName}].dbo.tbDettagliOrdiniProdotti 
                    (IDOrdineProdotto, IDOfferta, Quantita, CostoUnitario, SIMTYPE, SIMCOUNT)
                    VALUES (@IDOrdineProdotto, @IDOfferta, @Quantita, @CostoUnitario, 
                    COALESCE(
                      (SELECT TOP 1 ISNULL(SIMTYPE,'') FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta=@IDOfferta),
                      (SELECT TOP 1 'TELEFONO' FROM [${dbName}].dbo.tbTelefoni WHERE IDTelefono=@IDOfferta),
                      ''
                    ), 0)
                  `);
                console.log(`[DEBUG][STRIPE] (charge.succeeded) Dettaglio inserito: ${prodotto.nome || prodotto.id} - Prezzo(EUR): ${prezzoUnitarioEuro}`);
              } catch (err) {
                console.error('[ERRORE DETTAGLIO ORDINE] (charge.succeeded)', err);
              }
            }
          } else {
            console.warn('[WARN] (charge.succeeded) Carrello vuoto o non valido, nessun dettaglio inserito.');
          }
          // Se tra i dettagli è presente l'offerta 446, imposta stato spedizione iniziale a 25 (DA RICARICARE)
          if (contains446) {
            try {
              // Tenta update con idStatoSpedizione
              await pool.request()
                .input('id', sql.Int, idOrdineProdotto)
                .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET idStatoSpedizione = 25, stato_spedizione = 'DA RICARICARE', DataStato = GETDATE() WHERE IDOrdineProdotto = @id`);
            } catch (e) {
              // Fallback senza colonna idStatoSpedizione
              try {
                await pool.request()
                  .input('id', sql.Int, idOrdineProdotto)
                  .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET stato_spedizione = 'DA RICARICARE', DataStato = GETDATE() WHERE IDOrdineProdotto = @id`);
              } catch (e2) {
                console.warn('[ORDINI][446] Update stato_spedizione iniziale fallito:', e2?.message || e2);
              }
            }
          }
          console.log(`[STRIPE WEBHOOK] (charge.succeeded) Ordine inserito: IDOrdineProdotto=${idOrdineProdotto}, Dealer=${dealerId}, Totale(EUR)=${totaleOrdine}, Spedizione(EUR)=${speseSpedizione}`);
          
          // Invia email di conferma ordine prodotto
          try {
            const eventType = pi.status === 'succeeded' ? 'ORDINE_PRODOTTO_PAGATO' : 'IN_ATTESA_PAGAMENTO';
            await emailService.sendProductOrderEmail(eventType, idOrdineProdotto, {
              paymentStatus: pi.status,
              paymentMethod: 'stripe',
              emailCliente: emailCliente
            });
            console.log(`[EMAIL] Email ordine prodotto inviata: ${eventType} per ordine ${idOrdineProdotto}`);
          } catch (emailError) {
            console.error('[EMAIL] Errore invio email ordine prodotto (charge.succeeded):', emailError);
          }

          // Cleanup tbOrdiniTemp dopo successo
          try {
            if (pi && pi.metadata && pi.metadata.orderToken) {
              await pool.request()
                .input('OrderToken', sql.NVarChar(64), pi.metadata.orderToken)
                .query(`DELETE FROM [${dbName}].dbo.tbOrdiniTemp WHERE OrderToken = @OrderToken`);
              console.log('[DEBUG][STRIPE] (charge.succeeded) tbOrdiniTemp ripulita per orderToken:', pi.metadata.orderToken);
            }
          } catch (cleanupErr) {
            console.warn('[DEBUG][STRIPE] (charge.succeeded) Cleanup tbOrdiniTemp fallito:', cleanupErr);
          }

          // Release application lock
          try {
            await pool.request()
              .input('Res', sql.NVarChar(100), `PI:${pi.id}`)
              .query(`EXEC sp_releaseapplock @Resource=@Res, @LockOwner='Session'`);
          } catch (unlockErr) {
            console.warn('[STRIPE WEBHOOK] (charge.succeeded) Errore rilascio lock:', unlockErr);
          }
        } catch (dbErr) {
          console.error('[STRIPE WEBHOOK] (charge.succeeded) Errore inserimento ordine:', dbErr);
        }

        // Gestione robusta: in alcuni setup LIVE Stripe invia solo charge.succeeded.
        // Fallback sicuro: recupera il PI e accredita solo se non già presente.
        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          const isRic = (pi?.metadata?.orderType || '').toUpperCase() === 'RIC' || pi?.metadata?.ricarica || pi?.metadata?.plafond;
          if (!isRic) {
            if (secureDebug) console.log('[STRIPE][WEBHOOK] charge.succeeded non RIC: nessun accredito', { pi: pi?.id });
            return res.status(200).json({ received: true, type: 'CHARGE_NON_RIC' });
          }

          // Dup-check: cerca una transazione già registrata per questo PI
          try {
            await getPool();
            const dbName = getDbName();
            const dup = await new sql.Request()
              .input('piId', sql.NVarChar(128), String(pi.id))
              .query(`SELECT TOP 1 IDTransazione FROM [${dbName}].dbo.tbTransazioni 
                      WHERE (Payload LIKE '%"id":"' + @piId + '"%')
                         OR (Descrizione LIKE '%' + @piId + '%')`);
            if (dup.recordset && dup.recordset.length > 0) {
              if (secureDebug) console.log('[STRIPE][WEBHOOK] charge.succeeded duplicato per PI:', pi.id);
              return res.status(200).json({ received: true, type: 'CHARGE_DUP' });
            }
          } catch (dupErr) {
            console.warn('[STRIPE][WEBHOOK] Dup-check fallito (charge.succeeded):', dupErr?.message || dupErr);
          }

          const dealerId = Number(pi?.metadata?.dealerId || 0);
          const amountEuro = Number(pi?.amount || 0) / 100.0;
          if (!Number.isFinite(dealerId) || dealerId <= 0) {
            console.warn('[STRIPE][WEBHOOK] charge.succeeded: dealerId non valido nel PI metadata', { dealerId, pi: pi?.id });
            return res.status(200).json({ received: true, type: 'CHARGE_NO_DEALER' });
          }

          const descr = `RICARICA PLAFOND RIC (CH:${charge?.id || ''})`;
          await creditDealer({
            dealerId,
            amountEuro,
            descrizione: descr,
            riferimento: pi?.id,
            payloadObj: { type: event.type, chargeId: charge?.id, id: pi?.id, metadata: pi?.metadata }
          });

          // Email conferma
          try {
            await emailService.sendRechargeCompletedEmail(dealerId, amountEuro, {
              transactionId: `PI:${pi?.id || ''}`,
              emailCliente: pi?.metadata?.emailCliente || ''
            });
            console.log(`[EMAIL] (charge.succeeded) Email ricarica completata inviata (PI:${pi?.id || ''})`);
          } catch (emailError) {
            console.error('[EMAIL] Errore invio email ricarica (charge.succeeded):', emailError);
          }

          return res.status(200).json({ received: true, type: 'CHARGE_FALLBACK_CREDITO' });
        } catch (transazioneErr) {
          console.error('[STRIPE WEBHOOK] (charge.succeeded) errore fallback accredito:', transazioneErr);
          return res.status(200).json({ received: true, type: 'CHARGE_FALLBACK_ERROR' });
        }
      }
    } catch (processErr) {
    console.error('[STRIPE WEBHOOK] Errore processamento evento:', processErr);
  }
  
  console.log('[STRIPE WEBHOOK] Risposta inviata 200 OK');
  res.status(200).json({ received: true });
} catch (err) {
  console.error('Errore verifica webhook Stripe:', err);
  console.log('[STRIPE WEBHOOK] Risposta inviata 400 Bad Request');
  res.status(400).send(`Webhook Error: ${err.message}`);
}
});

// Aumenta i limiti per gestire upload di file multipli
app.use((req, res, next) => {
  const url = req.originalUrl || req.path || '';
  if (url.startsWith('/api/stripe/webhook') || url.startsWith('/webhook/stripe')) return next();
  return express.json({ limit: '50mb' })(req, res, next);
});
app.use((req, res, next) => {
  const url = req.originalUrl || req.path || '';
  if (url.startsWith('/api/stripe/webhook') || url.startsWith('/webhook/stripe')) return next();
  return express.urlencoded({ limit: '50mb', extended: true })(req, res, next);
});

classificaAgentiRoute(app);
obiettiviAgentiRoute(app);
andamentoAgenteRoute(app);
reportisticaAgenteRoute(app);

// Configura multer per la memoria con limiti aumentati
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per singolo file
    files: 20, // Massimo 20 file
    fieldSize: 10 * 1024 * 1024, // 10MB per campo
    fieldNameSize: 1000, // Lunghezza massima nome campo
    fields: 50 // Massimo 50 campi
  },
});

// Middleware di gestione errori upload: ritorna 413 con messaggio chiaro
app.use((err, req, res, next) => {
  try {
    if (!err) return next();
    const isLimit = err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FIELD_SIZE' || err.status === 413;
    if (isLimit) {
      return res.status(413).json({
        message: 'Il file o i dati inviati superano il limite consentito. Riduci la dimensione o riprova.'
      });
    }
  } catch {}
  return next(err);
});

// === CONTRATTI API ===

// GET storico contratti per dealer
app.get('/api/contratti', authenticateToken, async (req, res) => {
  try {
    const dealerId = req.user.dealerId;
    const userEmail = req.user.email;

    const result = await new sql.Request()
      .input('DealerId', sql.Int, dealerId)
      .input('DealerEmail', sql.VarChar, userEmail)
      .query(`
        SELECT TOP 50
          ID,
          CodiceProposta AS NumeroOrdine,
          CognomeCliente AS NomeCliente,
          Utente AS EmailDealer,
          DataOra AS DataCaricamento,
          FullPath AS S3Url,
          FullPath AS FullPath,
          ('https://contrattistation.s3.eu-west-1.amazonaws.com' + FullPath) AS S3PublicUrl,
          NomeFile,
          Stato,
          SO.StatoEsteso,
          Note,
          MeseContratto,
          AnnoContratto
        FROM [dbo].[tbFilesStorage] FS
        LEFT JOIN [dbo].[tbStatiOrdiniContratti] SO ON FS.Stato = SO.IDStato
        WHERE FS.idDealer = @DealerId OR FS.Utente = @DealerEmail
        ORDER BY DataOra DESC
      `);

    res.json(result.recordset || []);

  } catch (err) {
    console.error('[CONTRATTI] Errore recupero storico:', err);
    res.status(500).json({
      error: 'Errore nel recupero dello storico contratti',
      details: err.message
    });
  }
});

// === PLAFOND API ===
// GET credito plafond corrente per dealer loggato
app.get('/api/plafond', authenticateToken, async (req, res) => {
  try {
    const dealerId = Number(req.user.dealerId || req.user.idDealer || req.user.id || req.user.userId);
    if (!dealerId || Number.isNaN(dealerId)) {
      return res.status(400).json({ error: 'dealerId non valido nel token' });
    }

    const result = await new sql.Request()
      .input('DealerId', sql.Int, dealerId)
      .query(`
        SELECT ISNULL(SUM(t.crediti), 0) AS credito
        FROM dbo.tbtransazioni t
        WHERE t.iddealer = @DealerId
      `);

    const credito = result.recordset?.[0]?.credito ?? 0;
    res.json({ dealerId, credito });
  } catch (err) {
    console.error('[PLAFOND] Errore recupero credito:', err);
    res.status(500).json({ error: 'Errore nel recupero del credito', details: err.message });
  }
});

// === UPLOAD CONTRATTI SU S3 ===
app.post('/api/contratti/upload', authenticateToken, upload.array('files'), async (req, res) => {
  console.log('[UPLOAD][DEBUG] req.body:', req.body);
  console.log('[UPLOAD][DEBUG] req.files:', req.files);
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nessun file caricato' });
    }
    const { orderNumber, contractMonth, contractYear, customerName, notes } = req.body;
    if (!orderNumber || !contractMonth || !contractYear || !customerName) {
      return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
    }
    const idDealer = req.user.dealerId;
    const utenteEmail = req.user.email;
    const mese = contractMonth.padStart(2, '0'); // per path usiamo MM
    const meseNum = parseInt(contractMonth, 10) || parseInt(mese, 10) || 0; // per DB usiamo numero
    const anno = contractYear;
    const dataOra = new Date();

    // 1. Unisci tutti i file in un unico PDF
    let pdfBuffer;
    try {
      pdfBuffer = await mergeFilesToPdf(req.files);
    } catch (err) {
      console.error('[UPLOAD][PDF] Errore unione file:', err);
      return res.status(500).json({ error: 'Errore durante la creazione del PDF unico', details: err.message });
    }

    // 2. Costruisci NomeFile originale e FileUID conformi all'esempio
    // Usa il nome del primo file caricato come NomeFile base; se mancante, fallback generico
    const originalBase = (req.files[0]?.originalname || 'documento.pdf').replace(/\s+/g, ' ').trim();
    const uuid = crypto.randomUUID();
    const fileUID = `${uuid}_${originalBase}`;

    // 2b. Recupera DealerName (RagioneSociale) per path, fallback a idDealer
    let dealerName = String(idDealer);
    try {
      const dealerRes = await new sql.Request()
        .input('IDDealer', sql.Int, idDealer)
        .query('SELECT TOP 1 RagioneSociale FROM dbo.tbDealers WHERE IDDealer = @IDDealer');
      const rs = dealerRes.recordset && dealerRes.recordset[0];
      if (rs?.RagioneSociale) dealerName = rs.RagioneSociale;
    } catch (e) {
      // fallback già impostato
    }

    // 2c. Chiave S3 secondo lo schema richiesto
    const s3Key = `contratti/${dealerName}/${anno}/${mese}/${fileUID}`;

    // 3. Carica il PDF unico su S3
    let s3result;
    try {
      const fileToUpload = {
        buffer: pdfBuffer,
        originalname: originalBase, // Manteniamo il nome file originale per intento download
        mimetype: 'application/pdf',
      };
      // uploadToS3 expects (file, orderNumber, contractMonth, contractYear, customKey)
      s3result = await uploadToS3(fileToUpload, orderNumber, mese, anno, s3Key);
    } catch (err) {
      console.error('[UPLOAD][S3] Errore upload PDF unico:', err);
      return res.status(500).json({ error: 'Errore durante l\'upload su S3', details: err.message });
    }

    // 4. Salva nel DB esattamente come l'esempio
    try {
      await getPool();
      // Percorso relativo senza prefisso dominio, coerente con l'esempio
      const fullPath = `/uploads/${s3Key}`;
      const request = new sql.Request();
      request.input('idDealer', sql.Int, idDealer);
      request.input('DataOra', sql.DateTime, dataOra);
      request.input('NomeFile', sql.NVarChar, originalBase);
      request.input('FileUID', sql.NVarChar, fileUID);
      request.input('CognomeCliente', sql.NVarChar, customerName);
      request.input('CodiceProposta', sql.NVarChar, orderNumber);
      request.input('FullPath', sql.NVarChar, fullPath);
      request.input('Utente', sql.NVarChar, utenteEmail);
      request.input('MeseContratto', sql.Int, meseNum);
      request.input('AnnoContratto', sql.NVarChar, anno);
      request.input('Stato', sql.Int, 0);
      request.input('Note', sql.NVarChar, notes || null);
      console.log('[UPLOAD][DB] Parametri inserimento:', {
        idDealer, dataOra, originalBase, fileUID, customerName, orderNumber, fullPath, utenteEmail, meseNum, anno, stato: 0
      });
      const result = await request.query(`
        INSERT INTO dbo.tbFilesStorage
          (idDealer, DataOra, NomeFile, FileUID, CognomeCliente, CodiceProposta, FullPath, Utente, MeseContratto, AnnoContratto, Stato, Note)
        OUTPUT INSERTED.ID
        VALUES (@idDealer, @DataOra, @NomeFile, @FileUID, @CognomeCliente, @CodiceProposta, @FullPath, @Utente, @MeseContratto, @AnnoContratto, @Stato, @Note)
      `);
      const insertedId = result.recordset[0]?.ID;
      res.json({ message: 'File multipli uniti e caricati come PDF unico', file: {
        ...s3result,
        dbId: insertedId,
        fullPath,
        nomeFile: originalBase,
        fileUID
      }});
    } catch (err) {
      console.error('[UPLOAD][DB] Errore inserimento file nel DB:', err);
      return res.status(500).json({ error: 'Errore durante il salvataggio nel database', details: err.message });
    }
  } catch (error) {
    console.error('Errore durante il caricamento:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dei file', details: error.message });
  }
});


// Importa e monta il router dettaglio ordine MasterProdotti
import masterprodottiOrdineDettaglioRouter from './masterprodotti-ordine-dettaglio.mjs';
app.use(masterprodottiOrdineDettaglioRouter);
// Importa e monta il router plafond MasterProdotti
import masterprodottiPlafondRouter from './masterprodotti-plafond.mjs';
app.use('/api/masterprodotti/plafond', masterprodottiPlafondRouter);
app.use('/api/supermaster/report-agente', supermasterReportsRouter);
app.use('/api/supermaster/piani-incentivi', supermasterPianiIncentiviRouter);
app.use('/api/supermaster/compensi-dealer', supermasterCompensiDealerRouter);

// Monta l'API per la gestione dei template email
import emailTemplatesRouter from './email-templates-api.mjs';
app.use('/api', emailTemplatesRouter);

// Import router obiettivi-compensi spostato prima dei router /api/agente (vedi riga ~5064)

// Import router report agente per SUPERMASTER
// (rimosso import duplicato: il router è già importato in testa come supermasterReportsRouter e montato sopra)

// Import e mount router FASTWEB per SUPERMASTER (agente-mensile, ecc.)
import supermasterFastwebRouter from './supermaster-fastweb.mjs';
app.use('/api/supermaster/fastweb', supermasterFastwebRouter);

// Import e mount router SKY per SUPERMASTER
import supermasterSkyRouter from './supermaster-sky.mjs';
app.use('/api/supermaster/sky', supermasterSkyRouter);

// Import e mount router REPORTS dinamici per SUPERMASTER (tbDynamicReports)
import supermasterDynamicReportsRouter from './supermaster-reports.mjs';
app.use('/api/supermaster/reports', supermasterDynamicReportsRouter);

// Import e mount router SIM metrics per SUPERMASTER
import supermasterAgentSimMetricsRouter from './supermaster-agent-sim-metrics.mjs';
app.use('/api/supermaster/agent-sim-metrics', supermasterAgentSimMetricsRouter);

// KPI dinamici per SKY/ILIAD via tbDynamicReports
import supermasterKpiRouter from './supermaster-kpi.mjs';
app.use('/api/supermaster/kpi', supermasterKpiRouter);

import supermasterDealerDashboardRouter from './supermaster-dealer-dashboard.mjs';
app.use('/api/supermaster/dealer-dashboard', supermasterDealerDashboardRouter);

// Agenda Visite - CRM Agenti
import agendaVisiteRouter from './agenda-visite.mjs';
app.use('/api/agente/agenda', agendaVisiteRouter);
app.use('/api/supermaster', agendaVisiteRouter);

// PDF per Piani Incentivi (per-piano) via Puppeteer
app.use('/api/supermaster/incentivi', supermasterIncentiviPdfRouter);

// Endpoint per monitoraggio attività backend SuperMaster
app.get('/api/supermaster/backend-activity', authenticateToken, onlySuperMaster, async (req, res) => {
  try {
    await getPool();

    const normalizedEmails = SUPERMASTER_BACKEND_TARGETS.map(email => String(email || '').toLowerCase());
    const buckets = new Map();
    normalizedEmails.forEach(email => {
      buckets.set(email, {
        email,
        masterId: null,
        rows: []
      });
    });

    const emailParams = SUPERMASTER_BACKEND_TARGETS.map((_, idx) => `@em${idx}` );

    const masterLookupReq = new sql.Request();
    SUPERMASTER_BACKEND_TARGETS.forEach((email, idx) => {
      masterLookupReq.input(`em${idx}` , sql.NVarChar(255), email);
    });
    const masterLookup = await masterLookupReq.query(`
      SELECT Id AS MasterId, Email
      FROM dbo.AspNetUsers WITH (NOLOCK)
      WHERE Email IN (${emailParams.join(', ')})
    ` );

    if (masterLookup?.recordset?.length) {
      for (const row of masterLookup.recordset) {
        const email = String(row.Email || '').toLowerCase();
        if (buckets.has(email)) {
          buckets.get(email).masterId = row.MasterId;
        }
      }
    }

    const activityReq = new sql.Request();
    SUPERMASTER_BACKEND_TARGETS.forEach((email, idx) => {
      activityReq.input(`em${idx}` , sql.NVarChar(255), email);
    });
    const activityRs = await activityReq.query(`
      SELECT TOP (200)
        mal.master_id,
        mal.master_email,
        mal.entity_type,
        mal.entity_id,
        mal.azione,
        mal.created_at,
        mal.stato_precedente,
        mal.stato_successivo,
        mal.ip_address,
        mal.user_agent,
        mal.motivazione,
        mal.payload,
        -- Stati estesi per ATTIVAZIONI
        so_prev.StatoEsteso AS stato_precedente_desc_att,
        so_succ.StatoEsteso AS stato_successivo_desc_att,
        -- Stati estesi per CONTRATTI  
        soc_prev.StatoEsteso AS stato_precedente_desc_contr,
        soc_succ.StatoEsteso AS stato_successivo_desc_contr,
        -- Note dalle tabelle correlate
        CASE 
          WHEN mal.entity_type = 'ATTIVAZIONE' THEN ord.NoteDealer
          WHEN mal.entity_type = 'CONTRATTO' THEN fs.Note
          ELSE mal.motivazione
        END AS note_complete,
        -- Titolo offerta per ATTIVAZIONI
        [off].Titolo AS titolo_offerta
      FROM dbo.master_activity_log mal WITH (NOLOCK)
      -- Join per stati ATTIVAZIONI (precedente)
      LEFT JOIN dbo.tbStatiOrdini so_prev ON mal.entity_type = 'ATTIVAZIONE' 
        AND TRY_CAST(mal.stato_precedente AS INT) = so_prev.IDStato
      -- Join per stati ATTIVAZIONI (successivo)
      LEFT JOIN dbo.tbStatiOrdini so_succ ON mal.entity_type = 'ATTIVAZIONE' 
        AND TRY_CAST(mal.stato_successivo AS INT) = so_succ.IDStato
      -- Join per stati CONTRATTI (precedente)
      LEFT JOIN dbo.tbStatiOrdiniContratti soc_prev ON mal.entity_type = 'CONTRATTO' 
        AND TRY_CAST(mal.stato_precedente AS INT) = soc_prev.IDStato
      -- Join per stati CONTRATTI (successivo)
      LEFT JOIN dbo.tbStatiOrdiniContratti soc_succ ON mal.entity_type = 'CONTRATTO' 
        AND TRY_CAST(mal.stato_successivo AS INT) = soc_succ.IDStato
      -- Join per note ATTIVAZIONI
      LEFT JOIN dbo.tbOrdini ord ON mal.entity_type = 'ATTIVAZIONE' 
        AND mal.entity_id = ord.IDOrdine
      -- Join per titolo offerta ATTIVAZIONI
      LEFT JOIN dbo.tbOfferte [off] ON mal.entity_type = 'ATTIVAZIONE' 
        AND ord.idOfferta = [off].IDOfferta
      -- Join per note CONTRATTI
      LEFT JOIN dbo.tbFilesStorage fs ON mal.entity_type = 'CONTRATTO' 
        AND mal.entity_id = fs.ID
      WHERE mal.master_email IN (${emailParams.join(', ')})
        AND mal.created_at >= DATEADD(day, -30, GETDATE())
      ORDER BY mal.created_at DESC
    ` );

    if (activityRs?.recordset?.length) {
      for (const row of activityRs.recordset) {
        const email = String(row.master_email || '').toLowerCase();
        if (!buckets.has(email)) continue;
        // Determina le descrizioni degli stati in base al tipo di entità
        const statoPrevDesc = row.entity_type === 'ATTIVAZIONE' 
          ? row.stato_precedente_desc_att 
          : row.stato_precedente_desc_contr;
        const statoSuccDesc = row.entity_type === 'ATTIVAZIONE' 
          ? row.stato_successivo_desc_att 
          : row.stato_successivo_desc_contr;
          
        buckets.get(email).rows.push({
          masterId: row.master_id,
          entityType: row.entity_type,
          entityId: row.entity_id,
          titoloOfferta: row.titolo_offerta,
          action: row.azione,
          createdAt: row.created_at,
          statoPrecedente: row.stato_precedente,
          statoSuccessivo: row.stato_successivo,
          statoPrecedenteDesc: statoPrevDesc || row.stato_precedente,
          statoSuccessivoDesc: statoSuccDesc || row.stato_successivo,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          motivazione: row.note_complete || row.motivazione,
          payload: row.payload
        });
      }
    }

    const now = DateTime.utc();
    const targets = Array.from(buckets.values()).map(bucket => {
      const sorted = bucket.rows.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
      const last = sorted[0];
      const lastDate = last?.createdAt ? (last.createdAt instanceof Date ? last.createdAt : new Date(last.createdAt)) : null;
      return {
        email: bucket.email,
        masterId: bucket.masterId,
        totalActivities: sorted.length,
        lastAction: last?.action || null,
        lastActivity: lastDate ? lastDate.toISOString() : null,
        lastActivityPretty: lastDate ? DateTime.fromJSDate(lastDate).setZone('Europe/Rome').setLocale('it').toRelative({ base: now }) : null,
        rows: sorted.slice(0, 20)
      };
    });

    return res.json({ targets });
  } catch (err) {
    console.error('[SUPERMASTER][BACKEND-ACTIVITY] Errore:', err);
    return res.status(500).json({ error: 'Errore nel recupero attività backend', details: err?.message || String(err) });
  }
});

app.post(
  '/api/supermaster/backend-activity/refresh',
  authenticateToken,
  onlySuperMaster,
  express.json(),
  async (req, res) => {
    try {
      await getPool();

      const rawDays = Number(req?.body?.daysBack ?? 60);
      const daysBack = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.floor(rawDays), 365) : 30;
      const dryRun = req?.body?.dryRun === true;

      const request = new sql.Request();
      request.input('DaysBack', sql.Int, daysBack);
      request.input('DryRun', sql.Bit, dryRun ? 1 : 0);

      const result = await request.execute('dbo.sp_master_activity_backfill');
      const recordsets = result?.recordsets || [];
      const summarySet = recordsets.length ? recordsets[recordsets.length - 1] : [];
      const summary = Array.isArray(summarySet) && summarySet.length ? summarySet[0] : null;
      const preview = dryRun && recordsets.length > 1 ? recordsets[0] || [] : [];

      return res.json({
        ok: true,
        daysBack,
        dryRun,
        summary,
        previewCount: dryRun ? preview.length : undefined,
      });
    } catch (err) {
      console.error('[SUPERMASTER][BACKEND-ACTIVITY][REFRESH] Errore:', err);
      return res.status(500).json({
        error: 'Errore durante il refresh attività backend',
        details: err?.message || String(err),
      });
    }
  }
);

// Endpoint proxy per PDF da S3 (evita problemi CORS con PDF.js)
app.get('/api/pdf-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parametro richiesto' });
    }
    
    // Verifica che l'URL sia dal bucket S3 autorizzato
    if (!url.includes('contrattistation.s3.eu-west-1.amazonaws.com')) {
      return res.status(403).json({ error: 'URL non autorizzato' });
    }
    
    console.log('[PDF-PROXY] Richiesta proxy per:', url);
    
    // Fetch del PDF da S3
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[PDF-PROXY] Errore fetch S3:', response.status, response.statusText);
      return res.status(response.status).json({ error: 'PDF non trovato su S3' });
    }
    
    // Imposta headers corretti per PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Stream del PDF al client
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
    
    console.log('[PDF-PROXY] PDF servito con successo');
    
  } catch (error) {
    console.error('[PDF-PROXY] Errore:', error);
    res.status(500).json({ error: 'Errore interno server' });
  }
});

// Monta il router obiettivi-compensi PRIMA degli altri router /api/agente per evitare conflitti
import obiettiviCompensiRouter from './obiettivi-compensi-api.mjs';
app.use('/api', obiettiviCompensiRouter);

// Monta i router agenti e dealer
app.use('/api/agente', createAgenteRouter({ authenticateToken, dbConfig, emailService }));
app.use('/api/agente', agenteKpiRouter);
app.use('/api/dealer', createDealerRouter({ authenticateToken, dbConfig }));

import provinceStatsRouter from './province-stats.mjs';
app.use('/api/province-stats', provinceStatsRouter);

// DEBUG: Registrazione route /api/master/attivazione/:id appena dopo app
console.log('DEBUG: [EARLY] sto per registrare la route /api/master/attivazione/:id');

// === UPLOAD PDA FILE PER MASTER ===

const uploadPda = multer({
  storage: multer.memoryStorage(), // Usa memoria invece di disco
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo PDF consentiti'));
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // max 10MB
});

app.post('/api/master/attivazione/:id/upload-pda', authenticateToken, onlyMaster, uploadPda.single('file'), async (req, res) => {
  try {
    await getPool();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID non valido' });
    if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
    
    console.log(`[UPLOAD PDA] Ricevuto file per ordine ${id}:`, req.file.originalname);
    
    const uuid = crypto.randomUUID();
    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileName = `${uuid}${ext}`;
    
    // Carica su S3 nel bucket attivazionistation/PDA/
    const s3Key = `PDA/${fileName}`;
    const uploadResult = await uploadToS3(
      req.file, // Passa l'intero oggetto file
      id, // orderNumber
      new Date().getMonth() + 1, // contractMonth
      new Date().getFullYear(), // contractYear
      s3Key, // customKey
      'attivazionistation' // bucketOverride
    );
    
    console.log(`[UPLOAD PDA] File caricato su S3:`, uploadResult.url);
    
    // Costruisci payload JSON corretto
    const payload = {
      s3Url: uploadResult.url,
      s3Key: uploadResult.key,
      originalName: uploadResult.originalName,
      bucket: 'attivazionistation'
    };
    
    const NomeFile = fileName;
    const FileUID = fileName;
    const TipoFile = 'PDA';
    const Payload = JSON.stringify(payload);
    
    // Salva nel database con payload corretto
    await (await getRequest())
      .input('IDOrdine', sql.Int, id)
      .input('TipoFile', sql.NVarChar, TipoFile)
      .input('FileUID', sql.NVarChar, FileUID)
      .input('NomeFile', sql.NVarChar, NomeFile)
      .input('Payload', sql.NVarChar, Payload)
      .query(`INSERT INTO dbo.tbFileOrdine (IDOrdine, TipoFile, FileUID, NomeFile, Payload) VALUES (@IDOrdine, @TipoFile, @FileUID, @NomeFile, @Payload)`);
    
    console.log(`[UPLOAD PDA] Salvato nel database con payload:`, payload);
    
    res.json({ 
      ok: true, 
      NomeFile,
      s3Url: uploadResult.url,
      originalName: uploadResult.originalName
    });
  } catch (err) {
    console.error('[UPLOAD PDA ERROR]', err);
    res.status(500).json({ error: 'Errore upload: ' + err.message });
  }
});

app.get('/api/master/attivazione/:id', authenticateToken, onlyMaster, async (req, res) => {
  console.log('[DEBUG] Chiamata a /api/master/attivazione/:id con id:', req.params.id);
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID non valido' });
    
    // Dati principali ordine + join
    const result = await (await getRequest())
      .input('id', sql.Int, id)
      .query(`
        SELECT o.*, d.RagioneSociale AS Dealer, s.StatoEsteso, ofer.Titolo AS Offerta,
          CONVERT(varchar, o.DataOra, 104) AS DataOrdine,
          ofer.Crediti, ofer.Segmento, ofer.Tipo, ofer.TemplateDatiOfferta, ofer.IDOperatore,
          CAST(0 AS DECIMAL(10,2)) AS ImportoTotale
        FROM dbo.tbOrdini o
        LEFT JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
        LEFT JOIN dbo.tbStatiOrdini s ON o.Stato = s.IDStato
        LEFT JOIN dbo.tbOfferte ofer ON o.idOfferta = ofer.IDOfferta
        WHERE o.IDOrdine = @id
      `);
    if (!result.recordset || result.recordset.length === 0) return res.status(404).json({ error: 'Ordine non trovato' });
    const ordine = result.recordset[0];

    // Mappa TemplateDatiOfferta -> TemplateCodice e oggetto Template dal templates.json
    try {
      const rawTpl = ordine?.TemplateDatiOfferta || ordine?.template || null;
      const { code, template } = findTemplateByCode(rawTpl);
      if (code) ordine.TemplateCodice = code; // es. 'CERTIFICAZIONE_INDIRIZZO'
      if (template) ordine.Template = template; // oggetto completo del template
    } catch (e) {
      // In caso di errore, continua senza bloccare la risposta
      try { console.warn('[MASTER][DETTAGLIO] Impossibile mappare TemplateDatiOfferta:', e?.message); } catch(_) {}
    }
    // Documenti: embed da tbFileOrdine (S3), con parsing del Payload e URL risolto
    let documenti = [];
    try {
      const fileOrdineRes = await (await getRequest())
        .input('id', sql.Int, id)
        .query(`
          SELECT 
            IDFileOrdine,
            IDOrdine,
            TipoFile,
            FileUID,
            NomeFile,
            Payload
          FROM dbo.tbFileOrdine 
          WHERE IDOrdine = @id
          ORDER BY IDFileOrdine
        `);
      const rows = fileOrdineRes.recordset || [];
      documenti = rows.map(r => {
        let payload = {};
        try { payload = r.Payload ? JSON.parse(r.Payload) : {}; } catch {}
        const bucket = payload.bucket || 'attivazionistation';
        const url = payload.s3Url 
          || (payload.s3Key ? `https://${bucket}.s3.eu-west-1.amazonaws.com/${payload.s3Key}` : null)
          || null;
        return {
          IDFileOrdine: r.IDFileOrdine,
          IDOrdine: r.IDOrdine,
          TipoFile: r.TipoFile,
          FileUID: r.FileUID,
          NomeFile: r.NomeFile,
          Payload: payload,
          url
        };
      });
    } catch(e) { documenti = []; }
    ordine.Documenti = documenti;
    // Storico cambi stato
    let storico = [];
    try {
      const storicoRes = await (await getRequest())
        .input('id', sql.Int, id)
        .query(`
          SELECT 
            CONVERT(varchar(33), CAST(SWITCHOFFSET(CONVERT(datetimeoffset, s.DataOra), '+00:00') AS datetime2), 126) + 'Z' AS DataOra,
            s.Utente,
            s.StatoPrecedente,
            sp.StatoEsteso AS StatoPrecedenteNome,
            s.StatoNuovo,
            sn.StatoEsteso AS StatoNuovoNome,
            s.Nota
          FROM dbo.tbStoricoOrdini s
          LEFT JOIN dbo.tbStatiOrdini sp ON sp.IDStato = s.StatoPrecedente
          LEFT JOIN dbo.tbStatiOrdini sn ON sn.IDStato = s.StatoNuovo
          WHERE s.IDOrdine = @id
          ORDER BY s.DataOra DESC
        `);
      storico = storicoRes.recordset || [];
    } catch(e) { storico = []; }
    ordine.Storico = storico;
    // Payload da tbDatiOrdine
    let payload = {};
    try {
      const dati = await (await getRequest())
        .input('id', sql.Int, id)
        .query(`SELECT TOP 1 Payload FROM dbo.tbDatiOrdine WHERE IDOrdine = @id`);
      payload = dati.recordset[0]?.Payload ? JSON.parse(dati.recordset[0].Payload) : {};
    } catch(e) { payload = {}; }
    ordine.Payload = payload;
    
    // Dati intestatario completi (Nome, Cognome, CF, Email, Telefono, ecc.)
    let intestatario = null;
    try {
      const intResult = await (await getRequest())
        .input('id', sql.Int, id)
        .query(`SELECT * FROM dbo.tbDatiIntestario WHERE IDOrdine = @id`);
      if (intResult.recordset && intResult.recordset.length > 0) {
        intestatario = intResult.recordset[0];
      }
    } catch(e) { intestatario = null; }
    ordine.Intestatario = intestatario;
    
    // Payload intestatario
    let payloadInt = {};
    try {
      const datiInt = await (await getRequest())
        .input('id', sql.Int, id)
        .query(`SELECT TOP 1 Payload FROM dbo.tbDatiIntestario WHERE IDOrdine = @id`);
      payloadInt = datiInt.recordset[0]?.Payload ? JSON.parse(datiInt.recordset[0].Payload) : {};
    } catch(e) { payloadInt = {}; }
    ordine.PayloadIntestario = payloadInt;
    // File ordine
    let fileOrdine = [];
    try {
      const files = await (await getRequest())
        .input('id', sql.Int, id)
        .query(`SELECT * FROM dbo.tbFileOrdine WHERE IDOrdine = @id`);
      fileOrdine = files.recordset || [];
    } catch(e) { fileOrdine = []; }
    ordine.FileOrdine = fileOrdine;
    res.json(ordine);
  } catch (err) {
    console.error('[MASTER][DETTAGLIO ORDINE] Errore:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});
console.log('DEBUG: [EARLY] route /api/master/attivazione/:id registrata');

// DEBUG: log all routes on startup
app.on('mount', () => {
  if (app._router && app._router.stack) {
    console.log('=== ROUTES REGISTRATE ===');
    app._router.stack.forEach(middleware => {
      if (middleware.route) {
        // routes registered directly on the app
        const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
        console.log(`${methods} ${middleware.route.path}`);
      } else if (middleware.name === 'router') {
        // router middleware
        middleware.handle.stack.forEach(handler => {
          const route = handler.route;
          if (route) {
            const methods = Object.keys(route.methods).join(', ').toUpperCase();
            console.log(`${methods} ${route.path}`);
          }
        });
      }
    });
    console.log('========================');
  }
});

// In alternativa, stampa le routes subito dopo la definizione di tutte le route (compatibile con Express classico)
setTimeout(() => {
  if (app._router && app._router.stack) {
    console.log('=== ROUTES REGISTRATE (startup) ===');
    app._router.stack.forEach(middleware => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
        console.log(`${methods} ${middleware.route.path}`);
      }
    });
    console.log('========================');
  }
}, 2000);

// Endpoint per aggiornare lo stato di un contratto
app.post('/api/contratti/:id/stato', authenticateToken, onlyMaster, express.json(), async (req, res) => {
  const { id } = req.params;
  const { stato } = req.body;
  
  if (!stato) {
    return res.status(400).json({ error: 'Campo "stato" mancante' });
  }
  
  // Mappa gli stati testuali ai valori numerici
  // Uniformiamo la terminologia: stato 3 = ATTESA INTEGRAZIONE.
  // Manteniamo 'RIMANDA_PER_MODIFICA' come alias per retrocompatibilità.
  const statoMap = {
    'ACCETTATO': 1,
    'RIFIUTATO': 2,
    'ATTESA_INTEGRAZIONE': 3,
    'ATTESA INTEGRAZIONE': 3,
    'RIMANDA_PER_MODIFICA': 3
  };
  
  let statoNumerico = statoMap[stato];
  if (statoNumerico === undefined) {
    // Se non è una stringa mappata, prova a usare direttamente il valore numerico
    if (!isNaN(Number(stato))) {
      statoNumerico = Number(stato);
    } else {
      return res.status(400).json({ error: 'Stato non valido' });
    }
  }
  
  try {
    
    
    // Inizia una transazione per eseguire più operazioni atomiche
    const transaction = new sql.Transaction();
    await transaction.begin();
    
    try {
      // Prima ottieni i dati del contratto per il logging
      const selectRequest = new sql.Request(transaction);
      const contratto = await selectRequest.query`
        SELECT [ID], [idDealer], [NomeFile], [Stato] as VecchioStato
        FROM [dbo].[tbFilesStorage]
        WHERE [ID] = ${id};
      `;
      
      if (contratto.recordset.length === 0) {
        throw new Error('Nessun contratto trovato con questo ID');
      }
      
      console.log('Dati contratto prima dell\'aggiornamento:', contratto.recordset[0]);
      
      // Log dettagliato per debug
      console.log('Aggiorno contratto', { id, statoNumerico, note: req.body.note });
      // Esegui l'aggiornamento
      const updateRequest = new sql.Request(transaction);
      await updateRequest.query`
        UPDATE [dbo].[tbFilesStorage]
        SET [Stato] = ${statoNumerico},
            [Note] = ${req.body.note || null}
        WHERE [ID] = ${id};
      `;
      
      // Commit della transazione
      await transaction.commit();
      
      console.log(`Stato contratto ${id} aggiornato da ${contratto.recordset[0].VecchioStato} a ${statoNumerico}`);
      res.json({ 
        success: true, 
        message: 'Stato aggiornato con successo',
        id: id,
        vecchioStato: contratto.recordset[0].VecchioStato,
        nuovoStato: statoNumerico
      });
      
    } catch (err) {
      // Rollback in caso di errore
      await transaction.rollback();
      console.error('Errore durante la transazione:', err);
      throw err; // Rilancia l'errore per la gestione esterna
    }
    
  } catch (err) {
    console.error('Errore durante l\'aggiornamento dello stato del contratto:', {
      message: err.message,
      code: err.code,
      number: err.number,
      lineNumber: err.lineNumber,
      stack: err.stack
    });
    
    res.status(500).json({ 
      error: 'Errore durante l\'aggiornamento dello stato', 
      details: err.message,
      code: err.code || err.number,
      originalError: process.env.NODE_ENV === 'development' ? err : undefined
    });
  }
});

// Middleware: solo MASTER
function onlyMaster(req, res, next) {
  try {
    if (!req.user) {
      console.log('[ONLY_MASTER] Errore: Utente non autenticato');
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }
    
    const ruoli = req.user.ruoli
      ? req.user.ruoli.map(r => r.toUpperCase())
      : req.user.ruolo
        ? [req.user.ruolo.toUpperCase()]
        : [];
    console.log('[ONLY_MASTER] Ruoli utente:', ruoli);
    
    if (ruoli.includes('MASTER') || isMasterEmail(req.user.email)) {
      console.log('[ONLY_MASTER] Accesso consentito');
      return next();
    }
    
    console.log('[ONLY_MASTER] Accesso negato: ruolo non autorizzato');
    return res.status(403).json({ error: 'Accesso riservato al ruolo MASTER' });
  } catch (e) {
    console.error('[ONLY_MASTER] Errore:', e);
    return res.status(403).json({ error: 'Errore di autorizzazione' });
  }
}

// Middleware: MASTER o SUPERMASTER
function onlyMasterOrSuperMaster(req, res, next) {
  try {
    if (!req.user) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }

    const ruoli = req.user.ruoli
      ? req.user.ruoli.map(r => r.toUpperCase())
      : req.user.ruolo
        ? [req.user.ruolo.toUpperCase()]
        : [];

    if (ruoli.includes('MASTER') || ruoli.includes('SUPERMASTER') || isMasterEmail(req.user.email)) {
      return next();
    }

    return res.status(403).json({ error: 'Accesso riservato al ruolo MASTER o SUPERMASTER' });
  } catch (e) {
    return res.status(403).json({ error: 'Errore di autorizzazione' });
  }
}

// Esporta i middleware per l'uso in altri file

console.log('DEBUG: FINE FILE index.js');
// Middleware: solo MASTERPRODOTTI
function onlyMasterProdotti(req, res, next) {
  try {
    if (!req.user) {
      console.log('[ONLY_MASTERPRODOTTI] Errore: Utente non autenticato');
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }
    
    const ruoli = req.user.ruoli ? req.user.ruoli.map(r => r.toUpperCase()) : [];
    console.log('[ONLY_MASTERPRODOTTI] Ruoli utente:', ruoli);
    
    if (ruoli.includes('MASTERPRODOTTI') || req.user.email === 'amministrazione@kimweb.it') {
      console.log('[ONLY_MASTERPRODOTTI] Accesso consentito');
      return next();
    }
    
    console.log('[ONLY_MASTERPRODOTTI] Accesso negato: ruolo non autorizzato');
    return res.status(403).json({ error: 'Accesso riservato al ruolo MASTERPRODOTTI' });
  } catch (e) {
    console.error('[ONLY_MASTERPRODOTTI] Errore:', e);
    return res.status(403).json({ error: 'Errore di autorizzazione' });
  }
    console.log("[ONLY_MASTER] Utente:", JSON.stringify(req.user, null, 2)); 
    console.log("[ONLY_MASTER] Headers:", JSON.stringify(req.headers, null, 2)); 
    console.log("[ONLY_MASTER] URL:", req.originalUrl);
}

// Endpoint: ORDINI MasterProdotti
app.get('/api/masterprodotti/ordini', authenticateToken, onlyMasterProdotti, async (req, res) => {
  try { console.log('[MASTERPRODOTTI][ORDINI] ENTRY'); } catch(_) {}
  try {
    await getPool();
    const result = await (await getRequest()).query(`
      SELECT 
        FORMAT(o.[DataOra], 'dd.MM.yy') AS [Data],
        o.[IDOrdineProdotto] AS [IDOrdineProdotto],
        COALESCE(d.[RagioneSociale], 'Sconosciuto') AS [RagioneSociale],
        CAST(
          CASE 
            WHEN o.[DataOra] < '2025-08-16' THEN o.[TotaleOrdine]
            ELSE o.[TotaleOrdine] + ISNULL(o.[SpeseSpedizione], 0)
          END AS DECIMAL(10,2)
        ) AS [TotaleOrdine],
        o.[NoteOrdine] AS [NOTE],
        COALESCE(s.[StatoEsteso], 'NON DEFINITO') AS [StatoEsteso],
        -- Stato spedizione esteso via ID
        o.[idStatoSpedizione] AS [IdStatoSpedizione],
        COALESCE(ss.[StatoEsteso], NULLIF(o.[stato_spedizione], '')) AS [StatoSpedizioneEsteso]
      FROM 
        [dbo].[tbOrdiniProdotti] o
      LEFT JOIN 
        [dbo].[tbDealers] d ON o.[idDealer] = d.[idDealer]
      LEFT JOIN 
        [dbo].[tbStatiOrdiniProdotti] s ON o.[idStatoOrdineProdotto] = s.[IDStato]
      LEFT JOIN 
        [dbo].[tbStatiSpedizioneOrdiniProdotti] ss ON ss.[IDStato] = o.[idStatoSpedizione]
      ORDER BY 
        o.[DataOra] DESC;
    `);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('[MASTERPRODOTTI][ORDINI] Errore:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});
// Endpoint: ATTIVAZIONI MasterProdotti
app.get('/api/masterprodotti/attivazioni', authenticateToken, onlyMasterProdotti, async (req, res) => {
  try {
    await getPool();
    const result = await (await getRequest()).query(`
      SELECT TOP 50
        o.IDOrdine,
        FORMAT(o.DataOra, 'dd/MM/yyyy HH:mm') as DataOrdine,
        o.Stato,
        d.RagioneSociale as Dealer,
        o.NomeOfferta as Offerta
      FROM dbo.tbOrdini o
      LEFT JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
      ORDER BY o.DataOra DESC
    `);
    
    // Mappa gli stati per rimuovere eventuali caratteri speciali
    const attivazioni = result.recordset.map(item => ({
      ...item,
      // Assicurati che lo stato sia nel formato atteso dal frontend
      Stato: item.Stato ? item.Stato.replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim() : ''
    }));
    
    res.json(attivazioni);

  } catch (err) {
    console.error('[MASTERPRODOTTI][ATTIVAZIONI] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero delle attivazioni' });
  }
});

// --- Password Reset Token Store (in-memory, replace with DB in production) ---
const passwordResetTokens = new Map(); // email -> { token, expires, used }

// --- Nodemailer Setup ---
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Helper: sostituisce placeholder {{KEY}} nel template
function applyTemplate(str = '', params = {}) {
  try {
    return Object.entries(params).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v ?? '')), String(str || ''));
  } catch { return String(str || ''); }
}

// Helper: invia email usando il template in dbo.tbEmailTemplates per EventType specifico
async function sendTemplateEmail({ eventType, to, params = {}, fallbackSubject = 'KIM Station' }) {
  // Recupera il template attivo più recente
  const tmplRes = await new sql.Request()
    .input('eventType', sql.NVarChar, eventType)
    .query(`SELECT TOP 1 Subject, HtmlTemplate, TextTemplate
            FROM dbo.tbEmailTemplates
            WHERE EventType = @eventType AND IsActive = 1
            ORDER BY ModifiedDate DESC, CreatedDate DESC`);
  if (!tmplRes.recordset?.length) throw new Error(`Template ${eventType} non trovato/attivo`);
  const { Subject, HtmlTemplate, TextTemplate } = tmplRes.recordset[0];

  const subject = applyTemplate(Subject || fallbackSubject, params);
  const html = applyTemplate(HtmlTemplate || '', params);
  const text = applyTemplate(TextTemplate || '', params);

  await transporter.sendMail({
    from: `"KIM Station" <${process.env.EMAIL_USER}>`,
    to,
    bcc: process.env.ADMIN_EMAIL || undefined,
    subject,
    html: html || undefined,
    text: text || undefined,
  });
}

// --- PASSWORD RESET ENDPOINTS ---

// Alias per compatibilità frontend: /api/reset-password
app.post('/api/reset-password', express.json(), async (req, res, next) => {
  // Forward alla stessa logica di /api/password-reset-request
  req.url = '/api/password-reset-request';
  app._router.handle(req, res, next);
});

// 1. Request password reset (send email)
app.post('/api/password-reset-request', express.json(), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email richiesta' });
  try {
    
    // Check if user exists
    const userRes = await new sql.Request()
      .input('email', sql.NVarChar, email)
      .query('SELECT TOP 1 * FROM dbo.AspNetUsers WHERE Email = @email');
    if (!userRes.recordset.length) {
      // Don't reveal if email exists (security)
      return res.json({ success: true });
    }
    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 1000 * 60 * 30; // 30 min expiry
    passwordResetTokens.set(email, { token, expires, used: false });
    // Send email
    // Nuova logica: link verso la pagina moderna di reset password
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`;
    await transporter.sendMail({
      from: 'kimstation.noreply@kimweb.agency',
      to: email,
      subject: 'Password Reset Request',
      html: `<p>Per reimpostare la password, clicca qui: <a href="${resetLink}">${resetLink}</a><br>Il link scade in 30 minuti.</p>`
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('[RESET] Errore richiesta reset:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// 2. Endpoint per conferma reset password
app.post('/api/password-reset-confirm', express.json(), async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) return res.status(400).json({ error: 'Dati mancanti' });
  
  console.log('[RESET][DEBUG] Richiesta conferma reset per email:', email);
  
  const entry = passwordResetTokens.get(email);
  if (!entry || entry.token !== token || entry.expires < Date.now() || entry.used) {
    console.log('[RESET][DEBUG] Token non valido:', { 
      tokenExists: !!entry, 
      tokenMatch: entry ? entry.token === token : false, 
      tokenExpired: entry ? entry.expires < Date.now() : true, 
      tokenUsed: entry ? entry.used : true 
    });
    return res.status(400).json({ error: 'Token non valido o scaduto' });
  }
  
  // Basic password policy: min 8 chars, include upper, lower, number, symbol
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128 ||
      !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    return res.status(400).json({ error: 'La nuova password deve contenere almeno 8 caratteri, con maiuscole, minuscole, numeri e simboli.' });
  }

  try {
    // Usa dbConfig importato da db-pool.mjs
    console.log('[RESET][DEBUG] Tentativo connessione DB con config:', {
      user: dbConfig.user,
      server: dbConfig.server,
      database: dbConfig.database
    });
    
    await getPool();
    
    // Hash new password (ASP.NET Identity v3)
    const hashedPw = await aspnetIdentityPw.hashPassword(newPassword);
    console.log('[RESET][DEBUG] Nuovo hash generato (nascosto)');
    const newSecurityStamp = crypto.randomBytes(16).toString('hex').toUpperCase();
    
    const updateResult = await new sql.Request()
      .input('email', sql.NVarChar, email)
      .input('hash', sql.NVarChar, hashedPw)
      .input('securityStamp', sql.NVarChar, newSecurityStamp)
      .query('UPDATE dbo.AspNetUsers SET PasswordHash = @hash, SecurityStamp = @securityStamp WHERE Email = @email');
      
    console.log('[RESET][DEBUG] Risultato update SQL:', updateResult.rowsAffected);
    
    if (updateResult.rowsAffected[0] === 0) {
      console.log('[RESET][ERROR] Nessuna riga aggiornata nel DB');
      return res.status(400).json({ error: 'Email non trovata nel sistema' });
    }
    
    entry.used = true;
    passwordResetTokens.delete(email);
    return res.json({ success: true });
  } catch (err) {
    console.error('[RESET][ERROR] Errore conferma reset:', err);
    return res.status(500).json({ error: 'Errore server durante il reset della password' });
  }
});

// --- ENDPOINT DASHBOARD MASTER ---

// Endpoint: ORDINI MasterProdotti
app.get('/api/masterprodotti/ordini', authenticateToken, onlyMasterProdotti, async (req, res) => {
  try {
    await getPool();
    const result = await (await getRequest()).query(`
      SELECT 
        o.IDOrdineProdotto AS IDOrdineProdotto,
        FORMAT(o.[DataOra], 'dd.MM.yy') AS [Data],
        d.[RagioneSociale],
        CAST(
          CASE 
            WHEN o.[DataOra] < '2025-08-16' THEN o.[TotaleOrdine]
            ELSE o.[TotaleOrdine] + ISNULL(o.[SpeseSpedizione], 0)
          END AS DECIMAL(10,2)
        ) AS [TotaleOrdine],
        o.[NoteOrdine] AS [NOTE],
        s.[StatoEsteso],
        o.[idStatoSpedizione] AS [IdStatoSpedizione],
        CASE WHEN ISNULL(o.[idStatoSpedizione], 0) = 0 THEN 'Non Spedito' ELSE ss.[StatoEsteso] END AS [StatoSpedizioneEsteso],
        -- Alias di compatibilità per la UI esistente
        CASE WHEN ISNULL(o.[idStatoSpedizione], 0) = 0 THEN 'Non Spedito' ELSE ss.[StatoEsteso] END AS [Stato_spedizione],
        CASE WHEN ISNULL(o.[idStatoSpedizione], 0) = 0 THEN 'Non Spedito' ELSE ss.[StatoEsteso] END AS [stato_spedizione]
      FROM 
        [dbo].[tbOrdiniProdotti] o
      INNER JOIN 
        [dbo].[tbDealers] d ON o.[idDealer] = d.[idDealer]
      INNER JOIN 
        [dbo].[tbStatiOrdiniProdotti] s ON o.[idStatoOrdineProdotto] = s.[IDStato]
      LEFT JOIN 
        [dbo].[tbStatiSpedizioneOrdiniProdotti] ss ON ss.[IDStato] = o.[idStatoSpedizione]
      ORDER BY 
        o.[DataOra] DESC;
    `);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('[MASTERPRODOTTI][ORDINI] Errore:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// Attivazioni per MASTER (tutte le attivazioni, senza limite)
app.get('/api/master/attivazioni', authenticateToken, onlyMaster, async (req, res) => {
  try {
    await getPool();
    const result = await (await getRequest()).query(`
      SELECT
        FORMAT(o.DataOra, 'dd.MM.yyyy') AS DataOrdine,
        o.DataOra AS DataOrdinamento,
        o.IDOrdine,
        ofer.Titolo AS Offerta,
        d.RagioneSociale AS Dealer,
        s.StatoEsteso AS Stato,
        i.Payload AS IntestatarioPayload
      FROM dbo.tbOrdini o
      LEFT JOIN dbo.tbOfferte ofer ON o.idOfferta = ofer.IDOfferta
      LEFT JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
      LEFT JOIN dbo.tbStatiOrdini s ON o.Stato = s.IDStato
      LEFT JOIN dbo.tbDatiIntestario i ON o.IDOrdine = i.IDOrdine
      ORDER BY o.DataOra DESC;
    `);
    
    // Estrai il nome cliente dal Payload JSON
    const rows = (result.recordset || []).map(row => {
      let cliente = '-';
      if (row.IntestatarioPayload) {
        try {
          const payload = JSON.parse(row.IntestatarioPayload);
          cliente = payload.NOME_E_COGNOME || payload.NOME_E_COGNOME_INTESTATARIO_CONTRATTO || payload.NOME_E_COGNOME_INTESTATARIO || '-';
        } catch {}
      }
      return { ...row, Cliente: cliente };
    });
    
    res.json(rows);
  } catch (err) {
    console.error('[MASTER][ATTIVAZIONI] Errore:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// Ultime attivazioni per MASTER (tutte le attivazioni, senza limite)
app.get('/api/master/ultime-attivazioni', authenticateToken, onlyMaster, async (req, res) => {
  try {
    await getPool();
    const result = await (await getRequest()).query(`
      SELECT
        FORMAT(o.DataOra, 'dd.MM.yyyy') AS Data,
        o.DataOra AS DataOrdinamento,
        o.IDOrdine,
        ofer.Titolo,
        ofer.Tipo,
        ofer.Segmento,
        d.RagioneSociale AS Dealer,
        s.StatoEsteso AS Stato,
        i.Payload AS IntestatarioPayload
      FROM dbo.tbOrdini o
      LEFT JOIN dbo.tbOfferte ofer ON o.idOfferta = ofer.IDOfferta
      LEFT JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
      LEFT JOIN dbo.tbStatiOrdini s ON o.Stato = s.IDStato
      LEFT JOIN dbo.tbDatiIntestario i ON o.IDOrdine = i.IDOrdine
      ORDER BY o.DataOra DESC;
    `);
    
    // Estrai il nome cliente dal Payload JSON
    const rows = (result.recordset || []).map(row => {
      let cliente = '-';
      if (row.IntestatarioPayload) {
        try {
          const payload = JSON.parse(row.IntestatarioPayload);
          cliente = payload.NOME_E_COGNOME || payload.NOME_E_COGNOME_INTESTATARIO_CONTRATTO || payload.NOME_E_COGNOME_INTESTATARIO || '-';
        } catch {}
      }
      return { ...row, Cliente: cliente };
    });
    
    res.json(rows);
  } catch (err) {
    console.error('[MASTER][ULTIME-ATTIVAZIONI] Errore:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// Config: Google Maps API key and Map ID (protected: MASTER or SUPERMASTER)
app.get('/api/config/maps-key', authenticateToken, onlyMasterOrSuperMaster, (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || null;
    const mapId = process.env.GOOGLE_MAPS_MAP_ID || null;
    return res.json({ key: apiKey, apiKey, mapId });
  } catch (err) {
    console.error('[CONFIG][maps-key] Errore:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
});

// Ordini per MASTERPRODOTTI
app.get('/api/masterprodotti/ordini', authenticateToken, onlyMasterProdotti, async (req, res) => {
  try {
    await getPool();
    const result = await (await getRequest()).query(`
      SELECT 
        FORMAT(o.[DataOra], 'dd.MM.yy') AS [Data],
        o.[IDOrdineProdotto] AS [IDOrdineProdotto],
        COALESCE(d.[RagioneSociale], 'Sconosciuto') AS [RagioneSociale],
        CAST(
          CASE 
            WHEN o.[DataOra] < '2025-08-16' THEN o.[TotaleOrdine]
            ELSE o.[TotaleOrdine] + ISNULL(o.[SpeseSpedizione], 0)
          END AS DECIMAL(10,2)
        ) AS [TotaleOrdine],
        o.[NoteOrdine] AS [NOTE],
        s.[StatoEsteso] AS [StatoEsteso],
        -- Spedizione esposta con alias doppio e colonne raw per debug
        CASE WHEN ISNULL(o.[idStatoSpedizione], 0) = 0 THEN 'Non Spedito' ELSE ss.[StatoEsteso] END AS [StatoSpedizioneEsteso],
        CASE WHEN ISNULL(o.[idStatoSpedizione], 0) = 0 THEN 'Non Spedito' ELSE ss.[StatoEsteso] END AS [Stato_spedizione],
        CASE WHEN ISNULL(o.[idStatoSpedizione], 0) = 0 THEN 'Non Spedito' ELSE ss.[StatoEsteso] END AS [stato_spedizione],
        o.[stato_spedizione] AS [stato_spedizione_raw],
        o.[StatoSpedizione] AS [StatoSpedizione_raw],
        o.[idStatoOrdineProdotto] AS [idStatoOrdineProdotto]
      FROM 
        [dbo].[tbOrdiniProdotti] o
      LEFT JOIN 
        [dbo].[tbDealers] d ON o.[idDealer] = d.[idDealer]
      LEFT JOIN 
        [dbo].[tbStatiOrdiniProdotti] s ON o.[idStatoOrdineProdotto] = s.[IDStato]
      ORDER BY 
        o.[DataOra] DESC;
    `);
    try {
      if (result && result.recordset && result.recordset.length) {
        const first = result.recordset[0];
        console.log('[MASTERPRODOTTI][ORDINI][DEBUG] Columns:', Object.keys(first));
        const r1449 = result.recordset.find(r => String(r.IDOrdineProdotto) === '1449');
        if (r1449) console.log('[MASTERPRODOTTI][ORDINI][DEBUG] 1449 stato_spedizione:', r1449.stato_spedizione, 'Stato_spedizione:', r1449.Stato_spedizione);
      }
    } catch(e) { /* no-op */ }
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('[MASTERPRODOTTI][ORDINI] Errore:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Errore server', details: err.message });
    }
  }
});

// Contratti Master
app.get('/api/master/contratti', authenticateToken, onlyMaster, async (req, res) => {
  try {
    await getPool();
    const result = await (await getRequest()).query(`
      SELECT TOP 400  
        f.ID AS idContratto,
        FORMAT(f.DataOra, 'dd.MM.yyyy') AS Data,
        d.RagioneSociale AS Dealer,
        f.CognomeCliente,
        f.MeseContratto,
        f.AnnoContratto,
        s.StatoEsteso AS Stato,
        f.FullPath,
        f.FullPath AS DocumentoUrl
      FROM 
        dbo.tbFilesStorage f
      LEFT JOIN 
        dbo.tbDealers d ON f.idDealer = d.IDDealer
      LEFT JOIN 
        dbo.tbStatiOrdiniContratti s ON f.Stato = s.IDStato
      ORDER BY 
        f.DataOra DESC
    `);
    console.log(`[MASTER/CONTRATTI] Trovati ${result.recordset.length} record`);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('[MASTER/CONTRATTI] Errore nel recupero dei contratti:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Errore nel recupero dei contratti',
        details: err.message,
        code: err.code
      });
    }
  }
});

// === Dettaglio ordine/attivazione per MASTER ===
// NOTA: Route già definita sopra (riga ~5169) con mapping Template completo
// Questa era una duplicazione che causava problemi - RIMOSSA

// Endpoint: CONFIGURAZIONE PULSANTI DINAMICI ASSISTENZA
app.get('/api/assistenza/pulsanti/:nomeForm', authenticateToken, onlyMaster, async (req, res) => {
  try {
    const nomeForm = req.params.nomeForm;
    console.log('[DEBUG][PULSANTI] Richiesta configurazione per form:', nomeForm);
    
    const result = await new sql.Request()
      .input('NomeForm', sql.NVarChar, nomeForm)
      .query(`
        SELECT 
          NomeForm,
          Pulsanti,
          StatoTarget,
          Descrizione
        FROM dbo.tbAssistenzaPulsanti 
        WHERE NomeForm = @NomeForm
      `);
    
    if (result.recordset.length === 0) {
      console.log('[DEBUG][PULSANTI] Nessuna configurazione trovata per:', nomeForm);
      // Fallback hardcoded per FURTO/SMARRIMENTO (match robusto per parole chiave)
      const raw = (nomeForm || '').toString().trim();
      const nf = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
      console.log('[DEBUG][PULSANTI] Nome form normalizzato:', nf);
      const isExplicitMatch = nf === 'FURTO_SMARRIMENTO' || nf === 'SOSTITUZIONE GUASTO O CAMBIO FORMATO';
      const isFurtoSmarrimento = isExplicitMatch || (
        // qualunque combinazione di parole chiave rilevanti
        (nf.includes('FURTO') || nf.includes('RUBATA') || nf.includes('RUB')) &&
        (nf.includes('SMARR') || nf.includes('PERS') || nf.includes('PERDITA') || nf.includes('SMARRIMENTO'))
      ) || (
        nf.includes('SOSTITU') || nf.includes('SOS ') || nf.startsWith('SOS')
      ) || nf === 'TICKET ASSISTENZA SOSTITUZIONE PER FURTO O SMARRIMENTO';
      if (isFurtoSmarrimento) {
        const fallbackPulsanti = ['ATTESA MODULO', 'RIFIUTA', 'SIM SOSTITUITA'];
        const fallbackMap = {
          'ATTESA MODULO': 'ATTESA_MODULO',
          'RIFIUTA': '2',
          'SIM SOSTITUITA': 'SIM_SOSTITUITA'
        };
        return res.json({
          nomeForm: nomeForm,
          pulsanti: fallbackPulsanti,
          // Il frontend si aspetta statoTarget come JSON string
          statoTarget: JSON.stringify({
            'ATTESA MODULO': 'ATTESA_MODULO', // backend mapperà → 10
            'RIFIUTA': '2',                   // annullato
            'SIM SOSTITUITA': 'SIM_SOSTITUITA' // backend mapperà → 11
          }),
          descrizione: 'Configurazione predefinita per sostituzione SIM per furto o smarrimento'
        });
      }
      return res.status(404).json({ error: 'Configurazione pulsanti non trovata per questo form' });
    }
    
    const config = result.recordset[0];
    console.log('[DEBUG][PULSANTI] Configurazione trovata:', config);

    // Se il form corrisponde a Furto/Smarrimento, forza i tre pulsanti richiesti
    const raw2 = (config.NomeForm || '').toString().trim();
    const nf2 = raw2.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    console.log('[DEBUG][PULSANTI] Nome form (DB) normalizzato:', nf2);
    const isExplicitMatch2 = nf2 === 'FURTO_SMARRIMENTO' || nf2 === 'SOSTITUZIONE GUASTO O CAMBIO FORMATO';
    const isFurtoSmarrimento2 = isExplicitMatch2 || (
      (nf2.includes('FURTO') || nf2.includes('RUBATA') || nf2.includes('RUB')) &&
      (nf2.includes('SMARR') || nf2.includes('PERS') || nf2.includes('PERDITA') || nf2.includes('SMARRIMENTO'))
    ) || (
      nf2.includes('SOSTITU') || nf2.includes('SOS ') || nf2.startsWith('SOS')
    ) || nf2 === 'TICKET ASSISTENZA SOSTITUZIONE PER FURTO O SMARRIMENTO';
    if (isFurtoSmarrimento2) {
      return res.json({
        nomeForm: config.NomeForm,
        pulsanti: ['ATTESA MODULO', 'RIFIUTA', 'SIM SOSTITUITA'],
        statoTarget: JSON.stringify({
          'ATTESA MODULO': 'ATTESA_MODULO',
          'RIFIUTA': '2',
          'SIM SOSTITUITA': 'SIM_SOSTITUITA'
        }),
        descrizione: 'Configurazione forzata: sostituzione SIM per furto o smarrimento'
      });
    }

    // Parse dei pulsanti da stringa JSON
    let pulsanti = [];
    try {
      pulsanti = JSON.parse(config.Pulsanti);
    } catch (e) {
      console.error('[DEBUG][PULSANTI] Errore parsing JSON pulsanti:', e);
      return res.status(500).json({ error: 'Errore nella configurazione pulsanti' });
    }
    
    res.json({
      nomeForm: config.NomeForm,
      pulsanti: pulsanti,
      statoTarget: config.StatoTarget,
      descrizione: config.Descrizione
    });
    
  } catch (err) {
    console.error('[DEBUG][PULSANTI] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero configurazione pulsanti', details: err.message });
  }
});

// Endpoint: CAMBIO STATO ATTIVAZIONE (MASTER) - AGGIORNATO PER PULSANTI DINAMICI
app.post('/api/master/attivazione/:id/stato', authenticateToken, onlyMaster, express.json({ limit: '50mb' }), async (req, res) => {
  console.log('DEBUG: DENTRO LA ROUTE CAMBIO STATO');
  
  await getPool();
  const id = req.params.id;
  // Accetta sia 'nuovoStato' (nuovo backend) sia 'stato' (payload frontend precedente)
  const { nuovoStato, stato, nota, pulsanteCliccato } = req.body;
  // Normalizza: se mancante/empty -> 0
  const rawState = (nuovoStato !== undefined && nuovoStato !== null && String(nuovoStato).trim() !== '')
    ? nuovoStato
    : ((stato !== undefined && stato !== null && String(stato).trim() !== '') ? stato : 0);
  
  console.log('[DEBUG][CAMBIO STATO] ID:', id, 'Raw Stato:', rawState, 'Pulsante:', pulsanteCliccato);
  
  // 🗂️ MAPPATURA STATI STRINGA → NUMERICI per pulsanti assistenza
  const statoStringToNumber = {
    // Stati base (già numerici)
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    // Stati assistenza stringa → numero (aggiornato con ID corretti)
    'ATTESA_MODULO': 10,
    'SIM_SOSTITUITA': 11, 
    'CLIENTE_ACQUISIBILE': 12,
    'CLIENTE_NON_ACQUISIBILE': 24, // ID aggiornato
    'IN_LAVORAZIONE': 13,
    'GESTITO_CON_NOTA': 14,
    'TICKET_IN_LAVORAZIONE': 25, // ID aggiornato
    'TICKET_GESTITO_CON_NOTA': 26, // ID aggiornato
    'RILANCIO_ESEGUITO': 15,
    'ATTESA_INTEGRAZIONE': 3,
    'RESET_ESEGUITO': 16,
    'RESET_IN_GESTIONE': 17,
    'ORDINE_SBLOCCATO': 18,
    'RICONTATTO_PRENOTATO': 19,
    'SUBENTRO_EFFETTUATO': 27 // ID aggiornato
  };
  
  // Converti stato stringa in numero se necessario
  let statoFinale;
  if (typeof rawState === 'string' && statoStringToNumber.hasOwnProperty(rawState)) {
    statoFinale = statoStringToNumber[rawState];
    console.log(`[DEBUG][MAPPATURA] Stato stringa '${rawState}' → numero ${statoFinale}`);
  } else {
    // Se è stringa vuota/mancante, statoFinale diventa 0; altrimenti prova a convertire in numero
    const s = (rawState === undefined || rawState === null) ? 0 : rawState;
    statoFinale = Number(s);
  }
  
  // Validazione stati: supporta tutti gli stati 0-31 (base + assistenza + nuovi stati)
  if (isNaN(statoFinale) || statoFinale < 0 || statoFinale > 31) {
    return res.status(400).json({ error: `Stato non valido: '${rawState}'. Deve essere compreso tra 0 e 31 o uno stato stringa valido.` });
  }

  // Nota obbligatoria per stati 2 (RIFIUTATO) e 3 (ATTESA_INTEGRAZIONE)
  if ((statoFinale === 2 || statoFinale === 3)) {
    const hasNote = typeof nota === 'string' && nota.trim().length > 0;
    if (!hasNote) {
      return res.status(400).json({ error: 'La nota è obbligatoria per questo stato', requiredFor: [2, 3] });
    }
  }
  
  try {
    // Recupera stato precedente
    const prevRes = await (await getRequest())
      .input('id', sql.Int, id)
      .query(`SELECT Stato FROM dbo.tbOrdini WHERE IDOrdine = @id`);
    
    if (!prevRes.recordset || prevRes.recordset.length === 0) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    
    const statoPrecedente = prevRes.recordset[0].Stato;
    
    // Aggiorna stato e nota
    await (await getRequest())
      .input('stato', sql.Int, statoFinale)
      .input('nota', sql.NVarChar, nota || '')
      .input('id', sql.Int, id)
      .query(`UPDATE dbo.tbOrdini SET Stato = @stato, NoteDealer = @nota WHERE IDOrdine = @id`);
    
    console.log(`[DEBUG][UPDATE] Stato aggiornato: ${nuovoStato} → ${statoFinale}`);
    
    console.log('[DEBUG][STORICO] Cambio stato:', statoPrecedente, '->', statoFinale, 'per ordine', id);

    const { masterId, masterEmail, ipAddress, userAgent } = extractMasterContext(req);
    try {
      const logReq = await getRequest();
      logReq.input('MasterId', sql.Int, masterId || null);
      logReq.input('MasterEmail', sql.NVarChar(255), masterEmail);
      logReq.input('OrdineId', sql.Int, id);
      logReq.input('NuovoStato', sql.Int, statoFinale);
      logReq.input('NotaStorico', sql.NVarChar(sql.MAX), nota || '');
      logReq.input('Motivazione', sql.NVarChar(400), req.body?.motivazione || null);
      logReq.input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify({ action: 'CAMBIO_STATO', rawState, pulsanteCliccato }) || null);
      logReq.input('IpAddress', sql.VarChar(45), ipAddress);
      logReq.input('UserAgent', sql.NVarChar(600), userAgent);
      const azione = statoFinale === 1 ? 'APPROVE' : (statoFinale === 2 ? 'REJECT' : 'CHANGE_STATUS');
      logReq.input('Azione', sql.VarChar(50), azione);
      await logReq.execute('dbo.sp_master_update_attivazione');
    } catch (logErr) {
      console.warn('[MASTER][ATTIVAZIONI][LOG] fallita:', logErr?.message || logErr);
    }
    
    // Rimborso plafond su annullamento ordine (stato = 2)
    try {
      if (Number(statoFinale) === 2) {
        // 1) Calcola totale addebiti (crediti negativi) registrati per questo ordine
        const addebitiRes = await (await getRequest())
          .input('id', sql.Int, id)
          .query(`
            SELECT 
              SUM(CASE WHEN Crediti < 0 THEN Crediti ELSE 0 END) AS DebitoTot,
              MAX(idDealer) AS idDealer
            FROM dbo.tbTransazioni
            WHERE Riferimento = @id
          `);
        const debitoTot = Math.abs(Number(addebitiRes.recordset?.[0]?.DebitoTot || 0));
        const idDealerTrans = addebitiRes.recordset?.[0]?.idDealer || null;

        if (debitoTot > 0 && idDealerTrans) {
          // 2) Verifica rimborsi già effettuati per evitare duplicazioni
          const rimborsiRes = await (await getRequest())
            .input('id', sql.Int, id)
            .query(`
              SELECT 
                SUM(CASE WHEN Crediti > 0 THEN Crediti ELSE 0 END) AS RimborsoTot
              FROM dbo.tbTransazioni
              WHERE Riferimento = @id 
                AND (Fonte = 'RIMBORSO_ANNULLAMENTO' OR Descrizione LIKE '%Rimborso%Annullamento%')
            `);
          const rimborsoGia = Number(rimborsiRes.recordset?.[0]?.RimborsoTot || 0);
          const daRimborsare = debitoTot - rimborsoGia;

          if (daRimborsare > 0.0001) {
            // 3) Recupera titolo offerta per descrizione
            let offertaTitolo = '';
            try {
              const offertaRes = await (await getRequest())
                .input('id', sql.Int, id)
                .query(`
                  SELECT TOP 1 off.Titolo AS OffertaTitolo
                  FROM dbo.tbOrdini o
                  INNER JOIN dbo.tbOfferte off ON o.idOfferta = off.IDOfferta
                  WHERE o.IDOrdine = @id
                `);
              offertaTitolo = offertaRes.recordset?.[0]?.OffertaTitolo || '';
            } catch {}

            const descr = `Rimborso su annullamento - Ordine ${id}${offertaTitolo ? ' - ' + offertaTitolo : ''} (€. ${daRimborsare.toFixed(2)})`;

            // 4) Inserisci rimborso positivo in tbTransazioni
            await (await getRequest())
              .input('Descrizione', sql.NVarChar, descr)
              .input('idDealer', sql.Int, idDealerTrans)
              .input('Crediti', sql.Decimal(12, 2), Number(daRimborsare.toFixed(2)))
              .input('Note', sql.NVarChar, nota || '')
              .input('Riferimento', sql.Int, id)
              .query(`
                INSERT INTO dbo.tbTransazioni 
                  (Descrizione, idDealer, Crediti, DataOra, idAgente, Fonte, Payload, Note, Riferimento)
                VALUES 
                  (@Descrizione, @idDealer, @Crediti, GETDATE(), NULL, 'RIMBORSO_ANNULLAMENTO', NULL, @Note, @Riferimento)
              `);
            console.log('[DEBUG][RIMBORSO] Inserito rimborso annullamento per ordine', id, 'dealer', idDealerTrans, 'importo', daRimborsare);
          } else {
            console.log('[DEBUG][RIMBORSO] Nessun rimborso necessario (gia\' coperto) per ordine', id);
          }
        } else {
          console.log('[DEBUG][RIMBORSO] Nessun addebito da rimborsare per ordine', id);
        }
      }
    } catch (refundErr) {
      console.error('[DEBUG][RIMBORSO] Errore rimborso annullamento:', refundErr);
      // Non bloccare il cambio stato per errori di rimborso; valutare alert/monitoring separato
    }
    
    // INVIO EMAIL AUTOMATICO per il nuovo stato
    try {
      console.log('[DEBUG][EMAIL] Recupero template per stato:', statoFinale);
      
      let emailTemplateRes;
      let useNewTemplate = false;
      
      // CASO SPECIALE: Stato 1 (Accetta) - usa template ATTIVAZIONE_CONFERMATA da tbEmailTemplates
      if (statoFinale === 1) {
        console.log('[DEBUG][EMAIL] Stato 1 - usando template ATTIVAZIONE_CONFERMATA');
        emailTemplateRes = await new sql.Request()
          .input('eventType', sql.NVarChar, 'ATTIVAZIONE_CONFERMATA')
          .query(`
            SELECT 
              EventType as StatoEsteso,
              1 as Notifica,
              Subject as MailSubject,
              HtmlTemplate as MailTemplate,
              Recipients as ForceTO,
              CCN
            FROM dbo.tbEmailTemplates 
            WHERE EventType = @eventType AND IsActive = 1
          `);
        useNewTemplate = true;
      } else {
        // Logica originale per altri stati
        emailTemplateRes = await new sql.Request()
          .input('stato', sql.Int, statoFinale)
          .query(`
            SELECT 
              StatoEsteso,
              Notifica,
              MailSubject,
              MailTemplate,
              ForceTO,
              CCN
            FROM dbo.tbStatiOrdini 
            WHERE IDStato = @stato AND Notifica = 1
          `);
      }
      
      if (emailTemplateRes.recordset.length > 0) {
        const template = emailTemplateRes.recordset[0];
        console.log('[DEBUG][EMAIL] Template trovato:', template.StatoEsteso);
        
        // Recupera dati ordine e dealer per personalizzare email
        const ordineRes = await new sql.Request()
          .input('id', sql.Int, id)
          .query(`
            SELECT 
              o.IDOrdine,
              o.idDealer,
              o.DataOra,
              o.NoteDealer,
              d.RecapitoEmail as DealerEmail,
              d.RagioneSociale as DealerNome,
              offerta.Titolo as OffertaTitolo,
              ISNULL(agente.Nome + ' ' + agente.Cognome, 'Sistema') as Operatore
            FROM dbo.tbOrdini o
            INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
            INNER JOIN dbo.tbOfferte offerta ON o.idOfferta = offerta.IDOfferta
            LEFT JOIN dbo.tbAgenti agente ON o.idAgente = agente.IDAgente
            WHERE o.IDOrdine = @id
          `);
        
        if (ordineRes.recordset.length > 0) {
          const ordine = ordineRes.recordset[0];
          console.log('[DEBUG][EMAIL] Dati ordine recuperati per dealer:', ordine.DealerEmail);
          
          // Recupera e corregge dati intestatario per template ATTIVAZIONE_CONFERMATA
          if (useNewTemplate && statoFinale === 1) {
            // Recupera dati intestatario da tbDatiIntestario
            let clienteNome = '', clienteCognome = '';
            try {
              const intestatarioRes = await new sql.Request()
                .input('ordineId', sql.Int, id)
                .query(`
                  SELECT TOP 1 Payload 
                  FROM dbo.tbDatiIntestario 
                  WHERE IDOrdine = @ordineId
                `);
              
              if (intestatarioRes.recordset.length > 0 && intestatarioRes.recordset[0].Payload) {
                const payload = JSON.parse(intestatarioRes.recordset[0].Payload);
                console.log('[DEBUG][EMAIL] Payload intestatario:', payload);
                
                // Cerca i campi nome e cognome nel payload (possibili varianti)
                // Prima controlla se c'è il campo combinato NOME_E_COGNOME_INTESTATARIO_CONTRATTO
                const nomeCompleto = payload.NOME_E_COGNOME_INTESTATARIO_CONTRATTO || 
                                   payload.nome_e_cognome_intestatario_contratto || 
                                   payload.NOME_COMPLETO || payload.nome_completo || '';
                
                if (nomeCompleto && nomeCompleto.trim()) {
                  // Dividi nome completo in nome e cognome
                  const parti = nomeCompleto.trim().split(' ');
                  if (parti.length >= 2) {
                    clienteNome = parti[0];
                    clienteCognome = parti.slice(1).join(' '); // Tutto il resto come cognome
                  } else {
                    clienteNome = nomeCompleto;
                    clienteCognome = '';
                  }
                } else {
                  // Fallback: cerca campi separati
                  clienteNome = payload.nome || payload.NOME || payload.Nome || 
                               payload.nome_intestatario || payload.NOME_INTESTATARIO || '';
                  clienteCognome = payload.cognome || payload.COGNOME || payload.Cognome || 
                                  payload.cognome_intestatario || payload.COGNOME_INTESTATARIO || '';
                }
              }
            } catch (intestatarioErr) {
              console.log('[DEBUG][EMAIL] Errore recupero dati intestatario:', intestatarioErr.message);
            }
            
            // Gestione valori di fallback per intestatario
            if (!clienteNome || clienteNome.trim() === '') {
              clienteNome = 'Intestatario';
            }
            if (!clienteCognome || clienteCognome.trim() === '') {
              clienteCognome = 'Contratto';
            }
            
            // Aggiungi i dati corretti all'oggetto ordine
            ordine.ClienteNome = clienteNome;
            ordine.ClienteCognome = clienteCognome;
            
            console.log('[DEBUG][EMAIL] Dati corretti - Intestatario:', clienteNome, clienteCognome);
          }
          
          // Personalizza template email
          let subject, body;
          
          if (useNewTemplate && statoFinale === 1) {
            // Template NUOVA_ATTIVAZIONE - placeholder specifici
            const dataFormattata = new Date(ordine.DataOra).toLocaleDateString('it-IT');
            
            subject = template.MailSubject
              .replace(/{{IDORDINE}}/g, ordine.IDOrdine)
              .replace(/{{OFFERTATITOLO}}/g, ordine.OffertaTitolo);
            
            body = template.MailTemplate
              .replace(/{{IDORDINE}}/g, ordine.IDOrdine)
              .replace(/{{DEALERNOME}}/g, ordine.DealerNome)
              .replace(/{{OFFERTATITOLO}}/g, ordine.OffertaTitolo)
              .replace(/{{CLIENTENOME}}/g, ordine.ClienteNome)
              .replace(/{{CLIENTECOGNOME}}/g, ordine.ClienteCognome)
              .replace(/{{DATE}}/g, dataFormattata)
              .replace(/{{NOTEDEALER}}/g, (typeof nota !== 'undefined' ? nota : (ordine.NoteDealer || 'Nessuna nota aggiuntiva')));

            // Se il template non prevede {{NOTEDEALER}}, appende una sezione Note se presente
            if (!/{{NOTEDEALER}}/.test(template.MailTemplate)) {
              const noteValue = (typeof nota !== 'undefined' ? nota : (ordine.NoteDealer || '')).trim();
              if (noteValue) {
                body += `\n\n<p><strong>Note:</strong> ${noteValue.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
              }
            }
          } else {
            // Template originale da tbStatiOrdini
            subject = template.MailSubject
              .replace(/{{IDORDINE}}/g, ordine.IDOrdine)
              .replace(/{{OFFERTA}}/g, ordine.OffertaTitolo);
            
            body = template.MailTemplate
              .replace(/{{IDORDINE}}/g, ordine.IDOrdine)
              .replace(/{{OFFERTA}}/g, ordine.OffertaTitolo)
              .replace(/{{NOTEDEALER}}/g, nota || 'Nessuna nota aggiuntiva');
          }
          
          // Configura destinatari
          let toEmail = template.ForceTO || ordine.DealerEmail;
          const ccnEmail = template.CCN;
          
          // MODALITÀ TEST: Se attiva, invia solo a EMAIL_TEST_RECIPIENT
          if (process.env.EMAIL_TEST_MODE === 'true') {
            console.log('[DEBUG][EMAIL] MODALITÀ TEST ATTIVA - Email originale:', toEmail);
            toEmail = process.env.EMAIL_TEST_RECIPIENT || 'comunicazioni@kimweb.it';
            console.log('[DEBUG][EMAIL] Email reindirizzata a:', toEmail);
          }
          
          console.log('[DEBUG][EMAIL] Invio a:', toEmail, 'CCN:', ccnEmail);
          console.log('[DEBUG][EMAIL] Subject:', subject);
          
          // Configura mailOptions base
          const mailOptions = {
            from: process.env.SMTP_FROM || 'kimstation.noreply@kimweb.agency',
            to: toEmail,
            subject: subject,
            html: body
          };
          
          // In modalità test, non inviare CCN per evitare confusione
          if (ccnEmail && process.env.EMAIL_TEST_MODE !== 'true') {
            mailOptions.bcc = ccnEmail;
          }
          
          // ALLEGATO PDA per template ATTIVAZIONE_CONFERMATA
          if (useNewTemplate && statoFinale === 1) {
            try {
              // Recupera file PDA dalla tabella tbFileOrdine (con Payload per S3)
              const pdaRes = await new sql.Request()
                .input('ordineId', sql.Int, id)
                .query(`
                  SELECT TOP 1 NomeFile, FileUID, Payload
                  FROM dbo.tbFileOrdine 
                  WHERE IDOrdine = @ordineId AND TipoFile = 'PDA'
                `);
              
              if (pdaRes.recordset.length > 0) {
                const pdaFile = pdaRes.recordset[0];
                console.log('[DEBUG][EMAIL] File PDA trovato:', { NomeFile: pdaFile.NomeFile, Payload: pdaFile.Payload });
                
                try {
                  // Prova prima con il nuovo sistema S3 (payload JSON)
                  if (pdaFile.Payload && pdaFile.Payload !== '-') {
                    const payloadData = JSON.parse(pdaFile.Payload);
                    
                    if (payloadData.s3Url) {
                      console.log('[DEBUG][EMAIL] Scaricando PDA da S3:', payloadData.s3Url);
                      
                      try {
                        // Scarica il file da S3 (ora pubblicamente accessibile)
                        const response = await fetch(payloadData.s3Url);
                        if (response.ok) {
                          const buffer = await response.arrayBuffer();
                          
                          mailOptions.attachments = [{
                            filename: payloadData.originalName || `PDA_Ordine_${id}.pdf`,
                            content: Buffer.from(buffer),
                            contentType: 'application/pdf'
                          }];
                          console.log('[DEBUG][EMAIL] Allegato PDA da S3 aggiunto:', payloadData.originalName);
                        } else {
                          console.log('[DEBUG][EMAIL] Errore download da S3:', response.status, response.statusText);
                        }
                      } catch (fetchError) {
                        console.error('[DEBUG][EMAIL] Errore fetch S3:', fetchError);
                      }
                    }
                  } else {
                    // Fallback per file legacy (sistema vecchio)
                    const pdaPath = path.join(__dirname, 'uploads', 'pda', pdaFile.NomeFile);
                    
                    if (fs.existsSync(pdaPath)) {
                      mailOptions.attachments = [{
                        filename: `PDA_Ordine_${id}.pdf`,
                        path: pdaPath,
                        contentType: 'application/pdf'
                      }];
                      console.log('[DEBUG][EMAIL] Allegato PDA legacy aggiunto:', pdaFile.NomeFile);
                    } else {
                      console.log('[DEBUG][EMAIL] File PDA legacy non trovato:', pdaPath);
                    }
                  }
                } catch (parseErr) {
                  console.error('[DEBUG][EMAIL] Errore parsing payload PDA:', parseErr);
                  // Fallback al sistema legacy
                  const pdaPath = path.join(__dirname, 'uploads', 'pda', pdaFile.NomeFile);
                  if (fs.existsSync(pdaPath)) {
                    mailOptions.attachments = [{
                      filename: `PDA_Ordine_${id}.pdf`,
                      path: pdaPath,
                      contentType: 'application/pdf'
                    }];
                    console.log('[DEBUG][EMAIL] Allegato PDA legacy (fallback) aggiunto:', pdaFile.NomeFile);
                  }
                }
              } else {
                console.log('[DEBUG][EMAIL] Nessun file PDA trovato per ordine:', id);
              }
            } catch (pdaErr) {
              console.error('[DEBUG][EMAIL] Errore recupero PDA:', pdaErr);
              // Continua comunque con l'invio dell'email senza allegato
            }
          }
          
          // Invia email (usa il transporter già configurato)
          await transporter.sendMail(mailOptions);
          console.log('[DEBUG][EMAIL] Email inviata con successo per stato:', nuovoStato);
        }
      } else {
        console.log('[DEBUG][EMAIL] Nessun template email configurato per stato:', nuovoStato);
      }
    } catch (emailErr) {
      console.error('[DEBUG][EMAIL] Errore invio email:', emailErr);
      // Non bloccare la risposta se l'email fallisce
    }
    
    res.json({ 
      success: true, 
      message: 'Stato aggiornato con successo',
      nuovoStato: statoFinale,
      pulsanteCliccato: pulsanteCliccato || null
    });
  } catch (err) {
    console.error('[MASTER][CAMBIO STATO ORDINE] Errore:', err);
    res.status(500).json({ error: 'Errore server' });
  }
}); // <-- END /api/master/attivazione/:id/stato


// Endpoint pubblico per ottenere la chiave pubblica Stripe
app.get('/api/stripe/public-key', (req, res) => {
  res.json({ publicKey: process.env.STRIPE_PUBLIC_KEY || '' });
});

// Middleware per il parsing del body JSON (limite aumentato per evitare 413)
app.use(express.json({ limit: '50mb' }));

// Middleware per gestire la connessione al database
app.use(async (req, res, next) => {
  try {
    const isConnected = await getPool();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'Servizio non disponibile',
        message: 'Impossibile connettersi al database. Riprova più tardi.'
      });
    }
    next();
  } catch (err) {
    console.error('Errore nel middleware database:', err);
    res.status(500).json({ 
      error: 'Errore interno del server',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Endpoint per registrare richiesta ricarica plafond con bonifico
app.post('/api/ricarica-plafond-bonifico', authenticateToken, async (req, res) => {
  try {
    const { amount, userId } = req.body;
    const importo = Number(amount);
    if (![50, 100, 250, 500].includes(importo)) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    if (!Number.isInteger(dealerId) || dealerId <= 0) {
      return res.status(400).json({ error: 'dealerId mancante o non valido' });
    }
    // Non inserire nulla in tbTransazioni: la verifica bonifico è manuale
    res.json({ ok: true });
  } catch (err) {
    console.error('Errore in /api/ricarica-plafond-bonifico:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// === API per ordini con BONIFICO ===

// Configurazione avanzata per la connessione al database
// Le opzioni di connessione sono state consolidate qui
// Le variabili d'ambiente hanno la precedenza sui valori predefiniti

// Avvia il server Express sempre, senza attendere la connessione al database
const PORT = process.env.PORT || 3001;
// Connessione pool globale MSSQL UNA SOLA VOLTA all'avvio tramite db-pool.mjs
console.log('[DB] Inizializzazione pool globale MSSQL...');

try {
  await getPool(); // Usa il nuovo modulo centralizzato
  console.log('[DB] Pool MSSQL connesso con successo!');
} catch (err) {
  console.error('[FATAL] Impossibile connettersi al database. Arresto server.', err);
  process.exit(1);
}

// Endpoint per generare PDF Piano Incentivazione
app.post('/api/supermaster/generate-piano-incentivazione', authenticateToken, onlySuperMaster, async (req, res) => {
  try {
    const formData = req.body;
    
    // Validazione dati essenziali
    if (!formData.nomeCompleto || !formData.codiceAgente) {
      return res.status(400).json({ error: 'Nome completo e codice agente sono obbligatori' });
    }

    // Importa PDFLib
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    
    // Crea nuovo documento PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    
    // Font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const { width, height } = page.getSize();
    let yPosition = height - 50;
    
    // Header con gradiente simulato
    page.drawRectangle({
      x: 0,
      y: height - 120,
      width: width,
      height: 120,
      color: rgb(0.2, 0.4, 0.8),
    });
    
    // Titolo
    page.drawText('🎯 PIANO INCENTIVAZIONE', {
      x: 50,
      y: height - 70,
      size: 24,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    
    page.drawText('Piano personalizzato per agente/dealer', {
      x: 50,
      y: height - 95,
      size: 12,
      font: font,
      color: rgb(0.9, 0.9, 0.9),
    });
    
    yPosition = height - 150;
    
    // Dati Agente
    page.drawText('DATI AGENTE/DEALER', {
      x: 50,
      y: yPosition,
      size: 16,
      font: fontBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    
    yPosition -= 25;
    page.drawText(`Nome: ${formData.nomeCompleto}`, { x: 50, y: yPosition, size: 12, font: font });
    yPosition -= 20;
    page.drawText(`Codice Agente: ${formData.codiceAgente}`, { x: 50, y: yPosition, size: 12, font: font });
    yPosition -= 20;
    if (formData.email) {
      page.drawText(`Email: ${formData.email}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.telefono) {
      page.drawText(`Telefono: ${formData.telefono}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    
    // Periodo
    yPosition -= 20;
    page.drawText('PERIODO DI RIFERIMENTO', {
      x: 50,
      y: yPosition,
      size: 16,
      font: fontBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    
    yPosition -= 25;
    page.drawText(`Anno: ${formData.annoRiferimento}`, { x: 50, y: yPosition, size: 12, font: font });
    yPosition -= 20;
    page.drawText(`Periodo: ${formData.meseInizio.toString().padStart(2, '0')}/${formData.annoRiferimento} - ${formData.meseFine.toString().padStart(2, '0')}/${formData.annoRiferimento}`, { x: 50, y: yPosition, size: 12, font: font });
    
    // Obiettivi
    yPosition -= 40;
    page.drawText('OBIETTIVI MENSILI', {
      x: 50,
      y: yPosition,
      size: 16,
      font: fontBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    
    yPosition -= 25;
    if (formData.obiettivoFastwebFissi > 0) {
      page.drawText(`📶 FASTWEB Fissi: ${formData.obiettivoFastwebFissi}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.obiettivoFastwebMobili > 0) {
      page.drawText(`📱 FASTWEB Mobili: ${formData.obiettivoFastwebMobili}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.obiettivoFastwebEnergy > 0) {
      page.drawText(`🔌 FASTWEB Energy: ${formData.obiettivoFastwebEnergy}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.obiettivoSky > 0) {
      page.drawText(`📺 SKY: ${formData.obiettivoSky}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.obiettivoIliad > 0) {
      page.drawText(`📶 ILIAD: ${formData.obiettivoIliad}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    
    // Commissioni
    yPosition -= 20;
    page.drawText('COMMISSIONI BASE (€)', {
      x: 50,
      y: yPosition,
      size: 16,
      font: fontBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    
    yPosition -= 25;
    if (formData.commissioneFastwebFissi > 0) {
      page.drawText(`FASTWEB Fissi: €${formData.commissioneFastwebFissi.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.commissioneFastwebMobili > 0) {
      page.drawText(`FASTWEB Mobili: €${formData.commissioneFastwebMobili.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.commissioneFastwebEnergy > 0) {
      page.drawText(`FASTWEB Energy: €${formData.commissioneFastwebEnergy.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.commissioneSky > 0) {
      page.drawText(`SKY: €${formData.commissioneSky.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.commissioneIliad > 0) {
      page.drawText(`ILIAD: €${formData.commissioneIliad.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    
    // Bonus
    yPosition -= 20;
    page.drawText('BONUS RAGGIUNGIMENTO OBIETTIVI (€)', {
      x: 50,
      y: yPosition,
      size: 16,
      font: fontBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    
    yPosition -= 25;
    if (formData.bonusRaggiungimento50 > 0) {
      page.drawText(`🥉 50% Obiettivo: €${formData.bonusRaggiungimento50.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.bonusRaggiungimento75 > 0) {
      page.drawText(`🥈 75% Obiettivo: €${formData.bonusRaggiungimento75.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.bonusRaggiungimento100 > 0) {
      page.drawText(`🥇 100% Obiettivo: €${formData.bonusRaggiungimento100.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    if (formData.bonusRaggiungimento125 > 0) {
      page.drawText(`🏆 125% Obiettivo: €${formData.bonusRaggiungimento125.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
      yPosition -= 20;
    }
    
    // Premi Speciali
    if (formData.premioMigliorPerformance > 0 || formData.premioFedelta > 0 || formData.premioInnovazione > 0) {
      yPosition -= 20;
      page.drawText('PREMI SPECIALI (€)', {
        x: 50,
        y: yPosition,
        size: 16,
        font: fontBold,
        color: rgb(0.2, 0.4, 0.8),
      });
      
      yPosition -= 25;
      if (formData.premioMigliorPerformance > 0) {
        page.drawText(`🏅 Miglior Performance: €${formData.premioMigliorPerformance.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
        yPosition -= 20;
      }
      if (formData.premioFedelta > 0) {
        page.drawText(`💎 Premio Fedeltà: €${formData.premioFedelta.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
        yPosition -= 20;
      }
      if (formData.premioInnovazione > 0) {
        page.drawText(`🚀 Premio Innovazione: €${formData.premioInnovazione.toFixed(2)}`, { x: 50, y: yPosition, size: 12, font: font });
        yPosition -= 20;
      }
    }
    
    // Note
    if (formData.noteSpeciali || formData.condizioniParticolari) {
      yPosition -= 20;
      page.drawText('NOTE E CONDIZIONI', {
        x: 50,
        y: yPosition,
        size: 16,
        font: fontBold,
        color: rgb(0.2, 0.4, 0.8),
      });
      
      yPosition -= 25;
      if (formData.noteSpeciali) {
        page.drawText(`Note Speciali: ${formData.noteSpeciali}`, { x: 50, y: yPosition, size: 10, font: font });
        yPosition -= 15;
      }
      if (formData.condizioniParticolari) {
        page.drawText(`Condizioni: ${formData.condizioniParticolari}`, { x: 50, y: yPosition, size: 10, font: font });
        yPosition -= 15;
      }
    }
    
    // Footer
    page.drawText(`Generato il ${new Date().toLocaleDateString('it-IT')} - KIM Station`, {
      x: 50,
      y: 50,
      size: 10,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    // Genera PDF
    const pdfBytes = await pdfDoc.save();
    
    // Upload su S3
    const fileName = `piano-incentivazione-${formData.codiceAgente}-${Date.now()}.pdf`;
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `piani-incentivazione/${fileName}`,
      Body: pdfBytes,
      ContentType: 'application/pdf',
      ContentDisposition: 'inline'
    };
    
    const uploadResult = await s3.upload(uploadParams).promise();
    
    res.json({
      success: true,
      pdfUrl: uploadResult.Location,
      fileName: fileName
    });
    
  } catch (error) {
    console.error('[Piano Incentivazione] Errore generazione PDF:', error);
    res.status(500).json({ error: 'Errore nella generazione del PDF' });
  }
});

app.listen(PORT, () => {
  console.log(`[kim-back] Server listening on port ${PORT}`);
  
  // Inizializza Redis per caching
  initRedis().catch(err => {
    console.warn('⚠️  Redis non disponibile, continuo senza cache:', err.message);
  });
  
  // Test upload su entrambi i bucket all'avvio
  testS3UploadBothBuckets();
  
  // Avvia scheduler reminder WhatsApp mattutini
  import('./whatsapp-reminder.mjs').then(module => {
    module.avviaReminderSchedulato();
  }).catch(err => {
    console.error('❌ Errore avvio reminder WhatsApp:', err);
  });
});

// Endpoint ultimi ordini per dealer e agente
app.get('/api/ultimi-ordini', authenticateToken, async (req, res) => {
  try {
    const { dealerId, ruoli = [], email, agenteNome } = req.user || {};
    const isDealer = dealerId != null;
    const isAgente = ruoli.map(r => r && r.toUpperCase()).includes('AGENTE');

    if (isDealer) {
      // Dealer: ultimi 5 ordini suoi
      const result = await new sql.Request()
        .input('dealerId', sql.Int, dealerId)
        .query(`
          SELECT TOP 5 
            FORMAT(o.DataOra, 'dd/MM/yyyy') AS Data,
            ISNULL(p.NomeProdotto, 'N/A') AS Prodotto,
            ISNULL(p.TipoProdotto, '-') AS Tipo,
            o.TotaleOrdine AS Importo,
            s.StatoEsteso AS Stato
          FROM dbo.tbOrdiniProdotti o
          LEFT JOIN dbo.tbProdotti p ON o.idProdotto = p.IDProdotto
          LEFT JOIN dbo.tbStatiOrdiniProdotti s ON o.idStatoOrdineProdotto = s.IDStato
          WHERE o.idDealer = @dealerId
          ORDER BY o.DataOra DESC
        `);
      return res.json(result.recordset || []);
    } else if (isAgente && agenteNome) {
      console.log('[ULTIMI-ORDINI][DEBUG] agenteNome:', agenteNome);

      // Agente: trova i suoi dealer, poi gli ordini
      const dealersRes = await new sql.Request()
        .input('agente', sql.NVarChar, agenteNome)
        .query('SELECT IDDealer FROM tbDealers WHERE AGENTE = @agente');
      const dealerIds = dealersRes.recordset.map(r => r.IDDealer);
      console.log('[ULTIMI-ORDINI][DEBUG] dealerIds:', dealerIds);
      if (dealerIds.length === 0) return res.json([]);
      // Query ultimi ordini per agente secondo la query fornita dall'utente
      const result = await new sql.Request()
        .input('agente', sql.NVarChar, agenteNome)
        .query(`
          SELECT TOP 5 
            FORMAT(op.DataOra, 'dd.MM.yyyy') AS Data,
            d.RagioneSociale AS Dealer,
            o.Titolo AS Prodotto,
            FORMAT(op.TotaleOrdine, '''€. ''#,##0.00') AS Importo,
            so.StatoEsteso AS Stato
          FROM dbo.tbOrdiniProdotti op
          INNER JOIN dbo.tbDealers d ON op.idDealer = d.IDDealer
          INNER JOIN dbo.tbDettagliOrdiniProdotti dop ON op.IDOrdineProdotto = dop.idOrdineProdotto
          INNER JOIN dbo.tbOfferte o ON dop.idOfferta = o.IDOfferta
          INNER JOIN dbo.tbStatiOrdini so ON op.idStatoOrdineProdotto = so.IDStato
          WHERE d.AGENTE = @agente
          ORDER BY op.DataOra DESC
        `);
      return res.json(result.recordset || []);
    } else {
      // Né dealer né agente valido
      return res.status(403).json({ error: 'Dealer o agente non valido' });
    }
  } catch (err) {
    console.error('[ULTIMI-ORDINI] Errore:', err);
    if (err && err.stack) console.error('[ULTIMI-ORDINI] Stack:', err.stack);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// Endpoint pubblico per ottenere la chiave pubblica Stripe (deve essere prima di qualsiasi middleware di autenticazione!)
app.get('/api/stripe/public-key', (req, res) => {
  res.json({ publicKey: process.env.STRIPE_PUBLIC_KEY || '' });
});

// Endpoint Stripe PaymentIntent standard (compatibile frontend)
app.post('/api/stripe/create-payment-intent', express.json(), async (req, res) => {
  try {
    const { amount, userId, metodo = 'card', ordineId } = req.body;
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    // Gestione bonifico: restituisci solo dati bancari, nessun PaymentIntent
    if (metodo === 'bonifico') {
      // Aggiorna stato ordine a 21 (IN ATTESA DI BONIFICO)
      if (ordineId) {
        try {
          
          await new sql.Request()
            .input('ordineId', sql.Int, ordineId)
            .input('stato', sql.Int, 21)
            .input('statoEsteso', sql.NVarChar, 'IN ATTESA DI BONIFICO')
            .query(`UPDATE dbo.tbOrdini SET Stato = @stato, StatoEsteso = @statoEsteso WHERE IDOrdine = @ordineId`);
        } catch (e) {
          console.error('[BONIFICO][ERRORE UPDATE STATO ORDINE]', e);
        }
      }
      const iban = 'IT31Y0306915936100000061953';
      const intestatario = 'Kim s.r.l.s';
      const causale = `Ordine ${ordineId || ''} Utente ${userId}`;
      return res.json({ bonifico: true, iban, intestatario, causale });
    }
    // Metodo di pagamento: default 'card', supporta anche 'sepa_debit' se richiesto dal frontend
    const payment_method_types = metodo === 'sepa' ? ['sepa_debit'] : ['card'];
    const paymentIntent = await stripe.paymentIntents.create({
      amount: toCents(amount), // euro -> centesimi
      currency: 'eur',
      payment_method_types,
      metadata: { userId: String(userId), metodo, ordineId: ordineId || '' }
    });
    res.json({ client_secret: paymentIntent.client_secret });
  } catch (error) {
    console.error('[STRIPE] Errore creazione payment intent:', error);
    res.status(500).json({ error: 'Errore interno Stripe', details: error.message });
  }
});

// Endpoint per la ricarica plafond (solo carta di credito)
app.post('/api/ricarica-plafond', authenticateToken, async (req, res) => {
  try {
    const { amount, emailCliente } = req.body;
    const userId = req.user.id || req.user.userId; // Support both id and userId from JWT
    // Determine dealerId explicitly (prefer normalized dealerId)
    const dealerId = Number(req.user.dealerId || req.user.idDealer || userId);
    // DEBUG: log which field is used
    console.log('[DEBUG][ricarica-plafond] req.user:', req.user, 'Estratto userId:', userId, 'dealerId:', dealerId);

    // Logica unica per CARTA DI CREDITO
    console.log(`[DEBUG] Creazione PaymentIntent per ricarica plafond: Ricevuto body=${JSON.stringify(req.body)}`);

    // Validate amount and dealerId
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    if (!Number.isInteger(dealerId) || dealerId <= 0) {
      return res.status(400).json({ error: 'dealerId mancante o non valido' });
    }

    const ricParams = {
      amount: toCents(amount), // euro -> centesimi
      currency: 'eur',
      // Limita ai soli pagamenti con carta
      payment_method_types: ['card'],
      metadata: { 
        userId: String(userId),
        dealerId: String(dealerId),
        orderType: 'RIC', 
        emailCliente: emailCliente 
      }
    };
    if (emailCliente && typeof emailCliente === 'string' && emailCliente.includes('@')) {
      ricParams.receipt_email = emailCliente.trim().toLowerCase();
    }
    const paymentIntent = await stripe.paymentIntents.create(ricParams);

    res.json({ client_secret: paymentIntent.client_secret });

  } catch (error) {
    console.error('Errore durante la creazione del payment intent per ricarica:', error);
    res.status(500).json({ error: 'Errore interno del server durante la creazione del pagamento.' });
  }
});

// Endpoint Stripe PaymentIntent per pagamenti prodotti (importo libero)
app.post('/api/stripe/create-product-payment-intent', express.json(), async (req, res) => {
  try {
    const { amount, userId, dealerId: dealerIdBody, carrello, emailCliente, speseSpedizione, noteOrdine, metadata = {} } = req.body;
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'userId mancante' });
    }
    // You can add further validation for carrello, emailCliente, etc. if needed
    // Prepara un carrello "safe" solo con id e quantità
    const safeCarrello = carrello && Array.isArray(carrello)
      ? JSON.stringify(carrello.map(({ id, quantita }) => ({ id, quantita })))
      : '';
    // Costruisci un metadata solo con stringhe e campi semplici
    const safeMetadata = {
      userId: String(userId),
      emailCliente: String(emailCliente || ''),
      carrello: safeCarrello,
      speseSpedizione: typeof speseSpedizione !== 'undefined' ? String(speseSpedizione) : '0',
      noteOrdine: String(noteOrdine || ''),
      ...Object.fromEntries(
        Object.entries(metadata || {}).filter(([k, v]) => typeof v === 'string' || typeof v === 'number')
      )
    };
    // Forza orderType=PROD se non presente
    if (!safeMetadata.orderType) safeMetadata.orderType = 'PROD';
    // Tenta di ricavare dealerId anche dal JWT (Authorization: Bearer <token>)
    let jwtDealerId = null;
    try {
      const auth = req.headers?.authorization || '';
      if (auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        jwtDealerId = Number(decoded?.dealerId ?? decoded?.idDealer ?? null);
      }
    } catch (e) {
      // JWT mancante o non valido: ignora, useremo altri fallback
    }
    // Normalizza dealerId con priorità: body > JWT > userId (se numerico)
    const dealerIdNum = Number(
      (dealerIdBody ?? null) ??
      (Number.isInteger(jwtDealerId) ? jwtDealerId : null) ??
      (Number.isInteger(Number(userId)) ? Number(userId) : null)
    );
    if (Number.isInteger(dealerIdNum) && dealerIdNum > 0) {
      safeMetadata.dealerId = String(dealerIdNum);
    }
    safeMetadata.carrello = safeCarrello;

    const prodParams = {
      amount: toCents(amount),
      currency: 'eur',
      payment_method_types: ['card'],
      metadata: safeMetadata
    };
    if (emailCliente && typeof emailCliente === 'string' && emailCliente.includes('@')) {
      prodParams.receipt_email = emailCliente.trim().toLowerCase();
    }
    const paymentIntent = await stripe.paymentIntents.create(prodParams);
    res.json({ client_secret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Errore creazione PaymentIntent prodotto:', err);
    res.status(500).json({ error: 'Errore server Stripe' });
  }
});

// Endpoint Stripe PaymentIntent per pagamenti carrello ecommerce (importo libero)
app.post('/api/stripe/cart-payment-intent', express.json(), async (req, res) => {
  try {
    const { amount, userId, orderToken } = req.body;
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'userId mancante' });
    }
    // Recupera emailCliente dal pre-ordine se disponibile
    let emailCliente = '';
    try {
      const dbName = getDbName();
      const tempRes = await new sql.Request()
        .input('OrderToken', sql.NVarChar(64), orderToken)
        .query(`SELECT TOP 1 EmailCliente FROM [${dbName}].dbo.tbOrdiniTemp WHERE OrderToken = @OrderToken`);
      if (tempRes.recordset.length > 0) {
        emailCliente = tempRes.recordset[0].EmailCliente || '';
      }
    } catch (lookupErr) {
      console.warn('[STRIPE][cart-payment-intent] Impossibile recuperare EmailCliente per token', orderToken, lookupErr);
    }
    const cartParams = {
      amount: toCents(amount),
      currency: 'eur',
      payment_method_types: ['card'],
      metadata: {
        userId: String(userId),
        orderToken,
        emailCliente: emailCliente || ''
      }
    };
    if (emailCliente && typeof emailCliente === 'string' && emailCliente.includes('@')) {
      cartParams.receipt_email = emailCliente.trim().toLowerCase();
    }
    const paymentIntent = await stripe.paymentIntents.create(cartParams);
    res.json({ client_secret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Errore creazione PaymentIntent carrello:', err);
    res.status(500).json({ error: 'Errore server Stripe' });
  }
});

// Endpoint per salvataggio pre-ordine temporaneo
app.post('/api/order/pre-save', express.json(), async (req, res) => {
  try {
    const { orderToken, userId, emailCliente, carrello } = req.body;
    if (!orderToken || !userId || !carrello) {
      return res.status(400).json({ error: 'orderToken, userId, carrello sono obbligatori' });
    }
    
    await new sql.Request()
      .input('OrderToken', sql.NVarChar(64), orderToken)
      .input('UserId', sql.Int, userId)
      .input('EmailCliente', sql.NVarChar(255), emailCliente || '')
      .input('Carrello', sql.NVarChar(sql.MAX), carrello)
      .query(`INSERT INTO dbo.tbOrdiniTemp (OrderToken, UserId, EmailCliente, Carrello) VALUES (@OrderToken, @UserId, @EmailCliente, @Carrello)`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PRE-SAVE ERROR]', err);
    res.status(500).json({ error: 'Errore nel salvataggio pre-ordine' });
  }
});

// Endpoint richiesta bonifico (solo log)
app.post('/api/bonifico-request', express.json(), (req, res) => {
  const { amount, userId } = req.body;
  console.log('Richiesta bonifico:', { amount, userId });
  res.json({ ok: true });
});

// Endpoint di test semplice
app.get('/api/test', (req, res) => {
  res.json({ status: 'ok', message: 'Il server è in esecuzione' });
});

// Endpoint per creare payment intent per ordini prodotti (con supporto bonifico)
app.post('/api/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { amount, metodo = 'card', carrello, speseSpedizione, emailCliente, noteOrdine } = req.body;
    // Preferisci dealerId (INT) per gli ordini prodotti
    const dealerId = Number(req.user.dealerId || req.user.userId);
    
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    
    if (!Number.isInteger(dealerId) || dealerId <= 0) {
      return res.status(400).json({ error: 'dealerId mancante o non valido' });
    }
    
    // Gestione bonifico per ordini prodotti
    if (metodo === 'bonifico') {
      try {
        const dbName = getDbName();
        
        // Inserisci ordine prodotto con stato "IN ATTESA DI BONIFICO"
        // amount arriva in centesimi dal frontend → converti in EURO con 2 decimali
        const totaleOrdineEuro = Number((Number(amount) / 100).toFixed(2));
        // Per evitare doppio conteggio nel widget MasterProdotti (che somma Totale + Spedizione)
        // salviamo SpeseSpedizione = 0, dato che TotaleOrdine include già la spedizione inviata dal frontend
        const speseSpedizioneEuro = 0;
        
        const result = await new sql.Request()
          .input('idDealer', sql.Int, dealerId)
          .input('DataOra', sql.DateTime, new Date())
          .input('OrdineDA', sql.NVarChar, emailCliente || 'WEB')
          .input('SpeseSpedizione', sql.Decimal(10, 2), speseSpedizioneEuro)
          .input('TotaleOrdine', sql.Decimal(10, 2), totaleOrdineEuro)
          .input('Payload', sql.Text, `Bonifico - Email: ${emailCliente}`)
          .input('idStatoOrdineProdotto', sql.Int, 21) // IN ATTESA DI BONIFICO
          .input('NoteOrdine', sql.Text, noteOrdine || '')
          .input('OrdineDaAgente', sql.Bit, false)
          .input('DataStato', sql.DateTime, new Date())
          .input('Note4Dealer', sql.Text, '')
          .input('NoteInterne', sql.Text, '')
          .query(`
            INSERT INTO [${dbName}].dbo.tbOrdiniProdotti 
            (idDealer, DataOra, OrdineDA, SpeseSpedizione, TotaleOrdine, Payload, idStatoOrdineProdotto, NoteOrdine, OrdineDaAgente, DataStato, stato_spedizione, Note4Dealer, NoteInterne)
            OUTPUT INSERTED.IDOrdineProdotto
            VALUES (@idDealer, @DataOra, @OrdineDA, @SpeseSpedizione, @TotaleOrdine, @Payload, @idStatoOrdineProdotto, @NoteOrdine, @OrdineDaAgente, @DataStato, 'Non Spedito', @Note4Dealer, @NoteInterne)
          `);
        
        const idOrdineProdotto = result.recordset[0].IDOrdineProdotto;
        
        // Inserisci dettagli prodotti se presenti (parsing sicuro e valori di default)
        let contains446_bf = false;
        if (carrello) {
          let carrelloArray = [];
          try {
            carrelloArray = Array.isArray(carrello) ? carrello : JSON.parse(carrello || '[]');
          } catch (e) {
            console.warn('[BONIFICO] carrello JSON non valido, nessun dettaglio prodotto inserito');
            carrelloArray = [];
          }
          for (const prodotto of carrelloArray) {
            const idOfferta = Number(prodotto?.id);
            const quantita = Number(prodotto?.quantita) || 1;

            if (!Number.isInteger(idOfferta) || idOfferta <= 0) {
              console.warn('[BONIFICO] idOfferta non valido, item saltato:', prodotto);
              continue;
            }
            
            // Recupera prezzo da tbOfferte
            const offertaRes = await new sql.Request()
              .input('idOfferta', sql.Int, idOfferta)
              .query(`SELECT Crediti, SIMTYPE, SIMCOUNT FROM [${dbName}].dbo.tbOfferte WHERE IDOfferta = @idOfferta`);
            
            if (offertaRes.recordset.length > 0) {
              const offerta = offertaRes.recordset[0];
              const costoUnitario = offerta.Crediti || 0; // valore in centesimi
              let costoUnitarioEuro = Number((costoUnitario / 100).toFixed(2));
              const simType = offerta.SIMTYPE || null;
              const simCount = offerta.SIMCOUNT || 0;
              // Speciale OFFERTA 446: validazione codice personalizzato e sconto 3%
              if (idOfferta === 446) {
                contains446_bf = true;
                const code = (prodotto?.customCode || '').toString().trim();
                const valid = /^cim-flora-kim-d\d{1,3}$/.test(code);
                if (!valid) {
                  try {
                    await new sql.Request()
                      .input('idOrdineProdotto', sql.Int, idOrdineProdotto)
                      .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET NoteOrdine = CONCAT(ISNULL(NoteOrdine,''), CASE WHEN LEN(ISNULL(NoteOrdine,''))>0 THEN ' | ' ELSE '' END, 'OFFERTA 446: codice mancante/invalid') WHERE IDOrdineProdotto = @idOrdineProdotto`);
                  } catch (noteErr) {
                    console.warn('[BONIFICO][446] Append nota fallita:', noteErr?.message || noteErr);
                  }
                  // salta inserimento riga per codice non valido
                  continue;
                }
                // sconto 3%
                costoUnitarioEuro = Number((costoUnitarioEuro * 0.97).toFixed(2));
                try {
                  await new sql.Request()
                    .input('idOrdineProdotto', sql.Int, idOrdineProdotto)
                    .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET NoteOrdine = CONCAT(ISNULL(NoteOrdine,''), CASE WHEN LEN(ISNULL(NoteOrdine,''))>0 THEN ' | ' ELSE '' END, 'OFFERTA 446 CODE: ${'' + code.replace(/'/g, "''")}') WHERE IDOrdineProdotto = @idOrdineProdotto`);
                } catch (noteErr) {
                  console.warn('[BONIFICO][446] Append codice in nota fallita:', noteErr?.message || noteErr);
                }
              }
              
              await new sql.Request()
                .input('idOrdineProdotto', sql.Int, idOrdineProdotto)
                .input('idOfferta', sql.Int, idOfferta)
                .input('quantita', sql.Int, quantita)
                .input('costoUnitario', sql.Decimal(10, 2), costoUnitarioEuro)
                .input('simType', sql.NVarChar, simType)
                .input('simCount', sql.Int, simCount)
                .query(`
                  INSERT INTO [${dbName}].dbo.tbDettagliOrdiniProdotti
                    (idOrdineProdotto, idOfferta, Quantita, CostoUnitario, SIMTYPE, SIMCOUNT)
                  VALUES
                    (@idOrdineProdotto, @idOfferta, @quantita, @costoUnitario, @simType, @simCount)
                `);
            }
          }
        }
        // Se tra i dettagli è presente l'offerta 446, imposta stato spedizione iniziale a 25 (DA RICARICARE)
        if (contains446_bf) {
          try {
            await new sql.Request()
              .input('id', sql.Int, idOrdineProdotto)
              .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET idStatoSpedizione = 25, stato_spedizione = 'DA RICARICARE', DataStato = GETDATE() WHERE IDOrdineProdotto = @id`);
          } catch (e) {
            try {
              await new sql.Request()
                .input('id', sql.Int, idOrdineProdotto)
                .query(`UPDATE [${dbName}].dbo.tbOrdiniProdotti SET stato_spedizione = 'DA RICARICARE', DataStato = GETDATE() WHERE IDOrdineProdotto = @id`);
            } catch (e2) {
              console.warn('[BONIFICO][446] Update stato_spedizione iniziale fallito:', e2?.message || e2);
            }
          }
        }
        
        console.log(`[BONIFICO] Ordine prodotto creato: ${idOrdineProdotto} per dealer ${dealerId}`);
        
        // Invia email con dati bonifico
        try {
          await emailService.sendProductOrderEmail('ORDINE_PRODOTTO_BONIFICO', idOrdineProdotto, {
            paymentMethod: 'bonifico',
            emailCliente: emailCliente
          });
          console.log(`[EMAIL] Email bonifico inviata per ordine ${idOrdineProdotto}`);
        } catch (emailError) {
          console.error('[EMAIL] Errore invio email bonifico:', emailError);
        }
        
        // Restituisci dati bancari
        const iban = 'IT31Y0306915936100000061953';
        const intestatario = 'Kim s.r.l.s';
        const causale = `Ordine Prodotti ${idOrdineProdotto} Dealer ${dealerId}`;
        
        return res.json({ bonifico: true, iban, intestatario, causale, ordineId: idOrdineProdotto });
        
      } catch (error) {
        console.error('[BONIFICO] Errore creazione ordine:', error);
        return res.status(500).json({ error: 'Errore nella creazione dell\'ordine bonifico' });
      }
    }
    
    // Per altri metodi di pagamento (Stripe), crea PaymentIntent normale
    const ordParams = {
      amount: toCents(amount),
      currency: 'eur',
      payment_method_types: ['card'],
      metadata: {
        dealerId: dealerId.toString(),
        carrello: carrello || '[]',
        speseSpedizione: (speseSpedizione || 0).toString(),
        emailCliente: emailCliente || '',
        noteOrdine: noteOrdine || '',
        orderType: 'ORD'
      }
    };
    if (emailCliente && typeof emailCliente === 'string' && emailCliente.includes('@')) {
      ordParams.receipt_email = emailCliente.trim().toLowerCase();
    }
    const paymentIntent = await stripe.paymentIntents.create(ordParams);
    
    res.json({ client_secret: paymentIntent.client_secret });
    
  } catch (error) {
    console.error('[CREATE-PAYMENT-INTENT] Errore:', error);
    res.status(500).json({ error: 'Errore nella creazione del payment intent' });
  }
});

// Endpoint legacy per la dashboard: reindirizza ai router appropriati in base al ruolo
app.use('/api/ultime-attivazioni', (req, res, next) => {
  console.log(`[PRE-AUTH LOG] Richiesta ricevuta per /api/ultime-attivazioni. Reindirizzamento al router appropriato.`);
  next();
});

app.get('/api/ultime-attivazioni', authenticateToken, (req, res) => {
  console.log(`[DEBUG] Richiesta a /api/ultime-attivazioni da utente con ruoli:`, req.user.ruoli);
  
  // Reindirizza in base al ruolo
  if (req.user.ruoli && req.user.ruoli.includes('Agente')) {
    return res.redirect(307, `/api/agente/ultime-attivazioni${req._parsedUrl.search || ''}`);
  } else if (req.user.ruoli && req.user.ruoli.includes('Dealer')) {
    return res.redirect(307, `/api/dealer/ultime-attivazioni${req._parsedUrl.search || ''}`);
  }
  return res.status(403).json({ error: 'Ruolo non supportato' });
});

// Endpoint per le statistiche agente - Spostato in /api/agente/statistiche
app.get('/api/statistiche-agente', authenticateToken, async (req, res) => {
  try {
    const { anno, mese } = req.query;
    
    // Crea la connessione al database
    const pool = sql;
    const request = pool.request();
    
    let query = `
      SELECT 
        Operatore, 
        COUNT(*) as TotaleOrdini,
        SUM(CASE WHEN Stato = 'Completato' THEN 1 ELSE 0 END) as OrdiniCompletati
      FROM dbo.tbOrdini
      WHERE 1=1`;

    // Aggiungi filtri in base ai parametri
    if (anno) {
      query += ` AND YEAR(DataInserimento) = @anno`;
      request.input('anno', sql.Int, parseInt(anno));
    }
    if (mese) {
      query += ` AND MONTH(DataInserimento) = @mese`;
      request.input('mese', sql.Int, parseInt(mese));
    }

    query += ` GROUP BY Operatore ORDER BY TotaleOrdini DESC`;
    
    const result = await request.query(query);
    
    if (result.recordset && result.recordset.length > 0) {
      res.json(result.recordset);
    } else {
      console.log('Nessun dato trovato per i criteri specificati');
      res.json([]);
    }
  } catch (err) {
    console.error('Errore in /api/statistiche-agente:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ 
      error: 'Errore del server', 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Endpoint debug: recupera l'ultimo payment_intent da Stripe e il relativo payload dal DB
app.get('/api/stripe/ultimo-payload', authenticateToken, async (req, res) => {
  try {
    try {
      const transactions = await stripe.balanceTransactions.list({ limit: 10 });
      // Trova la prima transazione di tipo 'charge'
      const lastCharge = transactions.data.find(tx => tx.type === 'charge');
      if (!lastCharge) return res.status(404).json({ error: 'Nessuna transazione di tipo charge trovata' });

      let paymentIntentId = lastCharge.payment_intent;
      // Se non c'è direttamente, recupera la charge e prendi il payment_intent
      if (!paymentIntentId && lastCharge.source && lastCharge.source.startsWith('ch_')) {
        const charge = await stripe.charges.retrieve(lastCharge.source);
        paymentIntentId = charge.payment_intent;
      }
      if (!paymentIntentId) return res.status(404).json({ error: 'Payment intent non trovato' });

      // Recupera il payload da Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      // Recupera il payload dal DB
      await getPool();
      const dbRes = await (await getRequest()).query`SELECT TOP 1 * FROM dbo.tbTransazioni WHERE Payload LIKE '%${paymentIntentId}%' ORDER BY idTransazione DESC`;
      const dbPayload = dbRes.recordset.length > 0 ? dbRes.recordset[0].Payload : null;

      res.json({
        payment_intent_id: paymentIntentId,
        stripe_payload: paymentIntent,
        db_payload: dbPayload
      });
    } catch (err) {
      // Debug per errori Stripe
      if (err && err.type === 'StripeAuthenticationError') {
        console.error('[STRIPE][AUTH] Errore autenticazione Stripe:', err.message);
        return res.status(500).json({ error: 'Errore autenticazione Stripe: controlla la chiave e l’ambiente', details: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint movimenti Stripe
app.get('/api/stripe/movimenti', authenticateToken, async (req, res) => {
  try {
    await getPool();
    // Parametri di query per limitare il carico
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;
    const rawDays = Number(req.query.days);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : null;
    const params = { limit };
    if (days) {
      const nowSec = Math.floor(Date.now() / 1000);
      params.created = { gte: nowSec - Math.floor(days * 24 * 60 * 60) };
    }
    // Recupera le transazioni dal conto Stripe con filtri opzionali
    const transactions = await stripe.balanceTransactions.list(params);
    console.log('[DEBUG][MOVIMENTI] BalanceTransaction IDs:', transactions.data.map(tx => tx.id));
    console.log('[DEBUG][DB] dbConfig usata:', dbConfig);
    
    const result = [];
    for (const tx of transactions.data) {
      console.log('[DEBUG][MOVIMENTI] tx:', tx);
      console.log('[DEBUG][MOVIMENTI][MATCH] tx.id:', tx.id, '| tx.source:', tx.source, '| tx.payment_intent:', tx.payment_intent);
      let chargePaymentIntent = undefined;
      let dealer = '';
      let descrizione = '';
      // Default tipo
      let tipo = tx.type === 'charge' ? 'INCASSO' : (tx.type === 'payout' ? 'EROGAZIONE' : tx.type.toUpperCase());
      // Default descrizione
      if (tx.type === 'payout') {
        descrizione = 'PAGAMENTO SU VS CONTO';
        dealer = 'PAGAMENTO DA STRIPE';
      } else if (tx.type === 'charge') {
        let transRes;
        console.log('[DEBUG][MOVIMENTI] tx.id:', tx.id);
        console.log('[DEBUG][MOVIMENTI] tx.payment_intent:', tx.payment_intent);
        console.log('[DEBUG][MOVIMENTI] tx.source:', tx.source);
        let paymentIntentToSearch = tx.payment_intent;
        if (!paymentIntentToSearch && tx.source && tx.source.startsWith('ch_')) {
          // Recupera la charge da Stripe e prendi il payment_intent
          try {
            const charge = await stripe.charges.retrieve(tx.source);
            chargePaymentIntent = charge.payment_intent;
            paymentIntentToSearch = charge.payment_intent;
            console.log('[DEBUG][MOVIMENTI][MATCH] Charge recuperata da Stripe:', charge.id, '-> payment_intent:', charge.payment_intent);
          } catch (e) {
            console.log('[DEBUG][MOVIMENTI][MATCH] Errore recupero charge Stripe:', tx.source, e.message);
          }
        }
        console.log('[DEBUG][MOVIMENTI][MATCH] tx.id:', tx.id, '| tx.source:', tx.source, '| tx.payment_intent:', tx.payment_intent, '| charge.payment_intent:', chargePaymentIntent, '| paymentIntentToSearch usato nella query:', paymentIntentToSearch);
        console.log('[DEBUG][MOVIMENTI] paymentIntentToSearch usato nella query:', paymentIntentToSearch);
        // 0) Tentativo prioritario: dealerId nei metadati del PaymentIntent
        let metadataDealerFound = false;
        if (paymentIntentToSearch) {
          try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentToSearch);
            const md = (pi && pi.metadata) || {};
            // possibili varianti del nome chiave
            const rawMetaId = md.dealerId ?? md.dealer_id ?? md.idDealer ?? md.IDDealer;
            const idDealerMeta = Number(rawMetaId);
            if (Number.isFinite(idDealerMeta) && idDealerMeta > 0) {
              const dealerByMeta = await (await getRequest()).query`SELECT RagioneSociale FROM dbo.tbDealers WHERE IDDealer = ${idDealerMeta}`;
              if (dealerByMeta?.recordset?.length > 0) {
                dealer = dealerByMeta.recordset[0].RagioneSociale || '';
                metadataDealerFound = !!dealer;
                console.log('[DEBUG][MOVIMENTI][META] Dealer risolto da PaymentIntent.metadata.dealerId:', idDealerMeta, '->', dealer);
              }
            }
          } catch (e) {
            console.log('[DEBUG][MOVIMENTI][META] Errore recupero PaymentIntent/metadata:', e?.message || e);
          }
        }
        // 1) Se non trovato via metadati, tenta match su tbTransazioni con payment_intent
        if (!metadataDealerFound && paymentIntentToSearch) {
          const likePattern = `%${paymentIntentToSearch}%`;
          console.log('[DEBUG][MOVIMENTI] CERCA PER payment_intent (LIKE pattern):', likePattern);
          transRes = await (await getRequest()).query`SELECT TOP 1 idDealer, Descrizione, Payload FROM dbo.tbTransazioni WHERE Payload LIKE ${likePattern}`;
          console.log('[DEBUG][MOVIMENTI][QUERY RESULT]', transRes && transRes.recordset);
        }
        // Fallback: se ancora nulla, cerca per source
        if ((!transRes || transRes.recordset.length === 0) && tx.source) {
          console.log('[DEBUG][MOVIMENTI] CERCA PER source (fallback):', tx.source);
          transRes = await (await getRequest()).query`SELECT TOP 1 idDealer, Descrizione, Payload FROM dbo.tbTransazioni WHERE Payload LIKE '%${tx.source}%'`;
        }
        if (!metadataDealerFound && transRes && transRes.recordset.length > 0) {
          console.log('[DEBUG][MOVIMENTI] transRes.recordset:', transRes.recordset);
          const row = transRes.recordset[0];
          console.log('[DEBUG][MOVIMENTI] idDealer trovato:', row.idDealer);
          const dealerRes = await (await getRequest()).query`SELECT RagioneSociale FROM dbo.tbDealers WHERE IDDealer = ${row.idDealer}`;
          console.log('[DEBUG][MOVIMENTI] dealerRes.recordset:', dealerRes.recordset);
          if (dealerRes.recordset.length > 0) {
            dealer = dealerRes.recordset[0].RagioneSociale;
          }
          console.log('[DEBUG][MOVIMENTI] Dealer assegnato:', dealer);
          descrizione = row.Descrizione || '';
        } else {
          console.log('[DEBUG][MOVIMENTI] Nessuna transazione trovata per la ricerca su tbTransazioni. Provo su tbOrdiniProdotti...');
          try {
            // 1) Prova match su tbOrdiniProdotti per PaymentIntent nel Payload (se disponibile)
            if (paymentIntentToSearch) {
              const likePI = `%${paymentIntentToSearch}%`;
              const opByPI = await (await getRequest()).query`
                SELECT TOP 1 op.idDealer, op.OrdineDA, d.RagioneSociale, op.TotaleOrdine, op.DataOra
                FROM dbo.tbOrdiniProdotti op
                LEFT JOIN dbo.tbDealers d ON d.IDDealer = op.idDealer OR d.RecapitoEmail = op.OrdineDA
                WHERE op.Payload LIKE ${likePI}
                ORDER BY op.DataOra DESC`;
              if (opByPI && opByPI.recordset.length > 0) {
                const r = opByPI.recordset[0];
                dealer = r.RagioneSociale || '';
                console.log('[DEBUG][MOVIMENTI][OP-PI] Dealer risolto da tbOrdiniProdotti via PaymentIntent:', dealer);
              }
            }

            // 2) Fallback: se ancora vuoto, prova per data +/-1 giorno e importo uguale
            if (!dealer) {
              const txDate = new Date(tx.created * 1000);
              const start = new Date(txDate); start.setDate(start.getDate() - 1);
              const end = new Date(txDate); end.setDate(end.getDate() + 1);
              const startStr = start.toISOString();
              const endStr = end.toISOString();
              const amount = (tx.amount / 100);
              console.log('[DEBUG][MOVIMENTI][OP-FALLBACK] Cerca per date', startStr, endStr, 'e importo', amount);
              const opByDate = await (await getRequest()).query`
                SELECT TOP 1 op.idDealer, op.OrdineDA, d.RagioneSociale, op.TotaleOrdine, op.DataOra
                FROM dbo.tbOrdiniProdotti op
                LEFT JOIN dbo.tbDealers d ON d.IDDealer = op.idDealer OR d.RecapitoEmail = op.OrdineDA
                WHERE op.DataOra BETWEEN ${startStr} AND ${endStr}
                  AND ABS(op.TotaleOrdine - ${amount}) < 0.01
                ORDER BY ABS(DATEDIFF(MINUTE, op.DataOra, ${txDate.toISOString()})) ASC`;
              if (opByDate && opByDate.recordset.length > 0) {
                const r = opByDate.recordset[0];
                dealer = r.RagioneSociale || '';
                console.log('[DEBUG][MOVIMENTI][OP-FALLBACK] Dealer risolto da tbOrdiniProdotti via data/importo:', dealer);
              }
            }

            if (!dealer) {
              console.log('[DEBUG][MOVIMENTI] Nessuna corrispondenza trovata anche su tbOrdiniProdotti. Dealer rimane vuoto.');
            }
          } catch (e) {
            console.log('[DEBUG][MOVIMENTI][OP-LOOKUP] Errore ricerca in tbOrdiniProdotti:', e.message);
          }
        }
      }
      result.push({
        id: tx.id, // Aggiungo ID per identificare la transazione
        data: tx.created ? new Date(tx.created * 1000).toLocaleString('it-IT') : '',
        dealer,
        tipo,
        importo: (tx.amount / 100).toFixed(2),
        valuta: tx.currency ? tx.currency.toUpperCase() : '',
        descrizione,
        // Dettagli completi per i Payout (EROGAZIONE)
        dettagli: tx.type === 'payout' ? {
          id: tx.id,
          status: tx.status,
          available_on: tx.available_on ? new Date(tx.available_on * 1000).toLocaleString('it-IT') : null,
          created: tx.created ? new Date(tx.created * 1000).toLocaleString('it-IT') : null,
          net: (tx.net / 100).toFixed(2),
          fee: (tx.fee / 100).toFixed(2),
          fee_details: tx.fee_details || [],
          source: tx.source,
          description: tx.description,
          reporting_category: tx.reporting_category,
          // Dettagli aggiuntivi per il Payout
          automatic: tx.automatic,
          destination: tx.destination,
          failure_code: tx.failure_code,
          failure_message: tx.failure_message,
          method: tx.method,
          source_type: tx.source_type,
          statement_descriptor: tx.statement_descriptor,
          type: tx.type
        } : null
      });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[STRIPE][MOVIMENTI] Errore:', err);
    res.status(500).json({ success: false, error: 'Errore recupero movimenti Stripe', details: err.message });
  }
});

// Endpoint dettagli specifici Payout Stripe
app.get('/api/stripe/payout/:payoutId', authenticateToken, async (req, res) => {
  try {
    const { payoutId } = req.params;
    
    let payout;
    
    // Verifica se l'ID passato è un balance transaction o un payout
    if (payoutId.startsWith('txn_')) {
      // È un balance transaction ID, recupera la transazione per ottenere il payout ID
      const balanceTransaction = await stripe.balanceTransactions.retrieve(payoutId);
      if (!balanceTransaction.source || !balanceTransaction.source.startsWith('po_')) {
        return res.status(400).json({ 
          success: false, 
          error: 'Balance transaction non associata a un payout',
          details: `Transaction ${payoutId} non ha un payout associato`
        });
      }
      // Recupera il payout usando l'ID dal source
      payout = await stripe.payouts.retrieve(balanceTransaction.source);
    } else if (payoutId.startsWith('po_')) {
      // È già un payout ID
      payout = await stripe.payouts.retrieve(payoutId);
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'ID non valido',
        details: 'L\'ID deve essere un payout (po_) o balance transaction (txn_)'
      });
    }
    
    // Recupera le transazioni che compongono questo payout
    const balanceTransactions = await stripe.balanceTransactions.list({
      payout: payout.id,
      limit: 100
    });
    
    // Formatta le transazioni
    const transazioni = [];
    for (const tx of balanceTransactions.data) {
      let dealer = '';
      let descrizione = tx.description || '';
      
      // Tenta di risolvere il dealer per ogni transazione
      if (tx.source && tx.source.startsWith('ch_')) {
        try {
          const charge = await stripe.charges.retrieve(tx.source);
          if (charge.payment_intent) {
            const pi = await stripe.paymentIntents.retrieve(charge.payment_intent);
            const md = (pi && pi.metadata) || {};
            const rawMetaId = md.dealerId ?? md.dealer_id ?? md.idDealer ?? md.IDDealer;
            const idDealerMeta = Number(rawMetaId);
            if (Number.isFinite(idDealerMeta) && idDealerMeta > 0) {
              const dealerByMeta = await (await getRequest()).query`SELECT RagioneSociale FROM dbo.tbDealers WHERE IDDealer = ${idDealerMeta}`;
              if (dealerByMeta?.recordset?.length > 0) {
                dealer = dealerByMeta.recordset[0].RagioneSociale || '';
              }
            }
          }
          // Se non trovato via metadata, usa l'email del charge
          if (!dealer && charge.billing_details?.email) {
            dealer = charge.billing_details.email;
          }
        } catch (e) {
          console.log('[PAYOUT-DETAIL] Errore recupero charge:', e.message);
        }
      }
      
      transazioni.push({
        id: tx.id,
        tipo: tx.type === 'charge' ? 'Pagamento' : 
              tx.type === 'refund' ? 'Rimborso' : 
              tx.type === 'adjustment' ? 'Rettifica' : tx.type,
        lordo: (tx.amount / 100).toFixed(2),
        commissione: (tx.fee / 100).toFixed(2),
        totale: (tx.net / 100).toFixed(2),
        descrizione: descrizione || dealer || '-',
        data: tx.created ? new Date(tx.created * 1000).toLocaleDateString('it-IT') : '-',
        dealer: dealer
      });
    }
    
    // Calcola il riepilogo
    const addebiti = transazioni.filter(t => ['Pagamento'].includes(t.tipo));
    const rimborsi = transazioni.filter(t => ['Rimborso'].includes(t.tipo));
    const rettifiche = transazioni.filter(t => ['Rettifica'].includes(t.tipo));
    
    const riepilogo = {
      addebiti: {
        conteggio: addebiti.length,
        lordo: addebiti.reduce((sum, t) => sum + parseFloat(t.lordo), 0).toFixed(2),
        commissioni: addebiti.reduce((sum, t) => sum + parseFloat(t.commissione), 0).toFixed(2),
        totale: addebiti.reduce((sum, t) => sum + parseFloat(t.totale), 0).toFixed(2)
      },
      rimborsi: {
        conteggio: rimborsi.length,
        lordo: (rimborsi.reduce((sum, t) => sum + parseFloat(t.lordo), 0) * -1).toFixed(2),
        commissioni: rimborsi.reduce((sum, t) => sum + parseFloat(t.commissione), 0).toFixed(2),
        totale: (rimborsi.reduce((sum, t) => sum + parseFloat(t.totale), 0) * -1).toFixed(2)
      },
      rettifiche: {
        conteggio: rettifiche.length,
        lordo: rettifiche.reduce((sum, t) => sum + parseFloat(t.lordo), 0).toFixed(2),
        commissioni: rettifiche.reduce((sum, t) => sum + parseFloat(t.commissione), 0).toFixed(2),
        totale: rettifiche.reduce((sum, t) => sum + parseFloat(t.totale), 0).toFixed(2)
      }
    };
    
    res.json({
      success: true,
      payout: {
        id: payout.id,
        amount: (payout.amount / 100).toFixed(2),
        currency: payout.currency.toUpperCase(),
        created: new Date(payout.created * 1000).toLocaleString('it-IT'),
        arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toLocaleDateString('it-IT') : null,
        status: payout.status,
        type: payout.type,
        method: payout.method,
        destination: payout.destination,
        automatic: payout.automatic,
        failure_code: payout.failure_code,
        failure_message: payout.failure_message
      },
      riepilogo,
      transazioni
    });
  } catch (err) {
    console.error('[STRIPE][PAYOUT-DETAIL] Errore:', err);
    res.status(500).json({ success: false, error: 'Errore recupero dettagli payout', details: err.message });
  }
});

// Endpoint di debug connessione DB
app.get('/api/debug-db', async (req, res) => {
  try {
    const sql = require('mssql');
    const pool = sql;
    const result = await pool.request().query('SELECT 1 as test');
    res.json({ status: 'success', result: result.recordset });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err, message: err.message });
  }
});

// Endpoint di verifica della connessione al database
app.get('/api/check-db', async (req, res) => {
  try {
    const sql = require('mssql');
    const pool = sql;
    const result = await pool.request().query('SELECT name FROM sys.databases');
    res.json({
      status: 'success',
      databases: result.recordset,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Errore nel test del database:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore durante il test del database',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint di verifica della connessione al database specifico
app.get('/api/check-db-connection', async (req, res) => {
  try {
    const pool = sql;
    await pool.request().query('SELECT 1');
    res.json({ status: 'success', message: 'Connessione al database riuscita' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Endpoint temporaneo per testare la verifica password ASP.NET Identity
app.post('/api/test-password', express.json(), async (req, res) => {
  const { password, hash } = req.body;
  try {
    const result = await aspnetIdentityPw.validatePassword(password, hash);
    res.json({ valid: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CORS middleware per sviluppo
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Endpoint per restituire i templates

app.get('/api/templates', async (req, res) => {
  try {
    const templatesPath = path.join(__dirname, 'templates.json');
    console.log('[DEBUG][TEMPLATES] Caricamento da:', templatesPath);
    const data = await fs.promises.readFile(templatesPath, 'utf8');
    const templates = JSON.parse(data);
    console.log('[DEBUG][TEMPLATES] Templates caricati:', Object.keys(templates));
    res.json(templates);
  } catch (err) {
    console.error('[DEBUG][TEMPLATES] Errore caricamento:', err);
    res.status(500).json({ error: 'Impossibile leggere templates.json', details: err.message });
  }
});

// Endpoint per il controllo dello stato del server
app.get('/health', async (req, res) => {
  try {
    // Verifica la connessione al database
    await sql.query('SELECT 1');
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Database connection failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// --- IMPERSONATE MASTER ENDPOINT ---
// Consente agli utenti in whitelist MASTER di ottenere un token con email attivazioni@kimweb.it
// per sbloccare la UI MASTER senza modifiche al frontend.
app.post('/api/impersonate-master', authenticateToken, async (req, res) => {
  try {
    const user = req.user || {};
    const email = (user.email || '').toLowerCase();

    if (!email) {
      return res.status(401).json({ error: 'Token non valido: email mancante' });
    }

    if (!isMasterEmail(email)) {
      return res.status(403).json({ error: 'Accesso negato: utente non autorizzato all\'impersonazione MASTER' });
    }

    // Costruisci un payload che il frontend riconosce come MASTER
    const ruoli = Array.isArray(user.ruoli) ? user.ruoli.slice() : [];
    if (!ruoli.includes('MASTER')) ruoli.push('MASTER');

    const impersonated = {
      ...user,
      email: 'attivazioni@kimweb.it',
      ruolo: 'MASTER',
      ruoli,
      isMaster: true,
      // Fallback claims SOLO per supermaster, per evitare errori nei moduli che li richiedono
      agenteNome: 'GIACOMO',
      idAgente: -1,
      dealerId: -1,
      idDealer: -1,
      ragioneSociale: 'SUPERMASTER',
      impersonatedFrom: email
    };

    // Non includere claim standard del vecchio token per evitare errori (es. exp/iat/nbf)
    const { exp, iat, nbf, ...payload } = impersonated;
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    return res.json({
      token,
      user: impersonated,
      message: 'Impersonazione MASTER riuscita',
    });
  } catch (err) {
    console.error('[IMPERSONATE MASTER] Errore:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

// --- MASTER LOGIN ENDPOINT ---
// Endpoint speciale per login con master password durante maintenance mode
app.post('/api/master-login', express.json(), async (req, res) => {
  try {
    const { password, role } = req.body;
    
    // Verifica che sia configurata la master password
    if (!process.env.MASTER_OVERRIDE_PASSWORD) {
      return res.status(404).json({ error: 'Master login non configurato' });
    }
    
    // Verifica la master password
    if (password !== process.env.MASTER_OVERRIDE_PASSWORD) {
      return res.status(401).json({ error: 'Master password non valida' });
    }
    
    // Validazione ruolo
    const validRoles = ['MASTER', 'DEALER', 'MASTERPRODOTTI'];
    const selectedRole = role && validRoles.includes(role.toUpperCase()) ? role.toUpperCase() : 'MASTER';
    
    let masterUser;
    
    // Per il ruolo DEALER, carica i dati reali del dealer di test
    if (selectedRole === 'DEALER') {
      try {
        const dealerTestEmail = 'gianvito91@icloud.com';
        const dealerQuery = `
          SELECT 
            d.ID as dealerId,
            d.Email,
            d.Nome,
            d.Cognome,
            d.RagioneSociale,
            d.Telefono,
            d.Citta,
            d.Provincia
          FROM tbDealers d 
          WHERE d.Email = @email AND d.Attivo = 1
        `;
        
        const dealerResult = await sql.query`
          SELECT 
            d.ID as dealerId,
            d.Email,
            d.Nome,
            d.Cognome,
            d.RagioneSociale,
            d.Telefono,
            d.Citta,
            d.Provincia
          FROM tbDealers d 
          WHERE d.Email = ${dealerTestEmail} AND d.Attivo = 1
        `;
        
        if (dealerResult.recordset.length > 0) {
          const dealer = dealerResult.recordset[0];
          masterUser = {
            id: dealer.dealerId,
            dealerId: dealer.dealerId,
            userId: dealer.dealerId,
            email: dealer.Email,
            nome: dealer.Nome,
            cognome: dealer.Cognome,
            ragioneSociale: dealer.RagioneSociale,
            telefono: dealer.Telefono,
            citta: dealer.Citta,
            provincia: dealer.Provincia,
            ruolo: 'DEALER',
            ruoli: ['DEALER'],
            isMaster: true,
            selectedRole: 'DEALER',
            isTestDealer: true
          };
          console.log(`[MASTER LOGIN] Caricati dati dealer di test: ${dealer.Nome} ${dealer.Cognome} (ID: ${dealer.dealerId})`);
        } else {
          console.log('[MASTER LOGIN] Dealer di test non trovato, uso dati generici');
          masterUser = {
            id: 'master-dealer',
            email: 'master-dealer@system.local',
            nome: 'Master',
            cognome: 'Dealer',
            ruolo: 'DEALER',
            ruoli: ['DEALER'],
            isMaster: true,
            selectedRole: 'DEALER'
          };
        }
      } catch (error) {
        console.error('[MASTER LOGIN] Errore caricamento dealer di test:', error);
        masterUser = {
          id: 'master-dealer',
          email: 'master-dealer@system.local',
          nome: 'Master',
          cognome: 'Dealer',
          ruolo: 'DEALER',
          ruoli: ['DEALER'],
          isMaster: true,
          selectedRole: 'DEALER'
        };
      }
    } else {
      // Per MASTER e MASTERPRODOTTI usa dati generici
      const roleNames = {
        'MASTER': { nome: 'Master', cognome: 'System' },
        'MASTERPRODOTTI': { nome: 'Master', cognome: 'Prodotti' }
      };
      
      masterUser = {
        id: `master-${selectedRole.toLowerCase()}`,
        email: `master-${selectedRole.toLowerCase()}@system.local`,
        nome: roleNames[selectedRole].nome,
        cognome: roleNames[selectedRole].cognome,
        ruolo: selectedRole,
        ruoli: [selectedRole],
        isMaster: true,
        selectedRole: selectedRole,
        idGruppo: 1 // Master ha sempre accesso completo
      };
    }
    
    const token = jwt.sign(masterUser, process.env.JWT_SECRET || 'secret', { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
    
    console.log(`[MASTER LOGIN] Accesso master autorizzato con ruolo: ${selectedRole}`);
    
    res.json({
      token,
      user: masterUser,
      message: `Accesso master autorizzato con ruolo ${selectedRole}`,
      role: selectedRole,
      maintenanceMode: process.env.MAINTENANCE_MODE === 'true'
    });
    
  } catch (error) {
    console.error('[MASTER LOGIN] Errore:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Endpoint per controllare lo stato della modalità maintenance
app.get('/api/maintenance-status', (req, res) => {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  console.log(`[MAINTENANCE STATUS] process.env.MAINTENANCE_MODE = '${process.env.MAINTENANCE_MODE}'`);
  console.log(`[MAINTENANCE STATUS] Richiesta stato maintenance: ${isMaintenanceMode}`);
  
  res.json({
    maintenanceMode: isMaintenanceMode,
    message: isMaintenanceMode ? 'Sistema in manutenzione' : 'Sistema operativo'
  });
});

// ===== ADMIN USER MANAGEMENT ENDPOINTS =====

// Endpoint per ottenere tutti gli utenti (solo per admin)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    // Verifica che l'utente sia admin
    if (req.user.email !== 'admin@kim.local' && !req.user.ruoli?.includes('SuperUser')) {
      return res.status(403).json({ error: 'Accesso negato' });
    }

    const result = await new sql.Request()
      .query(`
        SELECT 
          u.Id,
          u.UserName,
          u.Email,
          u.EmailConfirmed,
          u.LockoutEnabled,
          STRING_AGG(r.Name, ', ') as Ruoli
        FROM dbo.AspNetUsers u
        LEFT JOIN dbo.AspNetUserRoles ur ON u.Id = ur.UserId
        LEFT JOIN dbo.AspNetRoles r ON ur.RoleId = r.Id
        GROUP BY u.Id, u.UserName, u.Email, u.EmailConfirmed, u.LockoutEnabled
        ORDER BY u.Email
      `);

    res.json({ success: true, users: result.recordset });
  } catch (error) {
    console.error('Errore nel recupero utenti:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Endpoint per ottenere tutti i ruoli disponibili (con debug)
app.get('/api/admin/roles', authenticateToken, async (req, res) => {
  try {
    console.log('[DEBUG][ROLES] req.user:', req.user);
    console.log('[DEBUG][ROLES] req.user.email:', req.user?.email);
    console.log('[DEBUG][ROLES] req.user.ruoli:', req.user?.ruoli);
    
    // Verifica che l'utente sia admin
    if (req.user.email !== 'admin@kim.local' && !req.user.ruoli?.includes('SuperUser')) {
      console.log('[DEBUG][ROLES] Accesso negato per utente:', req.user?.email);
      return res.status(403).json({ error: 'Accesso negato' });
    }

    const result = await new sql.Request()
      .query('SELECT Id, Name, NormalizedName FROM dbo.AspNetRoles ORDER BY Name');

    console.log('[DEBUG][ROLES] Ruoli nel database:', result.recordset);
    res.json({ success: true, roles: result.recordset });
  } catch (error) {
    console.error('Errore nel recupero ruoli:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// ===== ADMIN GESTIONE OFFERTE ENDPOINTS =====

// GET /api/admin/templates - Lista template disponibili
app.get('/api/admin/templates', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    const templatesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates.json');
    const templatesData = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
    const templateNames = templatesData.map(t => t.template);
    res.json(templateNames);
  } catch (error) {
    console.error('[ADMIN][TEMPLATES][ERR]', error);
    res.status(500).json({ error: 'Errore caricamento template' });
  }
});

// GET /api/admin/offerte/valori-dropdown - Valori unici per dropdown
app.get('/api/admin/offerte/valori-dropdown', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    await getPool();
    
    // Query per ottenere valori unici
    const tipoOffertaResult = await (await getRequest()).query`
      SELECT DISTINCT tipoOfferta FROM dbo.tbOfferte WHERE tipoOfferta IS NOT NULL ORDER BY tipoOfferta
    `;
    const segmentoResult = await (await getRequest()).query`
      SELECT DISTINCT Segmento FROM dbo.tbOfferte WHERE Segmento IS NOT NULL ORDER BY Segmento
    `;
    const tipoResult = await (await getRequest()).query`
      SELECT DISTINCT Tipo FROM dbo.tbOfferte WHERE Tipo IS NOT NULL ORDER BY Tipo
    `;
    const simTypeResult = await (await getRequest()).query`
      SELECT DISTINCT SIMTYPE FROM dbo.tbOfferte WHERE SIMTYPE IS NOT NULL ORDER BY SIMTYPE
    `;

    res.json({
      tipoOfferta: tipoOffertaResult.recordset.map(r => r.tipoOfferta),
      segmento: segmentoResult.recordset.map(r => r.Segmento),
      tipo: tipoResult.recordset.map(r => r.Tipo),
      simType: simTypeResult.recordset.map(r => r.SIMTYPE)
    });
  } catch (error) {
    console.error('[ADMIN][VALORI DROPDOWN][ERR]', error);
    res.status(500).json({ error: 'Errore caricamento valori dropdown' });
  }
});

// GET /api/admin/operatori - Lista operatori
app.get('/api/admin/operatori', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    await getPool();
    const result = await (await getRequest()).query`
      SELECT IDOperatore, Denominazione, Tipo, LogoLink
      FROM dbo.tbOperatori
      ORDER BY Denominazione
    `;
    res.json(result.recordset || []);
  } catch (error) {
    console.error('[ADMIN][OPERATORI][ERR]', error);
    res.status(500).json({ error: 'Errore caricamento operatori' });
  }
});

// GET /api/admin/offerte - Lista offerte con filtri
app.get('/api/admin/offerte', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    const { operatore, stato } = req.query;
    
    if (!operatore) {
      return res.status(400).json({ error: 'Parametro operatore obbligatorio' });
    }

    await getPool();
    
    const today = new Date();
    let query = `
      SELECT 
        o.IDOfferta,
        o.idOperatore,
        o.ValidaDal,
        o.ValidaAl,
        o.tipoOfferta,
        o.Segmento,
        o.Tipo,
        o.Crediti,
        o.LogoLink,
        o.Titolo,
        o.DescrizioneBreve,
        o.Descrizione,
        o.FullLink,
        o.TemplateDatiOfferta,
        o.isConvergenza,
        o.IDOffertaCollegata,
        o.SIMTYPE,
        o.SIMCOUNT,
        o.Offerta_Inviata,
        o.SpeseSpedizione,
        o.LimiteSIM,
        o.OnlyFor,
        o.RequireCode,
        o.CodePrefix,
        o.CodeLen,
        o.FixedDiscountPct,
        op.Denominazione as NomeOperatore,
        op.LogoLink as LogoOperatore
      FROM dbo.tbOfferte o
      INNER JOIN dbo.tbOperatori op ON o.idOperatore = op.IDOperatore
      WHERE o.idOperatore = @operatore
    `;
    
    if (stato === 'attive') {
      query += ' AND o.ValidaAl >= @today';
    } else if (stato === 'scadute') {
      query += ' AND o.ValidaAl < @today';
    }
    
    query += ' ORDER BY o.ValidaAl DESC, o.Titolo';

    const request = await getRequest();
    request.input('operatore', sql.Int, parseInt(operatore));
    request.input('today', sql.DateTime, today);
    
    const result = await request.query(query);

    const offerte = result.recordset || [];
    
    // Calcola statistiche
    const stats = {
      totali: offerte.length,
      attive: offerte.filter(o => new Date(o.ValidaAl) >= today).length,
      scadute: offerte.filter(o => new Date(o.ValidaAl) < today).length
    };

    res.json({ offerte, stats });
  } catch (error) {
    console.error('[ADMIN][OFFERTE][ERR]', error);
    res.status(500).json({ error: 'Errore caricamento offerte' });
  }
});

// PUT /api/admin/offerte/:id - Aggiorna offerta esistente
app.put('/api/admin/offerte/:id', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ValidaDal, ValidaAl, Crediti, Titolo, DescrizioneBreve } = req.body;

    // Validazioni
    if (!ValidaDal || !ValidaAl) {
      return res.status(400).json({ error: 'Date validità obbligatorie' });
    }
    if (new Date(ValidaDal) > new Date(ValidaAl)) {
      return res.status(400).json({ error: 'ValidaDal deve essere precedente a ValidaAl' });
    }
    if (Crediti < 0) {
      return res.status(400).json({ error: 'Crediti non possono essere negativi' });
    }
    if (!Titolo || !Titolo.trim()) {
      return res.status(400).json({ error: 'Titolo obbligatorio' });
    }

    await getPool();
    
    const result = await (await getRequest())
      .input('id', sql.Int, parseInt(id))
      .input('ValidaDal', sql.DateTime, new Date(ValidaDal))
      .input('ValidaAl', sql.DateTime, new Date(ValidaAl))
      .input('Crediti', sql.Decimal(10, 2), parseFloat(Crediti))
      .input('Titolo', sql.NVarChar(200), Titolo.trim())
      .input('DescrizioneBreve', sql.NVarChar(500), DescrizioneBreve || '')
      .query`
        UPDATE dbo.tbOfferte
        SET 
          ValidaDal = @ValidaDal,
          ValidaAl = @ValidaAl,
          Crediti = @Crediti,
          Titolo = @Titolo,
          DescrizioneBreve = @DescrizioneBreve
        WHERE IDOfferta = @id
      `;

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Offerta non trovata' });
    }

    res.json({ success: true, message: 'Offerta aggiornata con successo' });
  } catch (error) {
    console.error('[ADMIN][UPDATE OFFERTA][ERR]', error);
    res.status(500).json({ error: 'Errore aggiornamento offerta' });
  }
});

// POST /api/admin/offerte - Crea nuova offerta
app.post('/api/admin/offerte', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    const {
      idOperatore,
      ValidaDal,
      ValidaAl,
      tipoOfferta,
      Segmento,
      Tipo,
      Crediti,
      LogoLink,
      Titolo,
      DescrizioneBreve,
      Descrizione,
      FullLink,
      TemplateDatiOfferta,
      isConvergenza,
      IDOffertaCollegata,
      SIMTYPE,
      SIMCOUNT,
      Offerta_Inviata,
      SpeseSpedizione,
      LimiteSIM,
      OnlyFor,
      RequireCode,
      CodePrefix,
      CodeLen,
      FixedDiscountPct
    } = req.body;

    // Validazione campi obbligatori
    if (!idOperatore || !ValidaDal || !ValidaAl || !tipoOfferta || !Segmento || !Tipo || !Titolo || !DescrizioneBreve || !TemplateDatiOfferta) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    }

    if (new Date(ValidaDal) > new Date(ValidaAl)) {
      return res.status(400).json({ error: 'ValidaDal deve essere precedente a ValidaAl' });
    }

    await getPool();
    
    const result = await (await getRequest())
      .input('idOperatore', sql.Int, parseInt(idOperatore))
      .input('ValidaDal', sql.DateTime, new Date(ValidaDal))
      .input('ValidaAl', sql.DateTime, new Date(ValidaAl))
      .input('tipoOfferta', sql.NVarChar(100), tipoOfferta)
      .input('Segmento', sql.NVarChar(50), Segmento)
      .input('Tipo', sql.NVarChar(50), Tipo)
      .input('Crediti', sql.Decimal(10, 2), parseFloat(Crediti) || 0)
      .input('LogoLink', sql.NVarChar(500), LogoLink || null)
      .input('Titolo', sql.NVarChar(200), Titolo)
      .input('DescrizioneBreve', sql.NVarChar(500), DescrizioneBreve)
      .input('Descrizione', sql.NVarChar(sql.MAX), Descrizione || null)
      .input('FullLink', sql.NVarChar(500), FullLink || null)
      .input('TemplateDatiOfferta', sql.NVarChar(100), TemplateDatiOfferta)
      .input('isConvergenza', sql.Bit, isConvergenza || false)
      .input('IDOffertaCollegata', sql.Int, IDOffertaCollegata || 0)
      .input('SIMTYPE', sql.NVarChar(50), SIMTYPE || null)
      .input('SIMCOUNT', sql.Int, SIMCOUNT || 1)
      .input('Offerta_Inviata', sql.Bit, Offerta_Inviata || false)
      .input('SpeseSpedizione', sql.Decimal(10, 2), parseFloat(SpeseSpedizione) || 0)
      .input('LimiteSIM', sql.Int, LimiteSIM || 0)
      .input('OnlyFor', sql.NVarChar(100), OnlyFor || null)
      .input('RequireCode', sql.Bit, RequireCode || false)
      .input('CodePrefix', sql.NVarChar(10), CodePrefix || null)
      .input('CodeLen', sql.Int, CodeLen || null)
      .input('FixedDiscountPct', sql.Decimal(5, 2), parseFloat(FixedDiscountPct) || 0)
      .query`
        INSERT INTO dbo.tbOfferte (
          idOperatore, ValidaDal, ValidaAl, tipoOfferta, Segmento, Tipo, Crediti,
          LogoLink, Titolo, DescrizioneBreve, Descrizione, FullLink, TemplateDatiOfferta,
          isConvergenza, IDOffertaCollegata, SIMTYPE, SIMCOUNT, Offerta_Inviata,
          SpeseSpedizione, LimiteSIM, OnlyFor, RequireCode, CodePrefix, CodeLen, FixedDiscountPct
        ) VALUES (
          @idOperatore, @ValidaDal, @ValidaAl, @tipoOfferta, @Segmento, @Tipo, @Crediti,
          @LogoLink, @Titolo, @DescrizioneBreve, @Descrizione, @FullLink, @TemplateDatiOfferta,
          @isConvergenza, @IDOffertaCollegata, @SIMTYPE, @SIMCOUNT, @Offerta_Inviata,
          @SpeseSpedizione, @LimiteSIM, @OnlyFor, @RequireCode, @CodePrefix, @CodeLen, @FixedDiscountPct
        );
        SELECT SCOPE_IDENTITY() AS IDOfferta;
      `;
    
    const newId = result.recordset[0]?.IDOfferta;
    res.json({ success: true, message: 'Offerta creata con successo', IDOfferta: newId });
    
  } catch (error) {
    console.error('[ADMIN][CREATE OFFERTA][ERR]', error);
    res.status(500).json({ error: 'Errore creazione offerta' });
  }
});

// Endpoint per creare un nuovo utente con ruolo
app.post('/api/admin/users', authenticateToken, onlyAdmin, async (req, res) => {
  try {
    // Autorizzazione gestita da onlyAdmin

    const { 
      email, 
      password, 
      role, // Singolo ruolo invece di array
      // Dati comuni
      ragioneSociale,
      indirizzo,
      cap,
      citta,
      provincia,
      piva,
      recapitoCell,
      tipologia,
      agente,
      idGruppo,
      // Dati agente specifici
      cognome,
      nome,
      tipologiaAgente,
      ruoloAgente
    } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password e ruolo sono obbligatori' });
    }

    if (!['DEALER', 'AGENTE'].includes(role)) {
      return res.status(400).json({ error: 'Ruolo non valido. Deve essere DEALER o AGENTE' });
    }

    // Validazione campi specifici
    if (role === 'DEALER' && !ragioneSociale) {
      return res.status(400).json({ error: 'Ragione sociale è obbligatoria per i dealer' });
    }
    
    if (role === 'AGENTE' && (!cognome || !nome)) {
      return res.status(400).json({ error: 'Cognome e nome sono obbligatori per gli agenti' });
    }
    
    if (!recapitoCell) {
      return res.status(400).json({ error: 'Recapito cellulare è obbligatorio' });
    }

    // Verifica se l'utente esiste già
    const existingUser = await new sql.Request()
      .input('email', sql.NVarChar, email)
      .query('SELECT Id FROM dbo.AspNetUsers WHERE Email = @email OR UserName = @email');

    if (existingUser.recordset.length > 0) {
      return res.status(400).json({ error: 'Utente già esistente' });
    }

    // Genera hash della password
    const passwordHash = await aspnetIdentityPw.hashPassword(password);
    const userId = crypto.randomUUID();
    const securityStamp = crypto.randomBytes(16).toString('hex').toUpperCase();
    const concurrencyStamp = crypto.randomUUID();

    // Inserisci nuovo utente
    await new sql.Request()
      .input('id', sql.NVarChar, userId)
      .input('userName', sql.NVarChar, email)
      .input('normalizedUserName', sql.NVarChar, email.toUpperCase())
      .input('email', sql.NVarChar, email)
      .input('normalizedEmail', sql.NVarChar, email.toUpperCase())
      .input('emailConfirmed', sql.Bit, true)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('securityStamp', sql.NVarChar, securityStamp)
      .input('concurrencyStamp', sql.NVarChar, concurrencyStamp)
      .input('lockoutEnabled', sql.Bit, true)
      .query(`
        INSERT INTO dbo.AspNetUsers 
        (Id, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, 
         PasswordHash, SecurityStamp, ConcurrencyStamp, LockoutEnabled, AccessFailedCount, 
         PhoneNumberConfirmed, TwoFactorEnabled)
        VALUES 
        (@id, @userName, @normalizedUserName, @email, @normalizedEmail, @emailConfirmed,
         @passwordHash, @securityStamp, @concurrencyStamp, @lockoutEnabled, 0,
         0, 0)
      `);

    // Assegna il ruolo specificato
    const roleResult = await new sql.Request()
      .input('roleName', sql.NVarChar, role)
      .query('SELECT Id FROM dbo.AspNetRoles WHERE Name = @roleName');

    if (roleResult.recordset.length > 0) {
      const roleId = roleResult.recordset[0].Id;
      
      // Assegna il ruolo all'utente
      await new sql.Request()
        .input('userId', sql.NVarChar, userId)
        .input('roleId', sql.NVarChar, roleId)
        .query('INSERT INTO dbo.AspNetUserRoles (UserId, RoleId) VALUES (@userId, @roleId)');
      
      console.log(`[ADMIN] Ruolo ${role} assegnato all'utente ${email}`);
    } else {
      console.error(`[ADMIN] Ruolo ${role} non trovato nel database`);
    }

    let dealerId = null;
    let agenteId = null;

    // Genera password temporanea
    const tmpPasswd = crypto.randomBytes(4).toString('hex').toUpperCase() + '!o';

    // Inserisci sempre in tbDealers (necessario per entrambi i ruoli)
    const dealerResult = await new sql.Request()
      .input('ragioneSociale', sql.NVarChar, ragioneSociale || (role === 'AGENTE' ? `${cognome || ''} ${nome || ''}`.trim() : ''))
      .input('indirizzo', sql.NVarChar, indirizzo || '')
      .input('cap', sql.NVarChar, cap || '')
      .input('citta', sql.NVarChar, citta || '')
      .input('provincia', sql.NVarChar, provincia || '')
      .input('piva', sql.NVarChar, piva || '')
      .input('recapitoCell', sql.NVarChar, recapitoCell || '')
      .input('recapitoEmail', sql.NVarChar, email)
      .input('active', sql.Bit, true)
      .input('tipologia', sql.Int, tipologia || 1)
      .input('agente', sql.NVarChar, agente || 'ARMANDO')
      .input('idGruppo', sql.Int, idGruppo || 2)
      .input('tmpPasswd', sql.NVarChar, tmpPasswd)
      .query(`
        INSERT INTO dbo.tbDealers 
        (RagioneSociale, Indirizzo, CAP, Citta, Provincia, PIva, RecapitoCell, RecapitoEmail, 
         Active, Tipologia, AGENTE, IDGruppo, TmpPasswd, ExternalID)
        OUTPUT INSERTED.IDDealer
        VALUES 
        (@ragioneSociale, @indirizzo, @cap, @citta, @provincia, @piva, @recapitoCell, @recapitoEmail,
         @active, @tipologia, @agente, @idGruppo, @tmpPasswd, 0)
      `);
    
    if (dealerResult.recordset.length > 0) {
      dealerId = dealerResult.recordset[0].IDDealer;
      console.log(`[ADMIN] Dealer creato con ID: ${dealerId}`);
    }

    // Inserisci in tbAgenti se è stato creato un dealer (sempre necessario)
    if (dealerId) {
      const agenteResult = await new sql.Request()
        .input('idDealer', sql.Int, dealerId)
        .input('ragioneSociale', sql.NVarChar, ragioneSociale || '')
        .input('cognome', sql.NVarChar, cognome || '')
        .input('nome', sql.NVarChar, nome || '')
        .input('tipologia', sql.Int, tipologiaAgente || 2)
        .input('ruolo', sql.NVarChar, ruoloAgente || 'OPERATOR')
        .input('recapitoCell', sql.NVarChar, recapitoCell || '')
        .input('recapitoEmail', sql.NVarChar, email)
        .input('login', sql.NVarChar, email)
        .input('password', sql.NVarChar, 'LOCK')
        .input('active', sql.Bit, true)
        .query(`
          INSERT INTO dbo.tbAgenti 
          (idDealer, RagioneSociale, Cognome, Nome, Tipologia, Ruolo, RecapitoCell, RecapitoEmail, 
           Login, Password, Active)
          OUTPUT INSERTED.IDAgente
          VALUES 
          (@idDealer, @ragioneSociale, @cognome, @nome, @tipologia, @ruolo, @recapitoCell, @recapitoEmail,
           @login, @password, @active)
        `);
      
      if (agenteResult.recordset.length > 0) {
        agenteId = agenteResult.recordset[0].IDAgente;
        console.log(`[ADMIN] Agente creato con ID: ${agenteId}`);
      }
    }

    console.log(`[ADMIN] Nuovo utente creato: ${email} con ruolo: ${role}`);
    if (dealerId) console.log(`[ADMIN] Dealer ID: ${dealerId}`);
    if (agenteId) console.log(`[ADMIN] Agente ID: ${agenteId}`);

    // Invia email benvenuto solo per DEALER usando tbEmailTemplates (WELCOME_DEALER)
    try {
      if (role === 'DEALER') {
        const frontend = (process.env.FRONTEND_URL || 'https://station.kimweb.agency').replace(/\/$/, '');
        await sendTemplateEmail({
          eventType: 'WELCOME_DEALER',
          to: email,
          fallbackSubject: 'Benvenuto in KIM Station',
          params: {
            NOME_AZIENDA: ragioneSociale || 'Dealer',
            LOGIN_EMAIL: email,
            PASSWORD_TEMPORANEA: password, // password fornita al backend per Identity
            LOGIN_URL: `${frontend}/login`,
            RECUPERO_URL: `${frontend}/forgot-password`,
          },
        });
      }
    } catch (mailErr) {
      console.error('[ADMIN][WELCOME_DEALER] Invio email fallito:', mailErr?.message || mailErr);
      // Non bloccare la risposta verso il client
    }
    
    res.json({ 
      success: true, 
      message: 'Utente creato con successo', 
      userId,
      dealerId,
      agenteId
    });

  } catch (error) {
    console.error('Errore nella creazione utente:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

app.post('/api/login', express.json(), async (req, res) => {
  console.log('Richiesta di login ricevuta:', {
    headers: req.headers,
    body: req.body,
    ip: req.ip,
    method: req.method,
    url: req.originalUrl
  });

  const { username, email, password } = req.body;
  const loginIdentifier = email || username;

  if (!loginIdentifier || !password) {
    console.log('Credenziali mancanti:', {
      email: !!email,
      username: !!username,
      password: !!password
    });
    return res.status(400).json({
      error: 'Credenziali mancanti',
      message: 'Inserisci email/username e password'
    });
  }

  try {
    
    let userType = null;
    let user = null;
    let ruoli = [];
    let agenteNome = null;

    // 1. Prova login come agente (ASP.NET Identity)
    console.log('[DEBUG][POOL] sql.connected:', sql.connected);
    let agentResult = await new sql.Request()
      .input('username', sql.NVarChar, loginIdentifier)
      .query(`SELECT TOP 1 * FROM dbo.AspNetUsers WHERE UserName = @username OR Email = @username`);
    console.log('[DEBUG][POOL] sql.active:', sql.activeConnection);
    if (agentResult.recordset && agentResult.recordset.length > 0) {
      userType = 'agente';
      user = agentResult.recordset[0];
      console.log('[LOGIN] Utente agente trovato:', user);
      // Verifica password hash ASP.NET Identity
      const hash = user.PasswordHash;
      // Recupera ruoli e verifica se l'utente ha il ruolo AGENTE normalizzato
      const agentRoleResult = await new sql.Request()
        .input('userId', sql.NVarChar, user.Id)
        .query(`SELECT r.Name, r.NormalizedName FROM dbo.AspNetUserRoles ur JOIN dbo.AspNetRoles r ON ur.RoleId = r.Id WHERE ur.UserId = @userId`);
      ruoli = agentRoleResult.recordset.map(r => r.Name);
      // Normalizza i nomi ruolo per robustezza
      const roleNames = agentRoleResult.recordset.map(r => (r.NormalizedName || r.Name || '').toUpperCase());
      const isSuperMaster = roleNames.some(n => n.includes('SUPERMASTER'));
      const isMasterProdotti = roleNames.some(n => n.includes('MASTERPRODOTTI'));
      const isMaster = roleNames.some(n => n === 'MASTER' || (n.includes('MASTER') && !n.includes('SUPER') && !n.includes('PRODOTTI')));
      const isAgente = roleNames.some(n => n.includes('AGENTE'));
      const isDealer = roleNames.some(n => n.includes('DEALER'));

      console.log('[DEBUG] Ruoli trovati (Name):', ruoli);
      console.log('[DEBUG] Ruoli normalizzati:', roleNames);
      console.log('[DEBUG] Flags => isAgente:', isAgente, 'isDealer:', isDealer, 'isMaster:', isMaster, 'isMasterProdotti:', isMasterProdotti, 'isSuperMaster:', isSuperMaster);

      // Ordine di priorità: SUPERMASTER > MASTER > MASTERPRODOTTI > AGENTE > DEALER > LEGACY
      if (isSuperMaster) {
        // Autentica come supermaster
        console.log('[LOGIN] Utente AspNetUsers con ruolo SUPERMASTER:', loginIdentifier);
        const isPasswordValid = await aspnetIdentityPw.validatePassword(password, user.PasswordHash);
        if (!isPasswordValid) {
          console.log('[LOGIN] Password non valida per supermaster:', loginIdentifier);
          return res.status(401).json({
            error: 'Credenziali non valide',
            message: 'La password inserita non è corretta.'
          });
        }
        const tokenPayload = {
          userId: user.Id,
          email: user.Email,
          ruoli,
          supermaster: true
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
        return res.json({
          token,
          ruoli,
          userType: 'supermaster'
        });
      } else if (isMaster && !isAgente) {
        // Autentica come master
        console.log('[LOGIN] Utente AspNetUsers con ruolo MASTER:', loginIdentifier);
        console.log('[DEBUG] MASTER PasswordHash:', user.PasswordHash);
        const isPasswordValid = await aspnetIdentityPw.validatePassword(password, user.PasswordHash);
        if (!isPasswordValid) {
          console.log('[LOGIN] Password non valida per master:', loginIdentifier);
          return res.status(401).json({
            error: 'Credenziali non valide',
            message: 'La password inserita non è corretta.'
          });
        }
        const tokenPayload = {
          userId: user.Id,
          email: user.Email,
          ruoli,
          master: true
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
        return res.json({
          token,
          ruoli,
          userType: 'master'
        });
      } else if (isMasterProdotti && !isAgente) {
        // Autentica come masterprodotti
        console.log('[LOGIN] Utente AspNetUsers con ruolo MASTERPRODOTTI:', loginIdentifier);
        const isPasswordValid = await aspnetIdentityPw.validatePassword(password, user.PasswordHash);
        if (!isPasswordValid) {
          console.log('[LOGIN] Password non valida per masterprodotti:', loginIdentifier);
          return res.status(401).json({
            error: 'Credenziali non valide',
            message: 'La password inserita non è corretta.'
          });
        }
        const tokenPayload = {
          userId: user.Id,
          email: user.Email,
          ruoli,
          masterprodotti: true
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
        return res.json({
          token,
          ruoli,
          userType: 'masterprodotti'
        });
      } else if (isAgente) {
        // Verifica password hash ASP.NET Identity SOLO se ha ruolo 'agenti'
        const hash = user.PasswordHash;
        const isPasswordValid = await aspnetIdentityPw.validatePassword(password, hash);
        if (!isPasswordValid) {
          console.log('[LOGIN] Password non valida per agente:', loginIdentifier);
          return res.status(401).json({
            error: 'Credenziali non valide',
            message: 'La password inserita non è corretta.'
          });
        }
        // Recupera CodiceAgenteLarge da tbAgenti tramite RecapitoEmail
        let agenteNomeDB = null;
        try {
          const agentiQuery = await new sql.Request()
            .input('email', sql.NVarChar, user.Email || user.UserName)
            .query("SELECT CodiceAgenteLarge FROM dbo.tbAgenti WHERE RecapitoEmail = @email");
          if (agentiQuery.recordset && agentiQuery.recordset.length > 0) {
            agenteNomeDB = agentiQuery.recordset[0].CodiceAgenteLarge;
          }
        } catch (e) {
          console.error('[LOGIN] Errore lookup CodiceAgenteLarge da tbAgenti:', e);
        }
        agenteNome = agenteNomeDB || user.Nome || user.UserName || null;
        console.log('[LOGIN][DEBUG] agenteNomeDB:', agenteNomeDB);
        console.log('[LOGIN][DEBUG] user.Nome:', user.Nome);
        console.log('[LOGIN][DEBUG] user.UserName:', user.UserName);
        console.log('[LOGIN][DEBUG] agenteNome finale:', agenteNome);
        // Genera JWT
        const tokenPayload = {
          userId: user.Id,
          email: user.Email,
          ruoli,
          agenteNome
        };
        console.log('[LOGIN] Generazione token per agente:', tokenPayload);
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
        return res.json({
          token,
          ruoli,
          agenteNome: agenteNome,
          userType: 'agente'
        });
      } else if (isDealer) {
        // Autentica come dealer AspNetUsers
        console.log('[LOGIN] Utente AspNetUsers con ruolo DEALER:', loginIdentifier);
        const isPasswordValid = await aspnetIdentityPw.validatePassword(password, user.PasswordHash);
        if (!isPasswordValid) {
          console.log('[LOGIN] Password non valida per dealer AspNetUsers:', loginIdentifier);
          return res.status(401).json({
            error: 'Credenziali non valide',
            message: 'La password inserita non è corretta.'
          });
        }
        
        // Recupera dealerId e AGENTE dalla tabella tbDealers
        const dealerResult = await new sql.Request()
          .input('email', sql.NVarChar, user.Email)
          .query('SELECT IDDealer, RagioneSociale, AGENTE, IDGruppo FROM dbo.tbDealers WHERE RecapitoEmail = @email');
        
        if (dealerResult.recordset.length === 0) {
          console.log('[LOGIN] Dealer non trovato in tbDealers per:', user.Email);
          return res.status(400).json({
            error: 'Dati dealer non trovati',
            message: 'Il profilo dealer non è stato configurato correttamente.'
          });
        }
        
        const dealerData = dealerResult.recordset[0];
        console.log('[LOGIN] Dealer trovato - ID:', dealerData.IDDealer, 'Ragione Sociale:', dealerData.RagioneSociale);
        console.log('[LOGIN] IDGruppo dal database:', dealerData.IDGruppo);

        // Lookup opzionale idAgente da tbAgenti usando il codice agente (CodiceAgenteLarge) presente in tbDealers.AGENTE
        let agenteNomeFromDealer = dealerData.AGENTE || null;
        let idAgenteFromLookup = undefined;
        if (agenteNomeFromDealer) {
          try {
            const agLookup = await new sql.Request()
              .input('codice', sql.NVarChar, agenteNomeFromDealer)
              .query('SELECT TOP 1 IDAgente FROM dbo.tbAgenti WHERE CodiceAgenteLarge = @codice');
            if (agLookup.recordset && agLookup.recordset.length > 0) {
              idAgenteFromLookup = agLookup.recordset[0].IDAgente;
            }
          } catch (e) {
            console.warn('[LOGIN][DEALER ASPNET] Lookup idAgente fallita per codice', agenteNomeFromDealer, e.message);
          }
        }
        
        const tokenPayload = {
          userId: user.Id,
          email: user.Email,
          ruoli,
          role: 'dealer',
          dealer: true,
          dealerId: dealerData.IDDealer,
          ragioneSociale: dealerData.RagioneSociale,
          idGruppo: dealerData.IDGruppo || null,
          // Arricchimento agente
          agenteNome: agenteNomeFromDealer || null,
          idAgente: idAgenteFromLookup || undefined
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
        return res.json({
          token,
          ruoli,
          userType: 'dealer',
          dealerId: dealerData.IDDealer,
          dealerName: dealerData.RagioneSociale,
          agenteNome: tokenPayload.agenteNome,
          idAgente: tokenPayload.idAgente,
          user: {
            id: dealerData.IDDealer,
            email: user.Email,
            name: dealerData.RagioneSociale || user.Email,
            role: 'dealer',
            permissions: []
          }
        });
      } else {
        console.log('[LOGIN] Utente AspNetUsers senza ruolo riconosciuto, passo a dealer legacy:', loginIdentifier);
        // Skip agent/master login, proceed to dealer login logic
      }
    }

    // 2. Prova login come dealer (legacy)
    const request = new sql.Request();
    request.input('email', sql.NVarChar, loginIdentifier);
    const query = `SELECT * FROM dbo.tbDealers WHERE RecapitoEmail = @email`;
    console.log('Esecuzione query dealer:', query, 'con email:', loginIdentifier);
    const result = await request.query(query);
    if (!result.recordset || result.recordset.length === 0) {
      console.log('Nessun dealer trovato per email:', loginIdentifier);
      return res.status(401).json({
        error: 'Credenziali non valide',
        message: 'Nessun account trovato con questa email.'
      });
    }
    const dealer = result.recordset[0];
    // Password in chiaro (legacy)
    const isPasswordValid = password === dealer.TmpPasswd;
    if (!isPasswordValid) {
      console.log('Password non valida per il dealer:', dealer.RecapitoEmail);
      return res.status(401).json({
        error: 'Credenziali non valide',
        message: 'La password inserita non è corretta.'
      });
    }
    // Dealer: genera JWT con ruolo dealer
    const tokenPayload = {
      userId: dealer.IDDealer,
      email: dealer.RecapitoEmail,
      dealerId: dealer.IDDealer,
      phoneNumber: dealer.RecapitoCell || '',
      ruoli: ['dealer'],
      role: 'dealer',
      dealerName: dealer.RagioneSociale || dealer.RecapitoEmail,
      agenteNome: dealer.AGENTE || null, // Aggiunto il campo agenteNome al token
      // idAgente opzionale tramite lookup su tbAgenti usando CodiceAgenteLarge
      // Valorizzato subito sotto se possibile
    };
    // Lookup opzionale idAgente
    if (tokenPayload.agenteNome) {
      try {
        const agLookup = await new sql.Request()
          .input('codice', sql.NVarChar, tokenPayload.agenteNome)
          .query('SELECT TOP 1 IDAgente FROM dbo.tbAgenti WHERE CodiceAgenteLarge = @codice');
        if (agLookup.recordset && agLookup.recordset.length > 0) {
          tokenPayload.idAgente = agLookup.recordset[0].IDAgente;
        }
      } catch (e) {
        console.warn('[LOGIN][DEALER LEGACY] Lookup idAgente fallita per codice', tokenPayload.agenteNome, e.message);
      }
    }
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
    // Formatta telefono
    let phoneNumber = 'web_user';
    if (dealer.RecapitoCell) {
      const cleanNumber = dealer.RecapitoCell.replace(/\D/g, '').slice(-10);
      if (cleanNumber.length === 10) {
        phoneNumber = '39' + cleanNumber;
      }
    }
    // DISABILITATO: Invio notifica WhatsApp su login dealer
    /*
    if (dealer.RecapitoCell) {
      const whatsappPayload = {
        to: phoneNumber,
        message: `Login effettuato: accesso area riservata dealer ${dealer.RagioneSociale} (${dealer.RecapitoEmail})`
      };
      try {
        console.log('[NOTIFICA][WHATSAPP][LOGIN][INVIO] Numero:', whatsappPayload.to, '| Messaggio:', whatsappPayload.message);
        const waResp = await axios.post(process.env.WHATSAPP_BOT_URL, whatsappPayload);
        console.log('[NOTIFICA][WHATSAPP][LOGIN][SUCCESS] Risposta bot:', waResp.data);
      } catch (waErr) {
        console.error('[NOTIFICA][WHATSAPP][LOGIN][ERRORE]', waErr);
      }
    }
    */
    return res.json({
      token,
      dealerName: dealer.RagioneSociale || dealer.RecapitoEmail,
      phoneNumber,
      userType: 'dealer',
      ruoli: ['dealer'],
      agenteNome: tokenPayload.agenteNome,
      idAgente: tokenPayload.idAgente,
      user: {
        id: dealer.IDDealer,
        email: dealer.RecapitoEmail,
        name: dealer.RagioneSociale || dealer.RecapitoEmail,
        role: 'dealer',
        permissions: []
      }
    });
  } catch (err) {
    console.error('Errore durante il login:', err);
    res.status(500).json({
      error: 'Errore server',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Logout (stateless): endpoint di comodo per il frontend
// Non invalida realmente nulla lato server perché JWT è stateless.
app.post('/api/logout', (req, res) => {
  try {
    return res.json({ ok: true, message: 'Logout eseguito', timestamp: new Date().toISOString() });
  } catch (e) {
    return res.json({ ok: true });
  }
});

// In caso il client usi GET
app.get('/api/logout', (req, res) => {
  try {
    return res.json({ ok: true, message: 'Logout eseguito', timestamp: new Date().toISOString() });
  } catch (e) {
    return res.json({ ok: true });
  }
});

app.get('/api/attivazioni', authenticateToken, async (req, res) => {
  try {
    // Estrai il token JWT dall'header Authorization
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      // Token già verificato dal middleware; dati utente disponibili in req.user
      if (!req.user.userId) {
        return res.status(401).json({ error: 'Token non valido: userId mancante' });
      }
    } catch (err) {
      return res.status(401).json({ error: 'Token non valido o scaduto' });
    }

    // Usa dealerId dal token JWT
    const dealerId = req.user.dealerId;
    if (!dealerId) {
      return res.status(401).json({ error: 'ID dealer non valido' });
    }

    console.log('Esecuzione query attivazioni per dealer ID:', dealerId);
    
    try {
      // Trova la ragione sociale del dealer
      
      const request = new sql.Request();
      request.input('idDealer', sql.Int, dealerId);
      const dealerQuery = `SELECT RagioneSociale FROM dbo.tbDealers WHERE IDDealer = @idDealer`;
      const dealerRes = await request.query(dealerQuery);
      
      if (!dealerRes.recordset.length) {
        return res.status(404).json({ error: 'Dealer non trovato' });
      }
      
      const ragioneSociale = dealerRes.recordset[0].RagioneSociale;
      
      // Query per ottenere le ultime 5 attivazioni
      const query = `
        SELECT TOP 5
          CONVERT(VARCHAR(10), o.DataOra, 120) AS Data,
          offr.Titolo AS Titolo,
          offr.Tipo AS Tipo,
          offr.Segmento AS Segmento,
          so.StatoEsteso AS Stato
        FROM dbo.tbOrdini o
        LEFT JOIN dbo.tbStatiOrdini so ON o.Stato = so.IDStato
        LEFT JOIN dbo.TbOfferte offr ON o.idOfferta = offr.IDOfferta
        WHERE o.idDealer = @idDealer
        ORDER BY o.DataOra DESC`;
      
      console.log('Esecuzione query attivazioni:', query);
      
      const result = await request.query(query);
      
      console.log('Risultati query attivazioni:', JSON.stringify(result.recordset, null, 2));
      
      return res.json({ 
        ragioneSociale, 
        attivazioni: result.recordset || [] 
      });
      
    } catch (err) {
      console.error('Errore durante l\'esecuzione della query attivazioni:', err);
      throw err; // Rilancia l'errore per la gestione nel blocco catch esterno
    }
  } catch (err) {
    console.error('Errore in /api/attivazioni:', err);
    // Verifica se la risposta è già stata inviata
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Errore del server', 
        details: err.message,
        code: err.code
      });
    } else {
      console.error('Tentativo di inviare una risposta multipla per la stessa richiesta');
    }
  }
});

app.get('/api/ordini', authenticateToken, async (req, res) => {
  try {
    // Estrai il token JWT dall'header Authorization
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }
    const token = authHeader.substring(7);
    let email;
    try {
      const // Token già verificato dal middleware; dati utente disponibili in req.user
      email = req.user.email;
    } catch (err) {
      return res.status(401).json({ error: 'Token non valido' });
    }
    
    const request = new sql.Request();
    request.input('email', sql.NVarChar, email);
    // Trova idDealer e RagioneSociale dell'utente loggato
    const dealerQuery = `SELECT TOP 1 IDDealer, RagioneSociale FROM dbo.tbDealers WHERE RecapitoEmail = @email`;
    const dealerRes = await request.query(dealerQuery);
    if (!dealerRes.recordset.length) {
      return res.status(404).json({ error: 'Dealer non trovato per questa email' });
    }
    const idDealer = dealerRes.recordset[0].IDDealer;
    const ragioneSociale = dealerRes.recordset[0].RagioneSociale;
    // Query per ultimi 5 ordini del dealer
    request.input('idDealer', sql.Int, idDealer);
    const query = `
      SELECT TOP 5
        CONVERT(VARCHAR(10), op.DataOra, 120) AS Data,
        of.Titolo AS Prodotto,
        of.Tipo AS Tipo,
        op.TotaleOrdine AS Importo,
        op.SpeseSpedizione,
        op.idStatoOrdineProdotto AS Stato
      FROM dbo.tbOrdiniProdotti op
      LEFT JOIN dbo.tbOfferte of ON op.idOfferta = of.IDOfferta
      WHERE op.idDealer = @idDealer
      ORDER BY op.DataOra DESC`;

    const result = await request.query(query);
    res.json({ ragioneSociale, ordini: result.recordset });
  } catch (err) {
    console.error('ERRORE QUERY ORDINI:', err.message, err.stack);
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Errore del server', 
        details: err.message,
        code: err.code
      });
    } else {
      console.error('Tentativo di inviare una risposta multipla per la stessa richiesta');
    }
  }
});

// --- SUPERMASTER: Piani Incentivi upload & listing ---
// Middleware: solo SUPERMASTER
function onlySuperMaster(req, res, next) {
  try {
    if (!req.user) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }
    const ruoli = req.user.ruoli
      ? req.user.ruoli.map(r => (r || '').toUpperCase())
      : (req.user.ruolo ? [String(req.user.ruolo).toUpperCase()] : []);
    if (ruoli.includes('SUPERMASTER')) return next();
    return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
  } catch (e) {
    return res.status(403).json({ error: 'Errore di autorizzazione' });
  }
}

// POST upload PDF su S3 e INSERT metadata
app.post('/api/supermaster/piani-incentivi', authenticateToken, onlySuperMaster, upload.single('file'), async (req, res) => {
  try {
    const { periodo_label, mese, anno, validita_dal, validita_al, operatore } = req.body || {};
    if (!req.file) return res.status(400).json({ error: 'File mancante' });
    if (!mese || !anno || !validita_dal || !validita_al || !operatore) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    }
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Sono consentiti solo PDF' });
    }

    const mm = String(mese).padStart(2, '0');
    const yy = String(anno);
    const operClean = String(operatore).trim().replace(/[^A-Za-z0-9_-]/g, '_').replace(/\s+/g, '_').toUpperCase();
    const safeName = path.basename(req.file.originalname).replace(/[^A-Za-z0-9._-]/g, '_');
    const timestamp = Date.now();
    const s3Key = `PIANI/${yy}/${mm}/${operClean}/${timestamp}_${safeName}`;

    const s3res = await uploadToS3(req.file, 'PIANI', mm, yy, s3Key);

    // Crea tabella se mancante + migrazioni additive
    await new sql.Request().query(`
      IF OBJECT_ID('dbo.piani_incentivi', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.piani_incentivi (
          id INT IDENTITY(1,1) PRIMARY KEY,
          periodo_label NVARCHAR(100) NULL,
          mese INT NOT NULL,
          anno INT NOT NULL,
          validita_dal DATE NOT NULL,
          validita_al DATE NOT NULL,
          operatore NVARCHAR(50) NOT NULL,
          nome_file NVARCHAR(255) NOT NULL,
          url_s3 NVARCHAR(500) NOT NULL,
          s3_key NVARCHAR(500) NOT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
      END
      IF OBJECT_ID('dbo.piani_incentivi', 'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.piani_incentivi','s3_key') IS NULL ALTER TABLE dbo.piani_incentivi ADD s3_key NVARCHAR(500) NULL;
        IF COL_LENGTH('dbo.piani_incentivi','url_s3') IS NULL ALTER TABLE dbo.piani_incentivi ADD url_s3 NVARCHAR(500) NULL;
        IF COL_LENGTH('dbo.piani_incentivi','periodo_label') IS NULL ALTER TABLE dbo.piani_incentivi ADD periodo_label NVARCHAR(100) NULL;
        IF COL_LENGTH('dbo.piani_incentivi','created_at') IS NULL ALTER TABLE dbo.piani_incentivi ADD created_at DATETIME2 NULL;
        IF COL_LENGTH('dbo.piani_incentivi','nome_file') IS NULL ALTER TABLE dbo.piani_incentivi ADD nome_file NVARCHAR(255) NULL;
        IF COL_LENGTH('dbo.piani_incentivi','created_at') IS NOT NULL
        BEGIN
          UPDATE dbo.piani_incentivi SET created_at = ISNULL(created_at, SYSDATETIME());
        END
      END
    `);

    // Parametri comuni
    const baseReq = () => {
      const r = new sql.Request();
      r.input('mese', sql.Int, parseInt(mm, 10));
      r.input('anno', sql.Int, parseInt(yy, 10));
      r.input('validita_dal', sql.Date, new Date(validita_dal));
      r.input('validita_al', sql.Date, new Date(validita_al));
      r.input('operatore', sql.NVarChar, operatore);
      r.input('nome_file', sql.NVarChar, safeName);
      r.input('url_s3', sql.NVarChar, s3res.url);
      r.input('s3_key', sql.NVarChar, s3res.key);
      return r;
    };

    const tryInsertWith = async (label) => {
      const reqIns = baseReq();
      reqIns.input('periodo_label', sql.NVarChar, label);
      return await reqIns.query(`
        INSERT INTO dbo.piani_incentivi (periodo_label, mese, anno, validita_dal, validita_al, operatore, nome_file, url_s3, s3_key)
        OUTPUT INSERTED.id, INSERTED.periodo_label, INSERTED.mese, INSERTED.anno, INSERTED.validita_dal, INSERTED.validita_al, INSERTED.operatore, INSERTED.nome_file, INSERTED.url_s3, INSERTED.s3_key, INSERTED.created_at
        VALUES (@periodo_label, @mese, @anno, @validita_dal, @validita_al, @operatore, @nome_file, @url_s3, @s3_key)
      `);
    };

    let ins;
    // Mese in italiano maiuscolo per formato alternativo NOME_MESE/YYYY
    let meseNomeIT = DateTime.local(parseInt(yy, 10), parseInt(mm, 10), 1)
      .setLocale('it')
      .toFormat('MMMM')
      .toUpperCase();
    const candidates = [
      `${mm}/${yy}`,
      `${meseNomeIT}/${yy}`
    ];
    let lastErr;
    for (const candidate of candidates) {
      try {
        console.log(`[PIANI] Tentativo insert con periodo_label='${candidate}'`);
        ins = await tryInsertWith(candidate);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message : String(e);
        console.warn(`[PIANI] Insert fallita con '${candidate}':`, msg);
      }
    }
    if (!ins && lastErr) {
      throw lastErr;
    }

    const row = ins.recordset && ins.recordset[0] ? ins.recordset[0] : null;
    return res.status(201).json(row || { ok: true });
  } catch (err) {
    console.error('[SUPERMSTER PIANI POST] Errore:', err);
    return res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// GET elenco piani
app.get('/api/supermaster/piani-incentivi', authenticateToken, onlySuperMaster, async (req, res) => {
  try {
    const rs = await new sql.Request().query(`
      IF OBJECT_ID('dbo.piani_incentivi', 'U') IS NULL
      BEGIN
        SELECT TOP 0 1 AS id, '' AS periodo_label, 0 AS mese, 0 AS anno,
               CAST(NULL AS DATE) AS validita_dal, CAST(NULL AS DATE) AS validita_al,
               '' AS operatore, '' AS nome_file, '' AS url_s3, '' AS s3_key,
               SYSDATETIME() AS created_at
      END
      ELSE
      BEGIN
        SELECT id,
               COALESCE(periodo_label, CONCAT(FORMAT(DATEFROMPARTS(anno, mese, 1), 'MMMM', 'it-IT'), ' ', anno)) AS periodo,
               periodo_label, mese, anno, validita_dal, validita_al,
               operatore, nome_file, url_s3, s3_key, created_at
        FROM dbo.piani_incentivi
        ORDER BY created_at DESC, id DESC
      END
    `);
    return res.json(rs.recordset || []);
  } catch (err) {
    console.error('[SUPERMSTER PIANI GET] Errore:', err);
    return res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// --- API: KPI SuperMaster ---

// --- API: Attivazioni SuperMaster ---
app.get('/api/supermaster/attivazioni', authenticateToken, async (req, res) => {
  try {
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) {
      return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    }
    await getPool();
    const dbName = getDbName();
    // Allinea al resto dei KPI: mese corrente + filtro opzionale Agente
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextFirstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const agente = req.query.agente ? String(req.query.agente).trim() : null;

    const classicPart = `
        -- CLASSICHE (mese corrente)
        SELECT 
          FORMAT(o.DataOra, 'yyyy-MM-dd HH:mm') AS Data,
          CAST(o.IDOrdine AS VARCHAR(50)) AS IDAttivazione,
          d.RagioneSociale AS Dealer,
          ISNULL(o.Utente, '') AS Cliente,
          ofr.Titolo AS Offerta,
          ofr.Titolo AS Tipo,
          ISNULL(d.Agente, '') AS Agente,
          st.StatoEsteso AS Stato
        FROM dbo.tbOrdini o
        LEFT JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
        LEFT JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
        LEFT JOIN dbo.tbStatiOrdini st ON o.Stato = st.IDStato
        WHERE o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay AND o.Stato = 1
          AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)`;

    const tlcPart = `
        UNION ALL
        -- FASTWEB TLC (mese corrente)
        SELECT
          fw.[Data Inserimento Ordine] AS Data,
          fw.[AccountNumber] AS IDAttivazione,
          d.RagioneSociale AS Dealer,
          '' AS Cliente,
          fw.[Valore] AS Offerta,
          'FASTWEB TLC' AS Tipo,
          ISNULL(d.Agente, '') AS Agente,
          fw.[Stato dell'ordine CPQ] AS Stato
        FROM [${dbName}].[dbo].[InseritoFW] fw
        INNER JOIN dbo.tbDealers d ON fw.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR fw.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
        WHERE fw.[Data Inserimento Ordine] >= @firstDay AND fw.[Data Inserimento Ordine] < @nextFirstDay
          AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)`;

    const energyPart = `
        UNION ALL
        -- FASTWEB ENERGY (mese corrente)
        SELECT
          fwe.[DataBatch] AS Data,
          fwe.[Codice Contratto] AS IDAttivazione,
          d.RagioneSociale AS Dealer,
          '' AS Cliente,
          fwe.[Nome Offerta Vendita] AS Offerta,
          'FASTWEB ENERGY' AS Tipo,
          ISNULL(d.Agente, '') AS Agente,
          fwe.[Stato Contratto] AS Stato
        FROM [${dbName}].[dbo].[FWEnergiaImporter] fwe
        INNER JOIN dbo.tbDealers d ON fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY1] OR fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY2]
        WHERE fwe.[DataBatch] >= @firstDay AND fwe.[DataBatch] < @nextFirstDay
          AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)`;

    const query = `
      SELECT TOP 50 * FROM (
        ${classicPart}
        ${tlcPart}
        ${energyPart}
      ) AS Attivazioni
      ORDER BY Data DESC
    `;

    const request = new sql.Request();
    request.input('firstDay', sql.DateTime, firstDay);
    request.input('nextFirstDay', sql.DateTime, nextFirstDay);
    request.input('agente', sql.NVarChar, agente || null);
    const result = await request.query(query);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('[SUPERMASTER][ATTIVAZIONI] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero attivazioni', details: err.message });
  }
});

app.get('/api/supermaster/kpi', authenticateToken, async (req, res) => {
  try {
    // Verifica ruolo SUPERMASTER
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) {
      return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    }
    await getPool();
    const dbName = getDbName();
    const now = new Date();
    // Parametri opzionali
    const y = req.query.year != null ? parseInt(String(req.query.year), 10) : null;
    const m = req.query.month != null ? parseInt(String(req.query.month), 10) : null;
    const fromQ = req.query.from ? String(req.query.from) : null; // YYYY-MM o YYYY-MM-DD
    const toQ = req.query.to ? String(req.query.to) : null;
    // Provincia non più utilizzata
    const provincia = null;
    const agente = req.query.agente ? String(req.query.agente).trim() : null;
    const parseDate = (s) => {
      if (!s) return null;
      if (/^\d{4}-\d{2}$/.test(s)) return new Date(s + '-01');
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
      return null;
    };
    let firstDay = null, nextFirstDay = null, lastDay = null;
    if (fromQ && toQ) {
      const f = parseDate(fromQ);
      const t = parseDate(toQ);
      firstDay = f || new Date(now.getFullYear(), now.getMonth(), 1);
      const end = t ? new Date(t.getFullYear(), t.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), 1);
      nextFirstDay = new Date(end.getFullYear(), end.getMonth() + 1, 1);
      lastDay = new Date(nextFirstDay.getFullYear(), nextFirstDay.getMonth(), 0);
    } else if (y && m) {
      firstDay = new Date(y, m - 1, 1);
      nextFirstDay = new Date(y, m, 1);
      lastDay = new Date(y, m, 0);
    } else if (y) {
      firstDay = new Date(y, 0, 1);
      nextFirstDay = new Date(y + 1, 0, 1);
      lastDay = new Date(y, 12, 0);
    } else {
      firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      nextFirstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    console.log('[SUPERMASTER][KPI] params:', {
      year: y, month: m, from: fromQ, to: toQ, provincia, agente,
    }, 'range:', { firstDay, lastDay, nextFirstDay });

    // Attivazioni mese: somma tbOrdini + InseritoFW (FW TLC) + FWEnergiaImporter (FW Energy)
    // Finestra temporale unificata: >= @firstDay e < @nextFirstDay
    const attivazioniQuery = `
      WITH AttivazioniOrdini AS (
        SELECT CAST(o.IDOrdine AS VARCHAR(50)) AS Ordine
        FROM dbo.tbOrdini o
        LEFT JOIN dbo.tbDealers d ON d.IDDealer = o.idDealer
        WHERE o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay AND o.Stato = 1
          AND (@agente   IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
        GROUP BY o.IDOrdine
      ),
      AttivazioniFW AS (
        SELECT f.[Codice Ordine] AS Ordine
        FROM [${dbName}].[dbo].[InseritoFW] f
        INNER JOIN dbo.tbDealers d ON f.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR f.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
        WHERE f.[Data Inserimento Ordine] >= @firstDay AND f.[Data Inserimento Ordine] < @nextFirstDay
          AND (@agente   IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
        GROUP BY f.[Codice Ordine]
      ),
      AttivazioniEnergy AS (
        SELECT UPPER(LTRIM(RTRIM(REPLACE(REPLACE(CAST(fwe.[Codice Contratto] AS nvarchar(255)), CHAR(9), ''), CHAR(160), '')))) AS Ordine
        FROM [${dbName}].[dbo].[FWEnergiaImporter] fwe
        INNER JOIN dbo.tbDealers d ON fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY1] OR fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY2]
        WHERE fwe.[DataBatch] >= @firstDay AND fwe.[DataBatch] < @nextFirstDay
          AND (@agente   IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
        GROUP BY UPPER(LTRIM(RTRIM(REPLACE(REPLACE(CAST(fwe.[Codice Contratto] AS nvarchar(255)), CHAR(9), ''), CHAR(160), ''))))
      )
      SELECT COUNT(DISTINCT Ordine) as totale
      FROM (
        SELECT Ordine FROM AttivazioniOrdini
        UNION
        SELECT Ordine FROM AttivazioniFW
        UNION
        SELECT Ordine FROM AttivazioniEnergy
      ) AS AttivazioniUnione
    `;
    const attivazioniRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(attivazioniQuery);
    // Dealer attivi mese: unione tra tbOrdini, InseritoFW (FW TLC) e FWEnergiaImporter (FW Energy)
    // Finestra temporale unificata: >= @firstDay e < @nextFirstDay
    const dealerAttiviQuery = `
      WITH DealerOrdini AS (
        SELECT d.IDDealer
        FROM dbo.tbOrdini o
        INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
        WHERE o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay AND o.Stato = 1
        GROUP BY d.IDDealer
      ),
      DealerFW AS (
        SELECT d.IDDealer
        FROM [${dbName}].[dbo].[InseritoFW] f
        INNER JOIN dbo.tbDealers d ON f.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR f.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
        WHERE f.[Data Inserimento Ordine] >= @firstDay AND f.[Data Inserimento Ordine] < @nextFirstDay
        GROUP BY d.IDDealer
      ),
      DealerEnergy AS (
        SELECT d.IDDealer
        FROM [${dbName}].[dbo].[FWEnergiaImporter] fwe
        INNER JOIN dbo.tbDealers d ON fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY1] OR fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY2]
        WHERE fwe.[DataBatch] >= @firstDay AND fwe.[DataBatch] < @nextFirstDay
        GROUP BY d.IDDealer
      )
      SELECT COUNT(DISTINCT IDDealer) as totale
      FROM (
        SELECT IDDealer FROM DealerOrdini
        UNION
        SELECT IDDealer FROM DealerFW
        UNION
        SELECT IDDealer FROM DealerEnergy
      ) AS DealerUnione
    `;
    // FASTWEB TLC (solo mese corrente) - conteggio totale indipendente dal dealer
    const fastwebTlcQuery = `
      SELECT COUNT(DISTINCT f.[Codice Ordine]) AS totale
      FROM [${dbName}].[dbo].[InseritoFW] f
      INNER JOIN dbo.tbDealers d ON f.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR f.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
      WHERE f.[Data Inserimento Ordine] >= @firstDay AND f.[Data Inserimento Ordine] < @nextFirstDay
        AND (@agente   IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
    `;
    const fastwebTlcRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(fastwebTlcQuery);
    const fastwebTlc = fastwebTlcRes.recordset[0]?.totale || 0;
    console.log('[SUPERMASTER][KPI] FW TLC:', fastwebTlc);
    // FASTWEB ENERGY (solo mese corrente) - conteggio totale indipendente dal dealer
    const fastwebEnergyQuery = `
      SELECT COUNT(DISTINCT UPPER(LTRIM(RTRIM(REPLACE(REPLACE(CAST(f.[Codice Contratto] AS nvarchar(255)), CHAR(9), ''), CHAR(160), ''))))) AS totale
      FROM [${dbName}].[dbo].[FWEnergiaImporter] f
      INNER JOIN dbo.tbDealers d ON f.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY1] OR f.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY2]
      WHERE f.[DataBatch] >= @firstDay AND f.[DataBatch] < @nextFirstDay
        AND (@agente   IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
    `;
    const fastwebEnergyRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(fastwebEnergyQuery);
    const fastwebEnergy = fastwebEnergyRes.recordset[0]?.totale || 0;
    console.log('[SUPERMASTER][KPI] FW Energy:', fastwebEnergy);

    // FASTWEB FISSI/MOBILI (solo per cards) basata su viewLastStatoOrdiniNoUnion e tbPianiFastweb
    // Usa l'ultimo Batch disponibile per il mese richiesto
    const fwSplitQuery = `
      DECLARE @year int = YEAR(@firstDay);
      DECLARE @month int = MONTH(@firstDay);

      WITH CTE_MaxBatchPerMese AS (
        SELECT Year, Month, MAX(Batch) AS MaxBatch
        FROM dbo.viewLastStatoOrdiniNoUnion
        GROUP BY Year, Month
      ),
      CTE_FilteredOrdini AS (
        SELECT ins.Valore,
               ins.[Codice Comsy Tecnico Attuale],
               ins.Month,
               ins.Year,
               ins.Batch,
               tf.TIPO_Fastweb
        FROM dbo.viewLastStatoOrdiniNoUnion AS ins
        LEFT OUTER JOIN dbo.tbPianiFastweb AS tf ON ins.Valore = tf.VALORE
        INNER JOIN CTE_MaxBatchPerMese AS maxBatch
          ON ins.Year = maxBatch.Year AND ins.Month = maxBatch.Month AND ins.Batch = maxBatch.MaxBatch
      )
      SELECT
        SUM(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' THEN 1 ELSE 0 END) AS Mobile_FW,
        SUM(CASE WHEN fo.TIPO_Fastweb = 'FISSO'  THEN 1 ELSE 0 END) AS Fissi_FW
      FROM CTE_FilteredOrdini AS fo
      LEFT JOIN dbo.tbDealers AS d
        ON (fo.[Codice Comsy Tecnico Attuale] = d.COMSY1 AND d.COMSY1 LIKE 'NR.1217%')
        OR (fo.[Codice Comsy Tecnico Attuale] = d.COMSY2 AND d.COMSY2 LIKE 'NS.1638%')
      WHERE fo.Year = @year AND fo.Month = @month
        AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente);
    `;
    let fastwebFissi = 0, fastwebMobili = 0;
    try {
      const fwSplitRes = await (new sql.Request())
        .input('firstDay', sql.DateTime, firstDay)
        .input('agente', sql.NVarChar, agente || null)
        .query(fwSplitQuery);
      fastwebMobili = Number(fwSplitRes.recordset?.[0]?.Mobile_FW || 0);
      fastwebFissi  = Number(fwSplitRes.recordset?.[0]?.Fissi_FW  || 0);
      console.log('[SUPERMASTER][KPI] FW split Fissi/Mobili:', fastwebFissi, fastwebMobili);
    } catch (e) {
      console.warn('[SUPERMASTER][KPI] FW split non disponibile:', e.message);
    }

    // Attivazioni giornaliere (KPI card): solo OGGI per tutte le fonti, con colonne data coerenti
    // Finestra: oggi (>= oggi 00:00, < domani 00:00)
    const attivazioniGiornaliereQuery = `
      SELECT 
        (
          SELECT COUNT(*)
          FROM [${dbName}].dbo.view_ordini_dealers
          WHERE DataOra >= CONVERT(date, GETDATE())
            AND DataOra <  DATEADD(day, 1, CONVERT(date, GETDATE()))
        )
        + (
          SELECT COUNT(*)
          FROM [${dbName}].[dbo].[InseritoFW]
          WHERE [Data Inserimento Ordine] >= CONVERT(date, GETDATE())
            AND [Data Inserimento Ordine] <  DATEADD(day, 1, CONVERT(date, GETDATE()))
        )
        + (
          SELECT COUNT(*)
          FROM [${dbName}].[dbo].[FWEnergiaImporter]
          WHERE [DataBatch] >= CONVERT(date, GETDATE())
            AND [DataBatch] <  DATEADD(day, 1, CONVERT(date, GETDATE()))
        ) AS TotaleOrdini;
    `;
    let attivazioniGiornaliere = 0;
    try {
      const giornaliereRes = await sql.query(attivazioniGiornaliereQuery);
      attivazioniGiornaliere = giornaliereRes.recordset?.[0]?.TotaleOrdini ?? 0;
    } catch (e) {
      console.error('[SUPERMASTER][KPI] Errore query attivazioni giornaliere:', e.message);
    }
    // Agenti attivi mese
    const agentiAttiviQuery = `SELECT COUNT(DISTINCT idAgente) as totale FROM dbo.tbOrdini WHERE DataOra >= @firstDay AND DataOra <= @lastDay AND idAgente IS NOT NULL`;
    // Plafond residuo totale
    const plafondQuery = `SELECT ISNULL(SUM(t.crediti), 0) AS credito FROM dbo.tbtransazioni t JOIN dbo.tbdealers d ON t.iddealer = d.iddealer`;
    // Offerta più venduta mese
    const topOfferQuery = `SELECT TOP 1 o.idOfferta, ofr.Titolo, COUNT(*) as vendute FROM dbo.tbOrdini o LEFT JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta WHERE o.DataOra >= @firstDay AND o.DataOra <= @lastDay GROUP BY o.idOfferta, ofr.Titolo ORDER BY vendute DESC`;
    const sqlRequest = new sql.Request();
    sqlRequest.input('firstDay', sql.DateTime, firstDay);
    sqlRequest.input('lastDay', sql.DateTime, lastDay);
    sqlRequest.input('nextFirstDay', sql.DateTime, nextFirstDay);
    sqlRequest.input('agente', sql.NVarChar, agente || null);
    // Dealer attivi mese: solo per range date
    const dealerAttiviRes = await sqlRequest.query(dealerAttiviQuery);
    // Esegui le altre query in parallelo
    const [agentiAttiviRes, plafondRes, topOfferRes] = await Promise.all([
      sqlRequest.query(agentiAttiviQuery),
      sql.query(plafondQuery),
      sqlRequest.query(topOfferQuery)
    ]);
    // Calcolo andamento attivazioni mese vs mese precedente
    // 1. Calcola range mese precedente
    const prevFirstDay = new Date(firstDay.getFullYear(), firstDay.getMonth() - 1, 1);
    const prevLastDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), 0);
    // 2. Query attivazioni mese precedente (tbOrdini)
    const attivazioniPrevQuery = `
      WITH AttivazioniOrdini AS (
        SELECT CAST(o.IDOrdine AS VARCHAR(50)) AS Ordine
        FROM dbo.tbOrdini o
        WHERE o.DataOra >= @prevFirstDay AND o.DataOra <= @prevLastDay AND o.Stato = 1
        GROUP BY o.IDOrdine
      ),
      AttivazioniFW AS (
        SELECT f.[Codice Ordine] AS Ordine
        FROM [${dbName}].[dbo].[InseritoFW] f
        INNER JOIN dbo.tbDealers d ON f.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR f.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
        WHERE f.[Data Inserimento Ordine] >= @prevFirstDay AND f.[Data Inserimento Ordine] <= @prevLastDay
        GROUP BY f.[Codice Ordine]
      )
      SELECT COUNT(DISTINCT Ordine) as totale
      FROM (
        SELECT Ordine FROM AttivazioniOrdini
        UNION
        SELECT Ordine FROM AttivazioniFW
      ) AS AttivazioniUnione
    `;
    // Query attivazioni mese precedente senza batch, solo per range date
    const attivazioniPrevRes = await (new sql.Request())
      .input('prevFirstDay', sql.DateTime, prevFirstDay)
      .input('prevLastDay', sql.DateTime, prevLastDay)
      .query(attivazioniPrevQuery);
    const attivazioniMese = attivazioniRes.recordset[0]?.totale || 0;
    console.log('[SUPERMASTER][KPI] Attivazioni mese:', attivazioniMese);
    const attivazioniMesePrec = attivazioniPrevRes.recordset[0]?.totale || 0;
    let andamentoAttivazioniPercentuale = 0;
    if (attivazioniMesePrec > 0) {
      andamentoAttivazioniPercentuale = Math.round(((attivazioniMese - attivazioniMesePrec) / attivazioniMesePrec) * 100);
    } else if (attivazioniMese > 0) {
      andamentoAttivazioniPercentuale = 100;
    }
    // SKY (tbOrdini/tbOfferte) con filtri periodo + agente
    const skyQuery = `
      SELECT COUNT(*) AS totale
      FROM dbo.tbOrdini o
      INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
      LEFT JOIN dbo.tbDealers d ON d.IDDealer = o.idDealer
      WHERE o.Stato = 1
        AND COALESCE(o.DataStato, o.DataOra) >= @firstDay AND COALESCE(o.DataStato, o.DataOra) < @nextFirstDay
        AND ofr.idOperatore IN (3, 8, 12, 14)
        AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
    `;
    const skyRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(skyQuery);
    const sky = skyRes.recordset?.[0]?.totale || 0;
    console.log('[SUPERMASTER][KPI] SKY:', sky);

    // ILIAD (tbOrdini/tbOfferte) con filtri periodo + agente
    const iliadQuery = `
      SELECT COUNT(*) AS totale
      FROM dbo.tbOrdini o
      INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
      LEFT JOIN dbo.tbDealers d ON d.IDDealer = o.idDealer
      WHERE o.Stato = 1
        AND o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay
        AND ofr.idOperatore = 5
        AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
    `;
    const iliadRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(iliadQuery);
    const iliad = iliadRes.recordset?.[0]?.totale || 0;
    console.log('[SUPERMASTER][KPI] ILIAD:', iliad);

    res.json({
      attivazioniMese,
      attivazioniGiornaliere,
      dealerAttiviMese: dealerAttiviRes.recordset[0]?.totale || 0,
      agentiAttiviMese: agentiAttiviRes.recordset[0]?.totale || 0,
      plafondTotale: plafondRes.recordset[0]?.credito || 0,
      topOffer: topOfferRes.recordset[0] || null,
      fastwebTlc,
      fastwebFissi,
      fastwebMobili,
      fastwebEnergy,
      andamentoAttivazioniPercentuale,
      sky,
      iliad,
    });
  } catch (err) {
    console.error('[SUPERMASTER][KPI] Errore:', err);
    res.status(500).json({ error: 'Errore nel calcolo KPI', details: err.message });
  }
});

// --- API: KPI SKY (mese corrente) ---
app.get('/api/supermaster/kpi/sky', authenticateToken, async (req, res) => {
  try {
    // Verifica ruolo SUPERMASTER
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) {
      return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    }

    await getPool();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextFirstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Conteggio attivazioni SKY mese corrente su tbOrdini/tbOfferte
    const skyQuery = `
      SELECT COUNT(*) AS totale
      FROM dbo.tbOrdini o
      INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
      WHERE o.Stato = 1
        AND o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay
        AND ofr.idOperatore IN (3, 8, 12, 14)
    `;

    const skyRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .query(skyQuery);

    const sky = skyRes.recordset?.[0]?.totale || 0;
    return res.json({ sky });
  } catch (err) {
    console.error('[SUPERMASTER][KPI][SKY] Errore:', err);
    return res.status(500).json({ error: 'Errore nel calcolo KPI SKY', details: err.message });
  }
});

// --- API: KPI ILIAD (mese corrente) ---
app.get('/api/supermaster/kpi/iliad', authenticateToken, async (req, res) => {
  try {
    // Verifica ruolo SUPERMASTER
    const ruoli = req.user?.ruoli || [];
    const isSuperMaster = Array.isArray(ruoli)
      ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
      : String(ruoli).toUpperCase() === 'SUPERMASTER';
    if (!isSuperMaster) {
      return res.status(403).json({ error: 'Accesso riservato al ruolo SUPERMASTER' });
    }

    await getPool();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextFirstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Conteggio attivazioni ILIAD mese corrente su tbOrdini/tbOfferte
    const iliadQuery = `
      SELECT COUNT(*) AS totale
      FROM dbo.tbOrdini o
      INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
      WHERE o.Stato = 1
        AND o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay
        AND ofr.idOperatore = 5
    `;

    const iliadRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .query(iliadQuery);

    const iliad = iliadRes.recordset?.[0]?.totale || 0;
    return res.json({ iliad });
  } catch (err) {
    console.error('[SUPERMASTER][KPI][ILIAD] Errore:', err);
    return res.status(500).json({ error: 'Errore nel calcolo KPI ILIAD', details: err.message });
  }
});

// --- API: ATTIVAZIONI (POST) ---

app.post('/api/attivazioni', authenticateToken, upload.any(), async (req, res) => {
  console.log('[DEBUG] /api/attivazioni req.body:', req.body);
  // ... (rest of the code remains the same)
  console.log('[DEBUG] /api/attivazioni req.files:', req.files);

  // --- PATCH: Parse intestatario and altriDati fields if they are JSON strings ---
  let intestatario = req.body.intestatario;
  let altriDati = req.body.altriDati;
  try {
    if (typeof intestatario === 'string' && intestatario.trim().length > 0) {
      intestatario = JSON.parse(intestatario);
      req.body.intestatario = intestatario;
    }
  } catch (e) {
    console.error('[ATTIVAZIONE][ERRORE] intestatario JSON parsing failed:', e, intestatario);
    intestatario = {};
    req.body.intestatario = {};
  }
  try {
    if (typeof altriDati === 'string' && altriDati.trim().length > 0) {
      altriDati = JSON.parse(altriDati);
      req.body.altriDati = altriDati;
    }
  } catch (e) {
    console.error('[ATTIVAZIONE][ERRORE] altriDati JSON parsing failed:', e, altriDati);
    altriDati = {};
    req.body.altriDati = {};
  }
  console.log('[DEBUG][PATCH] intestatario (parsed):', intestatario);
  console.log('[DEBUG][PATCH] altriDati (parsed):', altriDati);
  const transaction = new sql.Transaction();
  try {
    
    await transaction.begin();
    const request = new sql.Request(transaction);

    // 1. Estrai dati principali dal body
    const {
      idOfferta,
      files = [], // [{ tipoFile, fileUID, nomeFile }]
      intestatario = {}, // dati intestatario (JSON)
      simType = null,
      simCount: originalSimCount = null,
      noteInterne = null,
      noteDealer = null,
      stato = 0, // DA_ELABORARE
      utente = null,   // email utente
    } = req.body;
    // Usa direttamente altriDati come oggetto (già parsato dalla patch iniziale)
    const altriDati = req.body.altriDati || {};
    // L'inserimento attivazioni è sempre singolo (1 SIM)
    const simCount = 1;
    const idDealer = req.user.dealerId;
    // CORREZIONE: Assicurati che idAgente sia un numero valido o null
    const rawIdAgente = req.user.userId || null;
    const idAgente = rawIdAgente && !isNaN(Number(rawIdAgente)) ? Number(rawIdAgente) : null;
    console.log('[DEBUG][AGENTE] idAgente processato:', { raw: rawIdAgente, processed: idAgente });
    
    // CORREZIONE: Gestisci campo Utente obbligatorio per richieste assistenza
    // Se utente è null, usa l'email del dealer/agente dal token JWT
    const utenteFinale = utente || req.user.email || req.user.agenteNome || 'Sistema';
    console.log('[DEBUG][UTENTE] Campo utente:', { utente, utenteFinale, userEmail: req.user.email, agenteNome: req.user.agenteNome });
    const now = new Date();

    // 1.1. Recupera automaticamente i crediti dell'offerta per calcolare il plafondCost
    console.log('[DEBUG][PLAFOND] Recupero crediti per offerta:', idOfferta);
    const offertaQuery = await request
      .input('idOfferta', sql.Int, idOfferta)
      .query('SELECT Crediti, Titolo, SIMTYPE, IDOperatore, TemplateDatiOfferta FROM dbo.tbOfferte WHERE IDOfferta = @idOfferta');
    
    const offertaData = offertaQuery.recordset[0];
    if (!offertaData) {
      console.error('[PLAFOND][ERRORE] Offerta non trovata:', idOfferta);
      return res.status(400).json({ error: 'Offerta non trovata' });
    }

    // Controllo server-side: verifica credito disponibile prima di procedere
    // Calcola prezzo EUR dell'offerta partendo da tbOfferte.Crediti
    let prezzoEUR = 0;
    try {
      const credRaw = Number(offertaData?.Crediti ?? 0);
      prezzoEUR = Number.isFinite(credRaw) ? (credRaw >= 100 ? (credRaw / 100) : credRaw) : 0;
    } catch (_) { prezzoEUR = 0; }

    try {
      const saldoRes = await (new sql.Request(transaction))
        .input('idDealer', sql.Int, idDealer)
        .query(`
          SELECT ISNULL(SUM(t.crediti), 0) AS credito
          FROM dbo.tbtransazioni t
          JOIN dbo.tbdealers d ON t.iddealer = d.iddealer
          WHERE d.iddealer = @idDealer
        `);
      const saldoEUR = Number(saldoRes?.recordset?.[0]?.credito ?? 0) || 0;
      if (prezzoEUR > 0 && saldoEUR < prezzoEUR) {
        await transaction.rollback();
        return res.status(402).json({ error: 'FONDI INSUFFICIENTI. RICARICA PLAFOND' });
      }
    } catch (e) {
      try { await transaction.rollback(); } catch {}
      console.error('[ATTIVAZIONE][PLAFOND] Errore controllo credito:', e?.message || e);
      return res.status(500).json({ error: 'Errore controllo credito plafond' });
    }

    // NUOVO: Sistema dinamico basato su template
    const templateName = offertaData.TemplateDatiOfferta || req.body.templateName;
    console.log('[DEBUG][TEMPLATE] Caricamento template:', templateName);
    
    const template = await loadTemplate(templateName);
    if (!template) {
      console.warn('[TEMPLATE] Template non trovato, uso mapping di fallback');
    }
    
    // NUOVO: Mapping dinamico dei dati basato su template
    const datiDinamici = {};
    const datiIntestatarioDinamici = {};
    
    if (template && template.campi) {
      // Mappa i campi dal template
      template.campi.forEach(campo => {
        const key = campo.key;
        let valore = null;
        
        // Cerca il valore nei vari oggetti del body
        if (req.body[key] !== undefined) {
          valore = req.body[key];
        } else if (intestatario[key] !== undefined) {
          valore = intestatario[key];
        } else if (altriDati[key] !== undefined) {
          valore = altriDati[key];
        }
        
        if (valore !== null && valore !== undefined && valore !== '') {
          // Determina se è un campo intestatario o dati ordine
          const isIntestatario = ['NOME_E_COGNOME', 'CODICE_FISCALE', 'CF_', 'DATA_DI_NASCITA', 
                                  'LUOGO_DI_NASCITA', 'INDIRIZZO', 'CAP', 'CITTA', 
                                  'PROVINCIA', 'EMAIL', 'TELEFONO', 'PEC'].some(prefix => 
                                  key.toUpperCase().includes(prefix));
          
          if (isIntestatario) {
            datiIntestatarioDinamici[key] = valore;
          } else {
            datiDinamici[key] = valore;
          }
        }
      });
      
      console.log('[DEBUG][TEMPLATE] Dati intestatario dinamici:', Object.keys(datiIntestatarioDinamici));
      console.log('[DEBUG][TEMPLATE] Dati ordine dinamici:', Object.keys(datiDinamici));
    } else {
      // Fallback: usa i dati come arrivano
      console.log('[DEBUG][TEMPLATE] Uso fallback - dati originali');
      Object.assign(datiIntestatarioDinamici, intestatario);
      Object.assign(datiDinamici, altriDati);
    }
    
    // Calcola il plafondCost automaticamente (solo se l'offerta ha crediti > 0)
    const creditiOfferta = offertaData.Crediti || 0;
    const titoloOfferta = offertaData.Titolo || 'Offerta sconosciuta';
    const simTypeOfferta = offertaData.SIMTYPE;
    const idOperatoreOfferta = offertaData.IDOperatore;
    const templateOfferta = offertaData.TemplateDatiOfferta;
    
    // ⚡ VALIDAZIONE CRITICA: Blocca ordini con payload completamente vuoti
    const hasDatiIntestario = Object.keys(datiIntestatarioDinamici).length > 0;
    const hasDatiOrdine = Object.keys(datiDinamici).length > 0;
    
    if (!hasDatiIntestario && !hasDatiOrdine) {
      const errorMsg = `Errore critico: Nessun dato ricevuto per l'ordine. Possibile problema browser/JavaScript. Template: ${templateOfferta}, Utente: ${req.user?.email || 'unknown'}`;
      console.error('[VALIDATION-CRITICAL]', errorMsg);
      console.error('[VALIDATION-DEBUG] intestatario originale:', intestatario);
      console.error('[VALIDATION-DEBUG] altriDati originale:', altriDati);
      console.error('[VALIDATION-DEBUG] req.body keys:', Object.keys(req.body));
      
      await transaction.rollback();
      return res.status(400).json({ 
        error: 'Dati mancanti. Riprova o contatta il supporto se il problema persiste.',
        code: 'EMPTY_PAYLOAD_BLOCKED',
        debug: process.env.NODE_ENV === 'development' ? {
          template: templateOfferta,
          intestatarioKeys: Object.keys(intestatario || {}),
          altriDatiKeys: Object.keys(altriDati || {}),
          bodyKeys: Object.keys(req.body)
        } : undefined
      });
    }
    
    // Log di sicurezza per monitoraggio
    if (!hasDatiIntestario) {
      console.warn('[VALIDATION-WARNING] Payload intestario vuoto ma ordine ha dati:', {
        ordine: Object.keys(datiDinamici),
        template: templateOfferta,
        utente: req.user?.email
      });
    }
    
    // NUOVO: Determina se è un ordine assistenza (IDOperatore = 10 o flag esplicito)
    // Supporta sia il riconoscimento automatico che il flag esplicito dal frontend
    const isAssistenzaExplicit = req.body.isAssistenza === 'true' || req.body.isAssistenza === true;
    const isAssistenza = idOperatoreOfferta === 10 || isAssistenzaExplicit;
    console.log('[DEBUG][ASSISTENZA] Determinazione flag assistenza:', { 
      idOperatoreOfferta, 
      isAssistenzaExplicit, 
      flagFinale: isAssistenza 
    });
    
    // CORREZIONE: Dividi per 100 prima di rendere negativo (es: 1000 crediti = -10 plafondCost)
    const plafondCost = creditiOfferta > 0 ? -(creditiOfferta / 100) : 0; // Negativo per scalare, sempre 1 attivazione
    
    console.log('[DEBUG][PLAFOND] Calcolo automatico:', {
      idOfferta,
      titoloOfferta,
      creditiOfferta,
      simTypeOfferta,
      idOperatoreOfferta,
      templateOfferta,
      isAssistenza,
      plafondCost: plafondCost,
      note: creditiOfferta === 0 ? 'Offerta gratuita' : simTypeOfferta ? 'Offerta con SIM' : 'Servizio senza SIM'
    });

    // 2. Inserisci in tbOrdini (nuovo request per evitare duplicazione parametri)
    const ordineRequest = new sql.Request(transaction);
    const ordineResult = await ordineRequest
      .input('DataOra', sql.DateTime, now)
      .input('idAgente', sql.Int, idAgente)
      .input('idDealer', sql.Int, idDealer)
      .input('idOfferta', sql.Int, idOfferta)
      .input('Stato', sql.Int, stato)
      .input('Utente', sql.NVarChar, utenteFinale)
      .input('NoteInterne', sql.NVarChar, noteInterne)
      .input('NoteDealer', sql.NVarChar, noteDealer)
      .input('SIMTYPE', sql.NVarChar, simType)
      .input('SIMCOUNT', sql.Int, simCount)
      .input('DataStato', sql.DateTime, now)
      .input('ASSISTENZA', sql.Bit, isAssistenza)
      .query(`INSERT INTO dbo.tbOrdini (DataOra, idAgente, idDealer, idOfferta, Stato, Utente, NoteInterne, NoteDealer, SIMTYPE, SIMCOUNT, DataStato, ASSISTENZA)
              OUTPUT INSERTED.IDOrdine
              VALUES (@DataOra, @idAgente, @idDealer, @idOfferta, @Stato, @Utente, @NoteInterne, @NoteDealer, @SIMTYPE, @SIMCOUNT, @DataStato, @ASSISTENZA)`);
    const idOrdine = ordineResult.recordset[0].IDOrdine;

    // 3. Inserisci in tbDatiIntestario - SISTEMA DINAMICO
    // Estrai il cognome dai dati dinamici per il campo Cognome richiesto dalla tabella
    let cognome = 'Non specificato';
    
    // Cerca il nome completo nei dati dinamici
    const nomeCompleto = datiIntestatarioDinamici['NOME_E_COGNOME'] || 
                        datiIntestatarioDinamici['NOME_E_COGNOME_INTESTATARIO_CONTRATTO'] || 
                        datiIntestatarioDinamici['NOME_E_COGNOME_INTESTATARIO'] || '';
    
    if (nomeCompleto) {
      cognome = nomeCompleto.split(' ').pop() || 'Non specificato';
    }
    
    console.log('[DEBUG][INTESTATARIO] Payload dinamico:', datiIntestatarioDinamici);
    console.log('[DEBUG][INTESTATARIO] Cognome estratto:', cognome);
    
    await (new sql.Request(transaction))
      .input('IDOrdine', sql.Int, idOrdine)
      .input('Tipo', sql.Int, 0)
      .input('Cognome', sql.NVarChar, cognome)
      .input('Payload', sql.NVarChar(sql.MAX), JSON.stringify(datiIntestatarioDinamici))
      .query(`INSERT INTO dbo.tbDatiIntestario (IDOrdine, Tipo, Cognome, Payload) VALUES (@IDOrdine, @Tipo, @Cognome, @Payload)`);

    // ... (rest of the code remains the same)

    // 4. Inserisci in tbDatiOrdine - SISTEMA DINAMICO
    console.log('[DEBUG][ORDINE] Payload dinamico:', datiDinamici);
    
    await (new sql.Request(transaction))
      .input('IDOrdine', sql.Int, idOrdine)
      .input('AppliedConfig', sql.NVarChar, null)
      .input('Payload', sql.NVarChar(sql.MAX), JSON.stringify(datiDinamici))
      .query(`INSERT INTO dbo.tbDatiOrdine (IDOrdine, AppliedConfig, Payload) VALUES (@IDOrdine, @AppliedConfig, @Payload)`);

    // 5. Inserisci file in tbFileOrdine
    // Usa import ESM in alto:
// import { v4 as uuidv4 } from 'uuid';
// (già importato in testa al file o aggiungere se manca)


    // Determine contractYear, contractMonth, and orderNumber for S3 path
    const contractYear = now.getFullYear().toString();
    const contractMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const orderNumber = idOrdine;

    for (const file of req.files || []) {
      // Upload file to S3
      let s3result = null;
      try {
        // Usa bucket specifico per attivazioni
        s3result = await uploadToS3(file, orderNumber, contractMonth, contractYear, null, 'attivazionistation');
      } catch (e) {
        console.error('[ATTIVAZIONE][S3 UPLOAD ERROR]', e);
        throw new Error('Errore durante upload file su S3: ' + (e.message || e));
      }
      // Map multer fields to expected DB structure
      const tipoFile = file.fieldname;
      const originalName = file.originalname;
      const fileUID = uuidv4();
      const nomeFile = `${fileUID}_${originalName}`;
      // Store S3 info in Payload as JSON
      const payloadObj = {
        s3Url: s3result.url,
        s3Key: s3result.key,
        originalName: s3result.originalName
      };
      await (new sql.Request(transaction))
        .input('IDOrdine', sql.Int, idOrdine)
        .input('TipoFile', sql.NVarChar, tipoFile)
        .input('FileUID', sql.NVarChar, fileUID)
        .input('NomeFile', sql.NVarChar, nomeFile)
        .input('Payload', sql.NVarChar, JSON.stringify(payloadObj))
        .query(`INSERT INTO dbo.tbFileOrdine (IDOrdine, TipoFile, FileUID, NomeFile, Payload) VALUES (@IDOrdine, @TipoFile, @FileUID, @NomeFile, @Payload)`);
    }

    // 6. Scala plafond in tbTransazioni se serve
    if (plafondCost < 0) {
      const descrizioneTransazione = `ORDINE ${idOrdine} - ${titoloOfferta}`;
      console.log('[DEBUG][PLAFOND] Scalamento plafond:', {
        idDealer,
        crediti: plafondCost,
        descrizione: descrizioneTransazione
      });
      
      await request
        .input('Descrizione', sql.NVarChar, descrizioneTransazione)
        .input('idDealer', sql.Int, idDealer)
        .input('Crediti', sql.Int, plafondCost)
        .input('DataOra', sql.DateTime, now)
        .input('idAgente', sql.Int, idAgente)
        .input('Fonte', sql.NVarChar, 'OFF')
        .input('Payload', sql.NVarChar, null)
        .input('Note', sql.NVarChar, null)
        .input('Riferimento', sql.Int, idOrdine)
        .query(`INSERT INTO dbo.tbTransazioni (Descrizione, idDealer, Crediti, DataOra, idAgente, Fonte, Payload, Note, Riferimento)
                VALUES (@Descrizione, @idDealer, @Crediti, @DataOra, @idAgente, @Fonte, @Payload, @Note, @Riferimento)`);
      
      console.log('[DEBUG][PLAFOND] Plafond scalato con successo:', plafondCost, 'crediti');
    } else if (creditiOfferta === 0) {
      console.log('[DEBUG][PLAFOND] Offerta gratuita, nessun scalamento necessario');
    }

    await transaction.commit();
    
    console.log('[DEBUG][EMAIL] Tentativo invio email per ordine:', idOrdine);
    
    // Invia email di conferma attivazione
    try {
      console.log('[DEBUG][EMAIL] Chiamata emailService.sendOrderEmail...');
      await emailService.sendOrderEmail('NUOVA_ATTIVAZIONE', idOrdine, {
        isAssistenza: isAssistenza
      });
      console.log('[EMAIL] Email di conferma inviata per ordine:', idOrdine);
    } catch (emailError) {
      console.error('[EMAIL] Errore invio email conferma:', emailError);
      // Non bloccare la risposta se l'email fallisce
    }
    
    // NUOVO: Invia email a ENI Plenitude per idOperatore === 16
    if (idOperatoreOfferta === 16) {
      try {
        console.log('[DEBUG][EMAIL-ENI] Invio email a eniplenitude@kimweb.it per ordine:', idOrdine);
        
        // Recupera tutti i dati dell'ordine
        const orderData = await emailService.getOrderData(idOrdine);
        
        // Recupera i file caricati
        const filesResult = await (new sql.Request())
          .input('idOrdine', sql.Int, idOrdine)
          .query(`
            SELECT TipoFile, NomeFile, Payload
            FROM dbo.tbFileOrdine
            WHERE IDOrdine = @idOrdine
          `);
        
        const files = filesResult.recordset || [];
        
        // Recupera i dati ordine dal payload
        const datiOrdineResult = await (new sql.Request())
          .input('idOrdine', sql.Int, idOrdine)
          .query(`
            SELECT Payload
            FROM dbo.tbDatiOrdine
            WHERE IDOrdine = @idOrdine
          `);
        
        let datiOrdinePayload = {};
        if (datiOrdineResult.recordset.length > 0) {
          try {
            datiOrdinePayload = JSON.parse(datiOrdineResult.recordset[0].Payload || '{}');
          } catch (e) {
            console.error('[EMAIL-ENI] Errore parsing payload dati ordine:', e);
          }
        }
        
        // Costruisci HTML con tutti i campi compilati
        let campiHtml = '<h3>📋 Dati Compilati:</h3><table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">';
        
        // Dati intestatario
        if (orderData.ClientePayload) {
          try {
            const clienteData = JSON.parse(orderData.ClientePayload);
            campiHtml += '<tr style="background: #f0f0f0;"><td colspan="2" style="padding: 10px; font-weight: bold; border: 1px solid #ddd;">DATI INTESTATARIO</td></tr>';
            for (const [key, value] of Object.entries(clienteData)) {
              if (value) {
                campiHtml += `<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${key}</td><td style="padding: 8px; border: 1px solid #ddd;">${value}</td></tr>`;
              }
            }
          } catch (e) {
            console.error('[EMAIL-ENI] Errore parsing payload cliente:', e);
          }
        }
        
        // Dati ordine
        if (Object.keys(datiOrdinePayload).length > 0) {
          campiHtml += '<tr style="background: #f0f0f0;"><td colspan="2" style="padding: 10px; font-weight: bold; border: 1px solid #ddd;">DATI FORNITURA</td></tr>';
          for (const [key, value] of Object.entries(datiOrdinePayload)) {
            if (value) {
              campiHtml += `<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${key}</td><td style="padding: 8px; border: 1px solid #ddd;">${value}</td></tr>`;
            }
          }
        }
        
        campiHtml += '</table>';
        
        // Documenti caricati
        let documentiHtml = '<h3>📎 Documenti Caricati:</h3><ul>';
        for (const file of files) {
          let fileUrl = 'N/A';
          try {
            const filePayload = JSON.parse(file.Payload || '{}');
            fileUrl = filePayload.s3Url || 'N/A';
          } catch (e) {}
          documentiHtml += `<li><strong>${file.TipoFile}</strong>: ${file.NomeFile}<br><a href="${fileUrl}" style="color: #0066cc;">Scarica documento</a></li>`;
        }
        documentiHtml += '</ul>';
        
        // Costruisci email
        const emailContent = {
          to: 'eniplenitude@kimweb.it',
          subject: `Nuova Attivazione ENI Plenitude - Ordine #${idOrdine}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #00a651 0%, #008c45 100%); color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">⚡ Nuova Attivazione ENI Plenitude</h1>
              </div>
              
              <div style="padding: 20px; background: #ffffff;">
                <h2 style="color: #00a651;">Dettagli Ordine</h2>
                <table style="width: 100%; margin-bottom: 20px;">
                  <tr><td style="padding: 8px; font-weight: bold;">Numero Ordine:</td><td style="padding: 8px;">#${idOrdine}</td></tr>
                  <tr><td style="padding: 8px; font-weight: bold;">Data:</td><td style="padding: 8px;">${new Date().toLocaleString('it-IT')}</td></tr>
                  <tr><td style="padding: 8px; font-weight: bold;">Offerta:</td><td style="padding: 8px;">${titoloOfferta}</td></tr>
                  <tr><td style="padding: 8px; font-weight: bold;">Dealer:</td><td style="padding: 8px;">${orderData?.DealerNome || 'N/A'}</td></tr>
                  <tr><td style="padding: 8px; font-weight: bold;">Template:</td><td style="padding: 8px;">${templateOfferta || 'N/A'}</td></tr>
                </table>
                
                ${campiHtml}
                ${documentiHtml}
                
                <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-left: 4px solid #00a651;">
                  <p style="margin: 0; color: #666;">Questa è una notifica automatica generata dal sistema Kim Station.</p>
                </div>
              </div>
            </div>
          `,
          text: `
Nuova Attivazione ENI Plenitude

Numero Ordine: #${idOrdine}
Data: ${new Date().toLocaleString('it-IT')}
Offerta: ${titoloOfferta}
Dealer: ${orderData?.DealerNome || 'N/A'}
Template: ${templateOfferta || 'N/A'}

Accedi al sistema per visualizzare tutti i dettagli e i documenti caricati.
          `
        };
        
        await emailService.sendEmail(emailContent);
        console.log('[EMAIL-ENI] Email inviata con successo a eniplenitude@kimweb.it per ordine:', idOrdine);
      } catch (emailEniError) {
        console.error('[EMAIL-ENI] Errore invio email a ENI:', emailEniError);
        // Non bloccare la risposta se l'email fallisce
      }
    }
    
    return res.json({ success: true, idOrdine });
  } catch (err) {
    if (transaction._aborted !== true) {
      await transaction.rollback();
    }
    console.error('[ATTIVAZIONE][ERRORE]', err);
    res.status(500).json({ error: 'Errore durante l\'inserimento ordine', details: err.message });
  } finally {
    // Chiudi la transazione
  }
});

// Endpoint spostati nei rispettivi moduli:
// - Endpoint agenti -> /api/agente/
// - Endpoint dealer -> /api/dealer/
// - /api/statistiche-agente -> /api/agente/statistiche

// --- API: DOCUMENTAZIONE ---
// GET /api/documentazione
app.get('/api/documentazione', authenticateToken, async (req, res) => {
  try {
    await getPool();
    const query = 'SELECT IDFile, Operatore, Titolo, Link FROM dbo.tbFiles ORDER BY Operatore, Titolo';
    const result = await (await getRequest()).query(query);
    // Normalizza i prezzi per UNO MOBILE (idOperatore=7): Crediti è in centesimi
    const rows = Array.isArray(result.recordset) ? result.recordset.map(r => {
      try {
        if (Number(r?.idOperatore) === 7 && r?.Crediti != null) {
          const v = Number(r.Crediti);
          if (Number.isFinite(v)) return { ...r, Crediti: v / 100 };
        }
      } catch {}
      return r;
    }) : [];
    res.json(rows);
  } catch (err) {
    console.error('/api/documentazione error:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// --- API: PIANI INCENTIVI ---
// GET /api/piani-incentivi
app.get('/api/piani-incentivi', authenticateToken, async (req, res) => {
  try {
    await getPool();
    const query = `SELECT pi.id, pi.anno, pi.mese, pi.operatore, pi.nome_file, pi.url_s3, pi.created_at, pi.periodo_primo_giorno, pi.s3_key
    FROM dbo.piani_incentivi pi
    ORDER BY pi.anno DESC, pi.mese DESC, pi.operatore, pi.nome_file`;
    const result = await (await getRequest()).query(query);
    // Restituisci i dati senza normalizzazione (non ci sono campi Crediti in questa tabella)
    const piani = Array.isArray(result.recordset) ? result.recordset : [];
    res.json(piani);
  } catch (err) {
    console.error('/api/piani-incentivi error:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// --- ECOMMERCE: API PRODOTTI ---
// GET /api/prodotti?segmento=SIM&idOperatore=11
app.get('/api/prodotti', authenticateToken, async (req, res) => {
  try {
    // L'autenticazione JWT è già gestita dal middleware authenticateToken
    const { segmento, idOperatore } = req.query;
    if (!segmento || !idOperatore) {
      return res.status(400).json({ error: 'Parametro segmento e idOperatore obbligatori' });
    }

    // Mappa FIN -> CELL per la ricerca DB
    let segmentoDb = segmento;
    if (segmento === 'FIN') segmentoDb = 'CELL';

    const request = new sql.Request();
    request.input('segmento', sql.NVarChar, segmentoDb);
    request.input('idOperatore', sql.Int, parseInt(idOperatore, 10));

    let query;
    if (segmento === 'ASS') {
      // Prodotti Assistenza: in DB hanno tipoOfferta = 3 e Segmento spesso 'RES'.
      // Selezioniamo per tipoOfferta=3 ignorando il Segmento, mantenendo i filtri di visibilità/validità.
      query = `
        SELECT
          IDOfferta AS id,
          Titolo AS nome,
          DescrizioneBreve AS descrizione,
          Crediti AS prezzo,
          LogoLink,
          Segmento AS segmento,
          idOperatore,
          LimiteSIM AS disponibilita,
          Tipo AS categoria,
          ISNULL(SpeseSpedizione, 0) AS SpeseSpedizione,
          ISNULL(FixedDiscountPct, 0) AS FixedDiscountPct
        FROM dbo.tbOfferte
        WHERE idOperatore = @idOperatore
          AND tipoOfferta = 3
          AND (OnlyFor IS NULL OR OnlyFor = '')
          AND ISNULL(Offerta_Inviata, 1) = 1
          AND ISNULL(ValidaDal, GETDATE()) <= GETDATE()
          AND ISNULL(ValidaAl, GETDATE()) >= GETDATE()
      `;
    } else {
      query = `
        SELECT
          IDOfferta AS id,
          Titolo AS nome,
          DescrizioneBreve AS descrizione,
          Crediti AS prezzo,
          LogoLink,
          Segmento AS segmento,
          idOperatore,
          LimiteSIM AS disponibilita,
          Tipo AS categoria,
          ISNULL(SpeseSpedizione, 0) AS SpeseSpedizione,
          ISNULL(FixedDiscountPct, 0) AS FixedDiscountPct
        FROM dbo.tbOfferte
        WHERE tipoOfferta = 4
          AND Segmento = @segmento
          AND idOperatore = @idOperatore
          AND (OnlyFor IS NULL OR OnlyFor = '')
          AND ISNULL(Offerta_Inviata, 1) = 1
          AND ISNULL(ValidaDal, GETDATE()) <= GETDATE()
          AND ISNULL(ValidaAl, GETDATE()) >= GETDATE()
      `;
    }
    const result = await request.query(query);
    console.log('[DEBUG API PRODOTTI] Prodotti trovati:', result.recordset.length);
    console.log('[DEBUG API PRODOTTI] Primo prodotto:', result.recordset[0]);
    res.json(result.recordset);
  } catch (err) {
    console.error('/api/prodotti error:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// DEBUG: Endpoint temporaneo per controllare spese spedizione
app.get('/api/debug/prodotti-spese', async (req, res) => {
  try {
    const request = new sql.Request();
    const query = `
      SELECT TOP 20
        IDOfferta,
        Titolo,
        ISNULL(SpeseSpedizione, 0) AS SpeseSpedizione,
        Segmento,
        idOperatore,
        OnlyFor,
        Offerta_Inviata,
        ValidaDal,
        ValidaAl
      FROM dbo.tbOfferte
      WHERE tipoOfferta = 4
        AND Segmento = 'SIM'
        AND idOperatore = 11
      ORDER BY IDOfferta
    `;
    
    // Query con gli stessi filtri dell'API prodotti
    const queryFiltered = `
      SELECT TOP 20
        IDOfferta,
        Titolo,
        ISNULL(SpeseSpedizione, 0) AS SpeseSpedizione,
        Segmento,
        idOperatore
      FROM dbo.tbOfferte
      WHERE tipoOfferta = 4
        AND Segmento = 'SIM'
        AND idOperatore = 11
        AND (OnlyFor IS NULL OR OnlyFor = '')
        AND ISNULL(Offerta_Inviata, 1) = 1
        AND ISNULL(ValidaDal, GETDATE()) <= GETDATE()
        AND ISNULL(ValidaAl, GETDATE()) >= GETDATE()
      ORDER BY IDOfferta
    `;
    const result = await request.query(query);
    const resultFiltered = await request.query(queryFiltered);
    
    res.json({
      allProducts: {
        total: result.recordset.length,
        products: result.recordset,
        withShipping: result.recordset.filter(p => p.SpeseSpedizione > 0)
      },
      filteredProducts: {
        total: resultFiltered.recordset.length,
        products: resultFiltered.recordset,
        withShipping: resultFiltered.recordset.filter(p => p.SpeseSpedizione > 0)
      }
    });
  } catch (err) {
    console.error('/api/debug/prodotti-spese error:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// --- API: TELEFONI ---
// GET /api/telefoni - Restituisce la lista dei telefoni disponibili
app.get('/api/telefoni', authenticateToken, async (req, res) => {
  try {
    // Verifica che l'utente sia un dealer con IDGruppo = 1
    if (req.user.role !== 'dealer' || req.user.idGruppo !== 1) {
      return res.status(403).json({ 
        error: 'Accesso negato', 
        message: 'Solo i dealer autorizzati possono accedere ai telefoni' 
      });
    }

    await getPool();
    const request = new sql.Request();
    
    const query = `
      SELECT 
        IDTelefono as id,
        IDTelefono as idOfferta,
        Titolo as title,
        Marca,
        Modello,
        Prezzo as price,
        (Prezzo * 100) as priceCents,
        SpeseSpedizione as speseSpedizione,
        Descrizione as description,
        ImmagineURL as image,
        Specifiche,
        Disponibile,
        DataInserimento,
        DataModifica
      FROM dbo.tbTelefoni 
      WHERE Disponibile = 1
      ORDER BY Prezzo ASC
    `;
    
    const result = await request.query(query);
    
    // Trasforma le specifiche da JSON string a oggetto
    const telefoni = result.recordset.map(telefono => {
      let specifiche = null;
      
      if (telefono.Specifiche) {
        try {
          // Prova a fare il parsing come JSON
          specifiche = JSON.parse(telefono.Specifiche);
        } catch (err) {
          // Se non è JSON valido, lascia come stringa di testo
          console.warn(`Specifiche non in formato JSON per telefono ${telefono.id || 'sconosciuto'}:`, telefono.Specifiche.substring(0, 50) + '...');
          specifiche = telefono.Specifiche;
        }
      }
      
      return {
        ...telefono,
        specifiche,
        type: 'telefono' // Aggiunge un tipo per distinguere dai prodotti SIM
      };
    });
    
    res.json(telefoni);
  } catch (err) {
    console.error('/api/telefoni error:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// --- API: TEMPLATE DINAMICO OFFERTA ---
// GET /api/template-offerta/:idOfferta
app.get('/api/template-offerta/:idOfferta', authenticateToken, async (req, res) => {
  try {
    // Autenticazione già gestita da authenticateToken
    const idOfferta = req.params.idOfferta;
    if (!idOfferta) return res.status(400).json({ error: 'idOfferta obbligatorio' });
    
    const request = new sql.Request();
    request.input('id', sql.Int, parseInt(idOfferta, 10));
    const query = 'SELECT TemplateDatiOfferta FROM dbo.tbOfferte WHERE IDOfferta = @id';
    const result = await request.query(query);
    if (!result.recordset.length || !result.recordset[0].TemplateDatiOfferta) {
      return res.status(404).json({ error: 'Nome template non trovato per questa offerta' });
    }
    const nomeTemplate = result.recordset[0].TemplateDatiOfferta;

    let templatesData;
    try {
      templatesData = fs.readFileSync(__dirname + '/templates.json', 'utf-8');
    } catch (err) {
      return res.status(500).json({ error: 'Impossibile leggere templates.json', details: err.message });
    }
    let templatesArr;
    try {
      templatesArr = JSON.parse(templatesData);
    } catch (err) {
      return res.status(500).json({ error: 'templates.json non valido', details: err.message });
    }
    const template = templatesArr.find(t => t.template === nomeTemplate);
    if (!template) {
      return res.status(404).json({ error: 'Template non trovato in templates.json' });
    }
    res.json(template);
  } catch (err) {
    console.error('/api/template-offerta error:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// Endpoint chat semplice per bot
app.post('/webchat', express.json(), async (req, res) => {
  const { text, user_id } = req.body;
  // Qui puoi collegare la tua logica bot, per ora rispondiamo con un echo
  let reply = `Hai scritto: ${text}`;
  // Esempio: if(text.match(/ciao/i)) reply = 'Ciao! Come posso aiutarti?';
  res.json({ reply });
});

// Endpoint per salvare la cronologia chat
app.post('/webchat/history', express.json(), async (req, res) => {
  const { user_id, history } = req.body;
  if (!user_id || !Array.isArray(history)) return res.status(400).json({ error: 'Dati mancanti' });
  try {
    await getPool();
    // Upsert: aggiorna se esiste, altrimenti inserisci
    const check = await (await getRequest()).query`SELECT COUNT(*) as cnt FROM tbChatHistory WHERE UserId = ${user_id}`;
    if (check.recordset[0].cnt > 0) {
      await (await getRequest()).query`UPDATE tbChatHistory SET History = ${JSON.stringify(history)} WHERE UserId = ${user_id}`;
    } else {
      await (await getRequest()).query`INSERT INTO tbChatHistory (UserId, History) VALUES (${user_id}, ${JSON.stringify(history)})`;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Errore salvataggio cronologia', details: e.message });
  }
});

// Endpoint per recuperare la cronologia chat
app.get('/webchat/history', async (req, res) => {
  const user_id = req.query.user_id;
  if (!user_id) return res.status(400).json({ error: 'user_id mancante' });
  try {
    await getPool();
    const result = await (await getRequest()).query`SELECT TOP 1 History FROM tbChatHistory WHERE UserId = ${user_id}`;
    if (result.recordset.length) {
      res.json({ history: JSON.parse(result.recordset[0].History) });
    } else {
      res.json({ history: [] });
    }
  } catch (e) {
    res.status(500).json({ error: 'Errore recupero cronologia', details: e.message });
  }
});

// Endpoint proxy per gestire le richieste CORS
app.post('/api/proxy/chat', authenticateToken, express.json(), async (req, res) => {
  try {
    // Dati utente disponibili grazie al middleware authenticateToken
    const userId = req.user?.phoneNumber || req.user?.email || req.user?.dealerName || 'web_user';
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Testo del messaggio mancante' });
    }

    console.log(`Inoltro messaggio al bot da ${userId}:`, text);
    // Parametrizza l'endpoint del bot via ENV per gestire ambienti diversi senza toccare il codice
    const CHATBOT_URL = process.env.CHATBOT_URL || 'https://bot.kimweb.agency/from-site';
    const response = await axios.post(CHATBOT_URL, {
      text,
      user_id: userId
    });

    res.json(response.data);
  } catch (error) {
    console.error('Errore nella comunicazione con il bot:', error.message);
    res.status(500).json({
      reply: 'Al momento non riesco a contattare il servizio di assistenza. Riprova tra qualche minuto.'
    });
  }
});

app.get('/api/credito-plafond', authenticateToken, async (req, res) => {
  console.log('--- /api/credito-plafond chiamato ---');
  try {
    const idDealer = req.user.dealerId;
    if (!idDealer) {
      console.error('ID dealer non trovato nel token JWT (req.user)');
      return res.status(401).json({ error: 'ID dealer non valido nel token' });
    }
    console.log('IDDealer da req.user:', idDealer);
    
    try {
      // La connessione al database è gestita dal middleware globale
      const request = new sql.Request();
      // Query per il credito
      request.input('idDealer', sql.Int, idDealer);
      const creditoQuery = `
        SELECT ISNULL(SUM(t.crediti), 0) AS credito
        FROM dbo.tbtransazioni t
        JOIN dbo.tbdealers d ON t.iddealer = d.iddealer
        WHERE d.iddealer = @idDealer
      `;
      
      console.log('Eseguo creditoQuery:', creditoQuery, 'con idDealer:', idDealer);
      const creditoRes = await request.query(creditoQuery);
      console.log('Risultato creditoRes:', JSON.stringify(creditoRes.recordset, null, 2));
      
      const credito = creditoRes.recordset[0].credito || 0;
      console.log('Credito calcolato:', credito);
      // Restituisci il credito in euro (già in euro in tabella)
      res.json({ credito });
    } catch (err) {
      console.error('ERRORE /api/credito-plafond:', err.message, err.stack, err);
      res.status(500).json({ error: 'Errore server', details: err.message, stack: err.stack });
    }
  } catch (err) {
    console.error('ERRORE GRAVE /api/credito-plafond:', err.message, err.stack, err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// Endpoint per ottenere gli operatori principali (con SKY raggruppato)
app.get('/api/operatori', authenticateToken, async (req, res) => {
  try {
    await getPool();
    
    // Ottieni tutti gli operatori tranne quelli esclusi
    const result = await (await getRequest()).query`
      SELECT IDOperatore as id, Denominazione as nome, LogoLink as logo,
             CASE WHEN IDOperatore IN (3, 8, 12, 14) THEN 1 ELSE 0 END as isSky
      FROM dbo.tbOperatori2 
      WHERE IDOperatore != 11  -- Escludi solo PRODOTTI
      ORDER BY isSky DESC, Denominazione`;
    
    // Raggruppa gli operatori SKY in un unico oggetto
    const operatori = [];
    const skyOperators = [];
    
    result.recordset.forEach(op => {
      if (op.isSky) {
        skyOperators.push({
          id: op.id,
          nome: op.nome,
          logo: op.logo
        });
      } else {
        operatori.push({
          id: op.id,
          nome: op.nome,
          logo: op.logo
        });
      }
    });
    
    // Aggiungi l'opzione SKY all'inizio con le varianti
    if (skyOperators.length > 0) {
      operatori.unshift({
        id: 'SKY',
        nome: 'SKY',
        logo: skyOperators.find(s => s.id === 3)?.logo || 'https://kimweb.agency/wp-content/uploads/2024/11/sky-logo.png',
        isSkyGroup: true,
        skyVariants: skyOperators // Include le varianti per il frontend
      });
    }
    
    console.log('📋 Operatori restituiti dall\'API:', operatori.map(o => `${o.id}: ${o.nome}`).join(', '));
    
    // Log dettagliato per SKY
    const skyOp = operatori.find(o => o.id === 'SKY');
    if (skyOp) {
      console.log('🔍 Dettagli SKY:', JSON.stringify({
        id: skyOp.id,
        nome: skyOp.nome,
        logo: skyOp.logo,
        isSkyGroup: skyOp.isSkyGroup,
        skyVariants: skyOp.skyVariants?.map(v => ({ id: v.id, nome: v.nome, logo: v.logo }))
      }, null, 2));
    }
    
    res.json(operatori);
  } catch (err) {
    console.error('Errore in /api/operatori:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// Endpoint per ottenere i sottotipi SKY
app.get('/api/sky-tipi', async (req, res) => {
  // TODO: implementare endpoint reale se necessario
  res.json([]);
});

// Endpoint per ottenere le tipologie disponibili per un operatore
app.get('/api/tipologie', authenticateToken, async (req, res) => {
  try {
    const { operatore } = req.query;
    if (!operatore) {
      return res.status(400).json({ error: 'Parametro operatore obbligatorio' });
    }
    // Supporto per operatore aggregato SKY (gruppa 3,8,12,14)
    const opStr = String(operatore).toUpperCase();
    if (opStr === 'SKY') {
      try {
        const result = await sql.query`
          SELECT DISTINCT
            CASE
              WHEN o.Segmento = 'RES' THEN 'RESIDENZIALE'
              WHEN o.Segmento = 'SHP' THEN 'BUSINESS'
              ELSE o.Segmento
            END AS tipologia
          FROM dbo.tbOfferte o
          WHERE o.idOperatore IN (3, 8, 12, 14)
            AND o.Segmento != 'FIN'
            AND (o.OnlyFor IS NULL OR o.OnlyFor = '')
            AND ISNULL(o.Offerta_Inviata, 1) = 1
            AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
            AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()`;
        const tipologie = result.recordset.map(r => r.tipologia);
        return res.json(tipologie);
      } catch (e) {
        console.error('Errore SKY in /api/tipologie:', e);
        return res.status(500).json({ error: 'Errore server', details: e.message });
      }
    }


    // Ricava tutte le tipologie disponibili per quell’operatore dalle offerte attive
    let result;
    if (parseInt(operatore) === 6) {
      // KENA MOBILE: nessun filtro aggiuntivo
      result = await sql.query`
        SELECT DISTINCT
          CASE
            WHEN o.Segmento = 'RES' THEN 'RESIDENZIALE'
            WHEN o.Segmento = 'SHP' THEN 'BUSINESS'
            ELSE o.Segmento
          END AS tipologia
        FROM dbo.tbOfferte o
        WHERE o.idOperatore = 6
      `;
    } else {
      result = await sql.query`
        SELECT DISTINCT
          CASE
            WHEN o.Segmento = 'RES' THEN 'RESIDENZIALE'
            WHEN o.Segmento = 'SHP' THEN 'BUSINESS'
            ELSE o.Segmento
          END AS tipologia
        FROM dbo.tbOfferte o
        WHERE o.idOperatore = ${parseInt(operatore)}
          AND o.Segmento != 'FIN'
          AND (o.OnlyFor IS NULL OR o.OnlyFor = '')
          AND ISNULL(o.Offerta_Inviata, 1) = 1
          AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
          AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()
      `;
    }
    const tipologie = result.recordset.map(r => r.tipologia);
    res.json(tipologie);
  } catch (err) {
    console.error('Errore in /api/tipologie:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// Endpoint per ottenere le offerte filtrate per operatore e tipologia
app.get('/api/offerte', authenticateToken, async (req, res) => {
  try {
    const { operatore, tipologia, segmento } = req.query;
    
    // Se c'è il parametro segmento, usa la logica per i prodotti
    if (segmento) {
      return await getProdottiBySegmento(req, res, segmento);
    }
    
    // Altrimenti usa la logica originale per le offerte
    if (!operatore) {
      return res.status(400).json({ error: 'Parametro operatore obbligatorio' });
    }

    
    let query = '';
    const opStr = String(operatore).toUpperCase();
    const operatorId = parseInt(operatore);
    // Gestione operatore aggregato SKY passato come stringa 'SKY'
    if (req.query.from === 'attivazioni' && opStr === 'SKY') {
      const tipUpper = String(tipologia || '').toUpperCase();
      if (tipUpper === 'BUS' || tipUpper === 'BUSINESS') {
        // Business: includi tutte le varianti SKY pertinenti
        query = `
          SELECT  
            o.IDOfferta,
            op.Denominazione AS NomeOperatore,
            o.LogoLink,
            o.Titolo,
            o.DescrizioneBreve,
            o.Crediti,
            o.idOperatore,
            o.Segmento,
            o.LogoLink AS LogoOperatore,
            o.TemplateDatiOfferta,
            o.LimiteSIM AS disponibilita,
            o.Tipo AS categoria
          FROM dbo.tbOfferte o
          INNER JOIN dbo.tbOperatori2 op ON o.idOperatore = op.IDOperatore
          WHERE o.idOperatore IN (3,8,12,14)
            AND (
              o.Segmento IN ('BUS','SHP')
              OR o.Tipo = '1'
              OR o.Tipo LIKE '%BUSINESS%'
            )
            AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
            AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()
            AND op.IDOperatore IS NOT NULL
          ORDER BY o.Crediti ASC`;
      } else {
        // Residenziale: includi le varianti consumer/RES (esclude 12 business-only se necessario)
        query = `
          SELECT  
            o.IDOfferta,
            op.Denominazione AS NomeOperatore,
            o.LogoLink,
            o.Titolo,
            o.DescrizioneBreve,
            o.Crediti,
            o.idOperatore,
            o.Segmento,
            o.LogoLink AS LogoOperatore,
            o.TemplateDatiOfferta,
            o.LimiteSIM AS disponibilita,
            o.Tipo AS categoria
          FROM dbo.tbOfferte o
          INNER JOIN dbo.tbOperatori2 op ON o.idOperatore = op.IDOperatore
          WHERE o.idOperatore IN (3,8,12,14)
            AND o.Segmento = 'RES'
            AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
            AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()
            AND op.IDOperatore IS NOT NULL
          ORDER BY o.Crediti ASC`;
      }
      const result = await sql.query(query);
      return res.json(result.recordset);
    }

    if (req.query.from === 'attivazioni') {
      if ([3, 8, 12, 14].includes(operatorId) && tipologia) {
        // SKY su attivazioni
        if (operatorId === 12) {
          // Sky Business: filtra per business includendo varianti (Segmento SHP/BUS, Tipo '1' o contenente 'BUSINESS')
          query = `
            SELECT  
              o.IDOfferta,
              op.Denominazione AS NomeOperatore,
              o.LogoLink,
              o.Titolo,
              o.DescrizioneBreve,
              o.Crediti,
              o.idOperatore,
              o.Segmento,
              o.LogoLink AS LogoOperatore,
              o.TemplateDatiOfferta,
              o.LimiteSIM AS disponibilita,
              o.Tipo AS categoria
            FROM dbo.tbOfferte o
            INNER JOIN dbo.tbOperatori2 op ON o.idOperatore = op.IDOperatore
            WHERE o.idOperatore = ${operatorId}
              AND (
                o.Segmento IN ('BUS','SHP')
                OR o.Tipo = '1'
                OR o.Tipo LIKE '%BUSINESS%'
              )
              AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
              AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()
              AND op.IDOperatore IS NOT NULL
            ORDER BY o.Crediti ASC`;
        } else {
          // Altre varianti SKY (3, 8, 14). Se tipologia è Business, includi anche SHP/BUS e tipo '1' o contenente 'BUSINESS'
          const tipUpper = (tipologia || '').toUpperCase();
          const skyWhereSegmento = tipUpper === 'BUSINESS'
            ? " AND (o.Segmento IN ('BUS','SHP') OR o.Tipo = '1' OR o.Tipo LIKE '%BUSINESS%')"
            : ` AND o.Segmento = '${tipologia}'`;
          query = `
            SELECT  
              o.IDOfferta,
              op.Denominazione AS NomeOperatore,
              o.LogoLink,
              o.Titolo,
              o.DescrizioneBreve,
              o.Crediti,
              o.idOperatore,
              o.Segmento,
              o.LogoLink AS LogoOperatore,
              o.TemplateDatiOfferta,
              o.LimiteSIM AS disponibilita,
              o.Tipo AS categoria
            FROM dbo.tbOfferte o
            INNER JOIN dbo.tbOperatori2 op ON o.idOperatore = op.IDOperatore
            WHERE o.idOperatore = ${operatorId}
              ${skyWhereSegmento}
              AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
              AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()
              AND op.IDOperatore IS NOT NULL
            ORDER BY o.Crediti ASC`;
        }
      } else {
        // ATTIVAZIONI per altri operatori (non-SKY):
        // Se tipologia=RES -> Segmento = 'RES'
        // Se tipologia=BUS -> Segmento = 'SHP' (Business)
        const tipUpper = (tipologia || '').toUpperCase();
        const whereSegmento = tipUpper === 'BUS'
          ? "AND o.Segmento = 'SHP'"
          : "AND o.Segmento = 'RES'";
        query = `
          SELECT  
            o.IDOfferta,
            op.Denominazione AS NomeOperatore,
            o.LogoLink,
            o.Titolo,
            o.DescrizioneBreve,
            o.Crediti,
            o.idOperatore,
            o.Segmento,
            o.LogoLink AS LogoOperatore,
            o.TemplateDatiOfferta,
            o.LimiteSIM AS disponibilita,
            o.Tipo AS categoria
          FROM dbo.tbOfferte o
          INNER JOIN dbo.tbOperatori2 op ON o.idOperatore = op.IDOperatore
          WHERE o.idOperatore = ${operatorId}
            ${whereSegmento}
            AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
            AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()
            AND op.IDOperatore IS NOT NULL
          ORDER BY o.Crediti ASC`;
      }
    } else {
      // Pagina assistenza: solo offerte SOS
      query = `
        SELECT  
          o.IDOfferta,
          op.Denominazione AS NomeOperatore,
          o.LogoLink,
          o.Titolo,
          o.DescrizioneBreve,
          o.Crediti,
          o.idOperatore,
          o.Segmento,
          o.LogoLink AS LogoOperatore,
          o.TemplateDatiOfferta,
          o.LimiteSIM AS disponibilita,
          o.Tipo AS categoria
        FROM dbo.tbOfferte o
        INNER JOIN dbo.tbOperatori2 op ON o.idOperatore = op.IDOperatore
        WHERE o.idOperatore = ${operatorId}
          AND o.Tipo = 'SOS'
          AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
          AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()
          AND op.IDOperatore IS NOT NULL
        ORDER BY o.Crediti ASC`;
    }
    const result = await sql.query(query);
    const normalizedOfferte = Array.isArray(result.recordset)
      ? result.recordset.map(row => {
          try {
            if (Number(row?.idOperatore) === 7 && row?.Crediti != null) {
              const v = Number(row.Crediti);
              if (Number.isFinite(v)) return { ...row, Crediti: v / 100 };
            }
          } catch {}
          return row;
        })
      : [];
    res.json(normalizedOfferte);
  } catch (err) {
    console.error('Errore in /api/offerte:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

// Funzione per ottenere i prodotti filtrati per segmento (SIM o TELEFONI)
async function getProdottiBySegmento(req, res, segmento) {
  try {
    
    
    // Mappa i segmenti richiesti ai valori nel database
    let query = '';
    let params = {};
    
    if (segmento === 'SIM') {
      query = `
        SELECT
          o.IDOfferta AS id,
          o.Titolo AS nome,
          o.DescrizioneBreve AS descrizione,
          o.Crediti AS prezzo,
          o.LogoLink,
          o.Segmento,
          o.idOperatore,
          o.LimiteSIM AS disponibilita,
          o.Tipo AS categoria,
          op.Denominazione AS NomeOperatore
        FROM dbo.tbOfferte o
        INNER JOIN dbo.tbOperatori2 op ON o.idOperatore = op.IDOperatore
        WHERE o.tipoOfferta = 4
          AND o.Segmento = 'SIM'
          AND (o.OnlyFor IS NULL OR o.OnlyFor = '')
          AND ISNULL(o.Offerta_Inviata, 1) = 1
          AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
          AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()
        ORDER BY o.Titolo`;
    } else if (segmento === 'FIN') { // TELEFONI
      query = `
        SELECT
          o.IDOfferta AS id,
          o.Titolo AS nome,
          o.DescrizioneBreve AS descrizione,
          o.Crediti AS prezzo,
          o.LogoLink,
          o.Segmento,
          o.idOperatore,
          o.LimiteSIM AS disponibilita,
          o.Tipo AS categoria,
          op.Denominazione AS NomeOperatore
        FROM dbo.tbOfferte o
        INNER JOIN dbo.tbOperatori2 op ON o.idOperatore = op.IDOperatore
        WHERE o.tipoOfferta = 4
          AND o.Segmento = 'CELL'
          AND o.idOperatore = 11
          AND (o.OnlyFor IS NULL OR o.OnlyFor = '')
          AND ISNULL(o.Offerta_Inviata, 1) = 1
          AND ISNULL(o.ValidaDal, GETDATE()) <= GETDATE()
          AND ISNULL(o.ValidaAl, GETDATE()) >= GETDATE()
        ORDER BY o.Titolo`;
    } else {
      return res.status(400).json({ error: 'Segmento non valido' });
    }

    console.log('Esecuzione query prodotti per segmento:', segmento);
    const result = await sql.query(query);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('Errore nel recupero prodotti per segmento:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  } finally {
  }
}

app.get('/api/andamento', authenticateToken, async (req, res) => {
  try {
    console.log('Richiesta ricevuta su /api/andamento');
    

    // La connessione al database è gestita dal middleware globale
    const result = await sql.query`
      WITH MonthlyData AS (
        SELECT 
          FORMAT(ord.DataStato, 'yyyy/MM') AS [ANNO_MESE],
          d.RagioneSociale AS Point,
          SUM(CASE WHEN o.IDOPERATORE = 5 THEN 1 ELSE 0 END) AS ILIAD,
          SUM(CASE WHEN o.IDOPERATORE = 6 THEN 1 ELSE 0 END) AS KENA,
          SUM(CASE WHEN o.IDOPERATORE = 7 THEN 1 ELSE 0 END) AS [1MOBILE],
          SUM(CASE WHEN o.IDOPERATORE = 13 THEN 1 ELSE 0 END) AS WEEDOO
        FROM 
          dbo.tbOFFERTE o
          JOIN dbo.tbordini ord ON o.IDOFFERTA = ord.IDOFFERTA
          JOIN dbo.tbDealers d ON ord.iddealer = d.idDealer
        WHERE 
          o.IDOPERATORE IN (4, 5, 6, 7, 13)
          AND d.idDealer = ${req.user.dealerId}
          AND ord.Stato = '1'
        GROUP BY 
          FORMAT(ord.DataStato, 'yyyy/MM'), d.RagioneSociale
      ),
      MonthlyTotals AS (
        SELECT 
          FORMAT(ord.DataStato, 'yyyy/MM') AS [ANNO_MESE],
          'TOTALE ' + UPPER(FORMAT(ord.DataStato, 'MMMM', 'it-IT')) AS Point,
          SUM(CASE WHEN o.IDOPERATORE = 5 THEN 1 ELSE 0 END) AS ILIAD,
          SUM(CASE WHEN o.IDOPERATORE = 6 THEN 1 ELSE 0 END) AS KENA,
          SUM(CASE WHEN o.IDOPERATORE = 7 THEN 1 ELSE 0 END) AS [1MOBILE],
          SUM(CASE WHEN o.IDOPERATORE = 13 THEN 1 ELSE 0 END) AS WEEDOO
        FROM 
          dbo.tbOFFERTE o
          JOIN dbo.tbordini ord ON o.IDOFFERTA = ord.IDOFFERTA
          JOIN dbo.tbDealers d ON ord.iddealer = d.idDealer
        WHERE 
          o.IDOPERATORE IN (4, 5, 6, 7, 13)
          AND d.idDealer = ${req.user.dealerId}
        GROUP BY 
          FORMAT(ord.DataStato, 'yyyy/MM'), FORMAT(ord.DataStato, 'MMMM', 'it-IT')
      )
      SELECT 
        [ANNO_MESE] AS ANNO_MESE,
        Point,
        ISNULL(ILIAD, 0) AS ILIAD,
        ISNULL(KENA, 0) AS KENA,
        ISNULL([1MOBILE], 0) AS [1MOBILE],
        ISNULL(WEEDOO, 0) AS WEEDOO
      FROM (
        SELECT 
          [ANNO_MESE],
          Point,
          ILIAD,
          KENA,
          [1MOBILE],
          WEEDOO,
          0 AS SortOrder
        FROM MonthlyTotals
      
        UNION ALL
      
        SELECT 
          [ANNO_MESE],
          Point,
          ILIAD,
          KENA,
          [1MOBILE],
          WEEDOO,
          1 AS SortOrder
        FROM MonthlyData
      ) AS CombinedData
      ORDER BY 
        [ANNO_MESE] DESC,
        SortOrder,
        CASE WHEN Point LIKE 'TOTALE%' THEN 0 ELSE 1 END,
        Point`;

    res.json(result.recordset);
  } catch (err) {
    console.error('Errore nel recupero dei dati di andamento:', err);
    res.status(500).json({ error: 'Errore nel recupero dei dati di andamento', details: err.message });
  }
});

// --- API: OBIETTIVI ---
// GET /api/obiettivi
app.get('/api/obiettivi', authenticateToken, async (req, res) => {
  let fastwebStats = {}; // Spostato qui per renderlo disponibile in tutto lo scope
  
  try {
    // 1️⃣ Auth e validazione
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }

    const token = authHeader.split(' ')[1];
    // Dati utente già disponibili grazie al middleware authenticateToken
    const idDealer = parseInt(req.user.dealerId, 10);
    if (isNaN(idDealer)) {
      return res.status(401).json({ error: 'ID dealer non valido' });
    }

    // 2️⃣ Anno / Mese attuale
    const now = new Date();
    const anno = now.getFullYear();
    const mese = now.getMonth() + 1;

    // 3️⃣ Connessione al database
    
    
    // 3️⃣ Leggi tutte le soglie_report
    const request = new sql.Request();
    request.input('anno', sql.Int, anno);
    request.input('mese', sql.Int, mese);

    const soglieRes = await request.query(`
      SELECT operatore, categoria, segmento, 
             soglia_1_min, soglia_1_max, 
             soglia_2_min, soglia_2_max, 
             soglia_3_min, soglia_3_max, 
             soglia_4_min, soglia_4_max 
      FROM soglie_report 
      WHERE anno = @anno AND mese = @mese`);

    const soglie = soglieRes.recordset;

    // 5️⃣ Funzione helper per calcolare il target e i mancanti
    const calcolaMancano = (attuale, sogliaRow) => {
      const soglieOrdered = [
        sogliaRow.soglia_1_max,
        sogliaRow.soglia_2_max,
        sogliaRow.soglia_3_max,
        sogliaRow.soglia_4_max
      ].filter(s => s != null);
      
      for (const sogliaMax of soglieOrdered) {
        if (attuale < sogliaMax) {
          return Math.max(0, sogliaMax - attuale);
        }
      }
      return 0;
    };

    const getTarget = (attuale, sogliaRow) => {
      const soglieOrdered = [
        sogliaRow.soglia_1_max,
        sogliaRow.soglia_2_max,
        sogliaRow.soglia_3_max,
        sogliaRow.soglia_4_max
      ].filter(x => x != null);
      
      for (const sogliaMax of soglieOrdered) {
        if (attuale < sogliaMax) {
          return sogliaMax;
        }
      }
      return soglieOrdered[soglieOrdered.length - 1] || 0;
    };

    // 6️⃣ Carichiamo i dati per ogni operatore
    
    // 1. Fastweb TLC
    try {
      console.log('Esecuzione query GetOrderStatisticsByDealerByidDealer per idDealer:', idDealer);
      const fastwebStatsRes = await sql.query`EXEC GetOrderStatisticsByDealerByidDealer @idDealer = ${idDealer}`;
      fastwebStats = fastwebStatsRes.recordset[0] || {};
      console.log('Risultati Fastweb TLC:', JSON.stringify(fastwebStats, null, 2));
      
      // Log delle soglie trovate per Fastweb TLC
      const soglieFastweb = soglie.filter(s => s.operatore === 'Fastweb' && s.categoria !== 'ENERGIA');
      console.log('Soglie trovate per Fastweb TLC:', JSON.stringify(soglieFastweb, null, 2));
    } catch (error) {
      console.error('Errore durante l\'esecuzione di GetOrderStatisticsByDealerByidDealer:', error);
      fastwebStats = {};
    }

    const mappaCategorieFastweb = {
      'MOBILE RES': fastwebStats['MOBILI RES'] || 0,
      'MOBILE SHP': fastwebStats['MOBILI BUS'] || 0,
      'FISSO RES': fastwebStats['FISSI RES'] || 0,
      'FISSO SHP': fastwebStats['FISSI BUS'] || 0,
      'Convergenza RES': fastwebStats['di cui CONV_RES'] || 0,
      'Convergenza SHP': fastwebStats['di cui CONV_BUS'] || 0
    };

    const categorieFastweb = soglie
      .filter(s => s.operatore === 'Fastweb' && s.categoria !== 'ENERGIA')
      .map(s => {
        const nomeCategoria = `${s.categoria} ${s.segmento}`.trim();
        const attuale = mappaCategorieFastweb[nomeCategoria] || 0;
        const target = getTarget(attuale, s);
        const mancano = calcolaMancano(attuale, s);

        return { nome: nomeCategoria, attuale, target, mancano };
      });

    // 2. Fastweb ENERGIA
    const energiaRes = await sql.query`
      EXEC ReportContrattiEnergiaPeridDealer @idDealer = ${idDealer}`;
    const energiaStats = energiaRes.recordset[0] || {};

    const energiaAttualeRES = energiaStats['Segmento RES'] || 0;
    const energiaAttualeSHP = energiaStats['Segmento BUS'] || 0;

    const categorieEnergia = [];

    const sogliaEnergiaRES = soglie.find(s => s.operatore === 'Fastweb' && s.categoria === 'ENERGIA' && s.segmento === 'RES');
    if (sogliaEnergiaRES) {
      categorieEnergia.push({
        nome: 'Energia RES',
        attuale: energiaAttualeRES,
        target: getTarget(energiaAttualeRES, sogliaEnergiaRES),
        mancano: calcolaMancano(energiaAttualeRES, sogliaEnergiaRES)
      });
    }

    const sogliaEnergiaSHP = soglie.find(s => s.operatore === 'Fastweb' && s.categoria === 'ENERGIA' && s.segmento === 'SHP');
    if (sogliaEnergiaSHP) {
      categorieEnergia.push({
        nome: 'Energia SHP',
        attuale: energiaAttualeSHP,
        target: getTarget(energiaAttualeSHP, sogliaEnergiaSHP),
        mancano: calcolaMancano(energiaAttualeSHP, sogliaEnergiaSHP)
      });
    }

    // 3. Sky Mobile & WIFI
    const skyMobileWifiRes = await sql.query`
      EXEC ReportAttivazioniSkyMobileWifibyIddealer @idDealer = ${idDealer}`;
    const skyMobileWifiStats = skyMobileWifiRes.recordset[0] || {};
    
    // Debug: Log the structure of the returned data
    console.log('Sky Mobile & WIFI Stats Raw:', JSON.stringify(skyMobileWifiStats, null, 2));

    // Mappa per le categorie Sky Mobile & WIFI
    const mappaSkyMobileWifi = {
      'Mobile': skyMobileWifiStats.Mobile || 0,
      'WIFI': skyMobileWifiStats.WIFI || 0,
      'Mobile + WIFI': skyMobileWifiStats['Mobile + WIFI'] || 0
    };

    const categorieSkyMobileWifi = Object.keys(mappaSkyMobileWifi).map(cat => {
      const attuale = mappaSkyMobileWifi[cat];
      const sogliaRow = soglie.find(s => s.operatore === 'Sky Mobile & WIFI' && s.categoria === cat);
      const target = sogliaRow ? getTarget(attuale, sogliaRow) : 0;
      const mancano = sogliaRow ? calcolaMancano(attuale, sogliaRow) : 0;

      return { nome: cat, attuale, target, mancano };
    });

    // 4. Sky TV
    const skyTvRes = await sql.query`
      EXEC ReportAttivazioniSkyTV @idDealer = ${idDealer}`;
    const skyTvStats = skyTvRes.recordset[0] || {};

    const mappaSkyTv = {
      'ONLY TV': skyTvStats['ONLY TV'] || 0,
      '3P': skyTvStats['3P'] || 0,
      'GLASS': skyTvStats['GLASS'] || 0,
      '3P GLASS': skyTvStats['3P GLASS'] || 0
    };

    const categorieSkyTv = Object.keys(mappaSkyTv).map(cat => {
      const attuale = mappaSkyTv[cat];
      const sogliaRow = soglie.find(s => s.operatore === 'Sky TV' && s.categoria === cat);
      const target = sogliaRow ? getTarget(attuale, sogliaRow) : 0;
      const mancano = sogliaRow ? calcolaMancano(attuale, sogliaRow) : 0;

      return { nome: cat, attuale, target, mancano };
    });

    // 7️⃣ Prepara la risposta finale
    const risposta = {
      obiettivi: [
        { operatore: 'Fastweb TLC', categorie: categorieFastweb },
        { operatore: 'Fastweb ENERGIA', categorie: categorieEnergia },
        { operatore: 'Sky Mobile & WIFI', categorie: categorieSkyMobileWifi },
        { operatore: 'Sky TV', categorie: categorieSkyTv }
      ]
    };


    res.json(risposta);
  } catch (err) {
    console.error('Errore in /api/obiettivi:', err);
    res.status(500).json({ error: 'Errore nel recupero degli obiettivi', details: err.message });
  }
});

// Endpoint: ORDINI in attesa di pagamento da più di 24 ore
app.get('/api/ordini/in-attesa-pagamento', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        op.IDOrdineProdotto as IDOrdine,  -- Alias per compatibilità con frontend
        op.idDealer,
        op.DataOra as DataOrdine,
        d.RagioneSociale,
        op.NoteOrdine as Note,
        op.idStatoOrdineProdotto as Stato,
        DATEDIFF(HOUR, op.DataOra, GETDATE()) as OreAttesa,
        op.TotaleOrdine as Totale,  -- Alias per compatibilità con frontend
        op.OrdineDA,
        op.stato_spedizione
      FROM dbo.tbOrdiniProdotti op
      INNER JOIN dbo.tbDealers d ON op.idDealer = d.idDealer
      WHERE op.idStatoOrdineProdotto = 0 -- 0 = IN ATTESA PAGAMENTO
      AND op.DataOra < DATEADD(HOUR, -24, GETDATE())
      ORDER BY op.DataOra ASC`;
      
    console.log('Esecuzione query ordini in attesa di pagamento:', query);
    const result = await sql.query(query);
    console.log(`Trovati ${result.recordset.length} ordini in attesa di pagamento`);
    
    if (result.recordset.length > 0) {
      console.log('Dettagli ordini:', JSON.stringify(result.recordset, null, 2));
    } else {
      console.log('Nessun ordine trovato con i criteri specificati');
    }
    
    res.json(result.recordset);
  } catch (err) {
    console.error('Errore nel recupero ordini in attesa di pagamento:', err);
    res.status(500).json({ 
      error: 'Errore nel recupero ordini in attesa', 
      details: err.message,
      query: err.query
    });
  }
});

console.log('PATCH segna-pagato e segna-spedito registrate!');
// Esportazioni ES modules

// PATCH: Segna come Pagato
app.patch('/api/ordini/:id/segna-pagato', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID ordine non valido' });
    
    await sql.query`UPDATE dbo.tbOrdiniProdotti SET idStatoOrdineProdotto = 22 WHERE IDOrdineProdotto = ${id}`;
    // Email disattivata su richiesta: non inviare notifica per stato PAGATO
    // (manteniamo solo l'aggiornamento di stato in DB)
    
    res.json({ success: true });
  } catch (err) {
    console.error('Errore PATCH segna-pagato:', err);
    res.status(500).json({ error: 'Errore segna-pagato', details: err.message });
  }
});

// PATCH: Segna come Spedito
app.patch('/api/ordini/:id/segna-spedito', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID ordine non valido' });
    
    await sql.query`UPDATE dbo.tbOrdiniProdotti SET stato_spedizione = 'Spedito' WHERE IDOrdineProdotto = ${id}`;
    
    // Invio email template SPEDITO
    try {
      await emailService.sendProductOrderEmail('SPEDITO', id, {});
    } catch (emailErr) {
      console.error('Errore invio email SPEDITO:', emailErr);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Errore PATCH segna-spedito:', err);
    res.status(500).json({ error: 'Errore segna-spedito', details: err.message });
  }
});

// PATCH: Segna come Confermato
app.patch('/api/ordini/:id/segna-confermato', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID ordine non valido' });
    
    await sql.query`UPDATE dbo.tbOrdiniProdotti SET idStatoOrdineProdotto = 2 WHERE IDOrdineProdotto = ${id}`;
    
    // Invio email template CONFERMATO
    try {
      await emailService.sendProductOrderEmail('CONFERMATO', id, {});
    } catch (emailErr) {
      console.error('Errore invio email CONFERMATO:', emailErr);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Errore PATCH segna-confermato:', err);
    res.status(500).json({ error: 'Errore segna-confermato', details: err.message });
  }
});

// PATCH: Segna come Annullato
app.patch('/api/ordini/:id/segna-annullato', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { motivo } = req.body;
    if (!id) return res.status(400).json({ error: 'ID ordine non valido' });
    
    await sql.query`UPDATE dbo.tbOrdiniProdotti SET idStatoOrdineProdotto = 1 WHERE IDOrdineProdotto = ${id}`;
    
    // Invio email template ANNULLATO
    try {
      await emailService.sendProductOrderEmail('ANNULLATO', id, {
        MOTIVO_ANNULLAMENTO: motivo || 'Non specificato'
      });
    } catch (emailErr) {
      console.error('Errore invio email ANNULLATO:', emailErr);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Errore PATCH segna-annullato:', err);
    res.status(500).json({ error: 'Errore segna-annullato', details: err.message });
  }
});

// PATCH: MasterProdotti - Aggiorna solo stato_spedizione
app.patch('/api/masterprodotti/ordini/:id/aggiorna-spedizione', authenticateToken, onlyMasterProdotti, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { stato_spedizione, noteDealer, idStatoSpedizione } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ID ordine non valido' });

    // Se l'ordine contiene l'offerta 446, non consentire aggiornamenti generici: usare segna-ricaricato
    try {
      const chk = await sql.query`
        SELECT COUNT(*) AS cnt
        FROM dbo.tbDettagliOrdiniProdotti
        WHERE idOrdineProdotto = ${id} AND idOfferta = 446
      `;
      const has446 = Number(chk?.recordset?.[0]?.cnt || 0) > 0;
      if (has446) {
        return res.status(400).json({ error: 'Per ordini con offerta 446 usare /segna-ricaricato (ID 26). Aggiornamento generico non consentito.' });
      }
    } catch {}

    const allowed = ['Non Spedito', 'Spedito', 'Consegnato'];
    if (!allowed.includes(stato_spedizione)) {
      return res.status(400).json({ error: 'stato_spedizione non valido' });
    }

    // Determina idStatoSpedizione se non viene passato esplicitamente
    let idSped = Number(idStatoSpedizione);
    if (!Number.isFinite(idSped)) {
      if (stato_spedizione === 'Spedito') idSped = 3;
      else if (stato_spedizione === 'Consegnato') idSped = 4;
      else if (stato_spedizione === 'Non Spedito') idSped = 31; // default storico
      else idSped = null;
    }

    if (idSped !== null) {
      await sql.query`
        UPDATE dbo.tbOrdiniProdotti
        SET stato_spedizione = ${stato_spedizione},
            idStatoSpedizione = ${idSped},
            Note4Dealer = COALESCE(${noteDealer}, Note4Dealer),
            DataStato = GETDATE()
        WHERE IDOrdineProdotto = ${id}
      `;
    } else {
      await sql.query`
        UPDATE dbo.tbOrdiniProdotti
        SET stato_spedizione = ${stato_spedizione},
            Note4Dealer = COALESCE(${noteDealer}, Note4Dealer),
            DataStato = GETDATE()
        WHERE IDOrdineProdotto = ${id}
      `;
    }

    // Nessuna email per il solo aggiornamento del flag di spedizione
    res.json({ success: true });
  } catch (err) {
    console.error('Errore PATCH aggiorna-spedizione:', err);
    res.status(500).json({ error: 'Errore aggiorna-spedizione', details: err.message });
  }
});

// PATCH: MasterProdotti - Segna CONSEGNATO (ID 4)
app.patch('/api/masterprodotti/ordini/:id/segna-consegnato', authenticateToken, onlyMasterProdotti, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { noteDealer } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ID ordine non valido' });

    // Blocca per offerta 446: percorso dedicato segna-ricaricato
    try {
      const chk = await sql.query`
        SELECT COUNT(*) AS cnt
        FROM dbo.tbDettagliOrdiniProdotti
        WHERE idOrdineProdotto = ${id} AND idOfferta = 446
      `;
      const has446 = Number(chk?.recordset?.[0]?.cnt || 0) > 0;
      if (has446) {
        return res.status(400).json({ error: 'Operazione non consentita per ordini con offerta 446. Usare /segna-ricaricato.' });
      }
    } catch {}

    await sql.query`
      UPDATE dbo.tbOrdiniProdotti
      SET idStatoOrdineProdotto = 4,
          DataStato = GETDATE(),
          Note4Dealer = COALESCE(${noteDealer}, Note4Dealer),
          stato_spedizione = 'Consegnato'
      WHERE IDOrdineProdotto = ${id}
    `;

    try {
      await emailService.sendProductOrderEmail('CONSEGNATO', id, { NOTEDEALER: noteDealer || '' });
    } catch (emailErr) {
      console.error('Errore invio email CONSEGNATO:', emailErr);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Errore PATCH segna-consegnato:', err);
    res.status(500).json({ error: 'Errore segna-consegnato', details: err.message });
  }
});

// PATCH: MasterProdotti - Segna CONSEGNATO A MANO (NON PAGATO) (ID 24)
app.patch('/api/masterprodotti/ordini/:id/segna-consegnato-a-mano', authenticateToken, onlyMasterProdotti, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { noteDealer } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ID ordine non valido' });

    // Blocca per offerta 446: percorso dedicato segna-ricaricato
    try {
      const chk = await sql.query`
        SELECT COUNT(*) AS cnt
        FROM dbo.tbDettagliOrdiniProdotti
        WHERE idOrdineProdotto = ${id} AND idOfferta = 446
      `;
      const has446 = Number(chk?.recordset?.[0]?.cnt || 0) > 0;
      if (has446) {
        return res.status(400).json({ error: 'Operazione non consentita per ordini con offerta 446. Usare /segna-ricaricato.' });
      }
    } catch {}

    await sql.query`
      UPDATE dbo.tbOrdiniProdotti
      SET idStatoOrdineProdotto = 24,
          DataStato = GETDATE(),
          Note4Dealer = COALESCE(${noteDealer}, Note4Dealer),
          stato_spedizione = 'Consegnato'
      WHERE IDOrdineProdotto = ${id}
    `;

    try {
      await emailService.sendProductOrderEmail('CONSEGNATO_A_MANO_NON_PAGATO', id, { NOTEDEALER: noteDealer || '' });
    } catch (emailErr) {
      console.error('Errore invio email CONSEGNATO_A_MANO_NON_PAGATO:', emailErr);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Errore PATCH segna-consegnato-a-mano:', err);
    res.status(500).json({ error: 'Errore segna-consegnato-a-mano', details: err.message });
  }
});

// PATCH: MasterProdotti - Segna RICARICATO (stato spedizione ID 26)
app.patch('/api/masterprodotti/ordini/:id/segna-ricaricato', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { noteDealer } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ID ordine non valido' });

    // Consenti l'azione solo se l'ordine contiene l'offerta 446
    const checkRes = await sql.query`
      SELECT COUNT(*) AS cnt
      FROM dbo.tbDettagliOrdiniProdotti
      WHERE idOrdineProdotto = ${id} AND idOfferta = 446
    `;
    const has446 = Number(checkRes?.recordset?.[0]?.cnt || 0) > 0;
    if (!has446) {
      return res.status(400).json({ error: 'Operazione non consentita: l\'ordine non contiene l\'offerta 446' });
    }

    // Tenta update idStatoSpedizione se la colonna esiste, altrimenti ripiega su campo testuale
    try {
      await sql.query`
        UPDATE dbo.tbOrdiniProdotti
        SET idStatoSpedizione = 26,
            DataStato = GETDATE(),
            Note4Dealer = COALESCE(${noteDealer}, Note4Dealer)
        WHERE IDOrdineProdotto = ${id}
      `;
    } catch (e) {
      // Fallback: ambienti senza colonna idStatoSpedizione
      await sql.query`
        UPDATE dbo.tbOrdiniProdotti
        SET stato_spedizione = 'RICARICATO',
            DataStato = GETDATE(),
            Note4Dealer = COALESCE(${noteDealer}, Note4Dealer)
        WHERE IDOrdineProdotto = ${id}
      `;
    }

    // Nessuna email automatica per RICARICATO (in linea con tabella stati)
    res.json({ success: true });
  } catch (err) {
    console.error('Errore PATCH segna-ricaricato:', err);
    res.status(500).json({ error: 'Errore segna-ricaricato', details: err.message });
  }
});

// PATCH: MasterProdotti - Annulla Ordine (stato ordine ID 1, stato spedizione ID 5)
app.patch('/api/masterprodotti/ordini/:id/annulla', authenticateToken, onlyMasterProdotti, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { noteDealer } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ID ordine non valido' });

    // Verifica che l'ordine sia in stato "Attesa Pagamento" (ID 0) e "Da Spedire" (ID 31)
    const checkRes = await sql.query`
      SELECT idStatoOrdineProdotto, idStatoSpedizione
      FROM dbo.tbOrdiniProdotti
      WHERE IDOrdineProdotto = ${id}
    `;
    
    if (!checkRes.recordset.length) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    
    const ordine = checkRes.recordset[0];
    if (ordine.idStatoOrdineProdotto !== 0 || ordine.idStatoSpedizione !== 31) {
      return res.status(400).json({ 
        error: 'Operazione non consentita: l\'ordine deve essere in "Attesa Pagamento" e "Da Spedire"' 
      });
    }

    // Aggiorna gli stati: Ordine = 1 (Annullato), Spedizione = 5 (Annullato)
    await sql.query`
      UPDATE dbo.tbOrdiniProdotti
      SET idStatoOrdineProdotto = 1,
          idStatoSpedizione = 5,
          DataStato = GETDATE(),
          Note4Dealer = COALESCE(${noteDealer}, Note4Dealer)
      WHERE IDOrdineProdotto = ${id}
    `;

    // Log dell'operazione
    console.log(`[MASTERPRODOTTI] Ordine ${id} annullato da utente ${req.user?.username || 'sconosciuto'}`);

    res.json({ success: true, message: 'Ordine annullato con successo' });
  } catch (err) {
    console.error('Errore PATCH annulla ordine:', err);
    res.status(500).json({ error: 'Errore annullamento ordine', details: err.message });
  }
});

// --- SUPERMASTER: Dealers locations for geolocalization (Google Maps) ---
// Staging frontend calls /api/dealers/locations; mirror here and protect for SUPERMASTER only
app.get('/api/dealers/locations', authenticateToken, onlySuperMaster, async (req, res) => {
  try {
    await getPool();
    const query = `
      SELECT 
        d.IDDealer,
        d.RagioneSociale,
        d.Indirizzo,
        d.CAP,
        d.Citta,
        d.Provincia,
        d.COMSY1,
        d.COMSY2
      FROM dbo.tbDealers d
      WHERE d.Indirizzo IS NOT NULL AND LTRIM(RTRIM(d.Indirizzo)) <> ''`;
    const result = await sql.query(query);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('[SUPERMASTER][DEALERS-LOCATIONS] Errore:', err);
    return res.status(500).json({ error: 'Errore nel recupero dealer', details: err.message });
  }
});

export {
  authenticateToken,
  dbConfig,
  app
};

// Esportazione predefinita per compatibilità
export default {
  authenticateToken,
  dbConfig,
  app
};