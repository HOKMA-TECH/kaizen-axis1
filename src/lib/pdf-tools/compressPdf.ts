import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Reuse the same worker setup as IncomeAnalysis
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Compresses a PDF by rendering each page to a JPEG canvas and rebuilding.
 * Quality range: 0.1 (smallest file) – 1.0 (best quality).
 * Typically achieves 50–90% size reduction on image-heavy PDFs.
 */
export async function compressPdf(file: File, quality: number = 0.5): Promise<Blob> {
    const clampedQuality = Math.min(1, Math.max(0.1, quality));

    // Scale factor: lower quality → smaller canvas → smaller file
    // 0.1 → scale 0.5 | 0.5 → scale 0.85 | 1.0 → scale 1.5
    const scale = 0.5 + clampedQuality * 1.0;

    const arrayBuffer = await file.arrayBuffer();

    // Load with pdfjs for rendering
    const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const numPages = pdfDoc.numPages;

    // Create new PDF to embed compressed images
    const newPdf = await PDFDocument.create();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Convert to JPEG with quality compression
        const jpegDataUrl = canvas.toDataURL('image/jpeg', clampedQuality);
        const base64 = jpegDataUrl.split(',')[1];
        const jpegBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

        const jpgImage = await newPdf.embedJpg(jpegBytes);
        const pdfPage = newPdf.addPage([viewport.width, viewport.height]);
        pdfPage.drawImage(jpgImage, {
            x: 0,
            y: 0,
            width: viewport.width,
            height: viewport.height,
        });
    }

    const pdfBytes = await newPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}
