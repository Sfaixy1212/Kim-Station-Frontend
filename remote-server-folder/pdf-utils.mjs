import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import imageType from 'image-type';

/**
 * Unisce file PDF e immagini in un unico PDF.
 * @param {Array<{buffer: Buffer, originalname: string, mimetype: string}>} files
 * @returns {Promise<Buffer>} Buffer del PDF risultante
 */
export async function mergeFilesToPdf(files) {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    if (file.mimetype === 'application/pdf') {
      // Unisci PDF
      const srcPdf = await PDFDocument.load(file.buffer);
      const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } else if (file.mimetype.startsWith('image/')) {
      // Converti immagine in PDF page
      const imgType = imageType(file.buffer);
      if (!imgType) throw new Error('Tipo immagine non riconosciuto');
      let pdfImage, dims;
      if (imgType.mime === 'image/jpeg') {
        pdfImage = await mergedPdf.embedJpg(file.buffer);
        dims = pdfImage.scale(1);
      } else if (imgType.mime === 'image/png') {
        pdfImage = await mergedPdf.embedPng(file.buffer);
        dims = pdfImage.scale(1);
      } else {
        // Converti altri formati in PNG con sharp
        const pngBuffer = await sharp(file.buffer).png().toBuffer();
        pdfImage = await mergedPdf.embedPng(pngBuffer);
        dims = pdfImage.scale(1);
      }
      const page = mergedPdf.addPage([dims.width, dims.height]);
      page.drawImage(pdfImage, { x: 0, y: 0, width: dims.width, height: dims.height });
    } else {
      throw new Error('Formato file non supportato: ' + file.mimetype);
    }
  }

  return Buffer.from(await mergedPdf.save());
}
