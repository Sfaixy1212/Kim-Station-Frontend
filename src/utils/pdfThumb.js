// Utility per generare un thumbnail dalla prima pagina di un PDF usando pdfjs-dist
// Ritorna una data URL (PNG) oppure null in caso di errore

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';

// Prepara il worker (una sola volta)
let workerInstance = null;
function ensureWorker() {
  if (!workerInstance) {
    workerInstance = new PdfWorker();
    GlobalWorkerOptions.workerPort = workerInstance;
  }
}

export async function getPdfThumbnail(pdfUrl, { width = 512, pageNumber = 1 } = {}) {
  try {
    ensureWorker();

    const loadingTask = getDocument({ url: pdfUrl, withCredentials: false });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);

    const viewport = page.getViewport({ scale: 1 });
    const scale = width / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: false });
    canvas.width = Math.floor(scaledViewport.width);
    canvas.height = Math.floor(scaledViewport.height);

    await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');

    // Cleanup
    canvas.width = 0;
    canvas.height = 0;
    await page.cleanup?.();
    await pdf.cleanup?.();

    return dataUrl;
  } catch (err) {
    // Silenzioso: se fallisce, caller mostrerà placeholder
    console.warn('[PDF-THUMB] Impossibile generare thumbnail:', err);
    return null;
  }
}
