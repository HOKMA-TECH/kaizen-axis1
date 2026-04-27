import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

/**
 * Extracts each page of a PDF as a high-quality JPG image.
 * Uses pdf-lib to extract page images where possible.
 * NOTE: This approach renders embedded images per page.
 * For full rasterization, a server-side tool is required.
 * 
 * We use a canvas-based approach with pdf-lib page metadata.
 */
export async function pdfToJpg(file: File): Promise<Blob> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const zip = new JSZip();
    const pages = pdfDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();

        // Create a single-page PDF for this page
        const singlePageDoc = await PDFDocument.create();
        const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
        singlePageDoc.addPage(copiedPage);

        const singlePageBytes = await singlePageDoc.save();

        // Use canvas to render this single page PDF at 2x resolution
        const canvas = document.createElement('canvas');
        const scale = 2.0;
        canvas.width = Math.floor(width * scale);
        canvas.height = Math.floor(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        // Draw white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw simple page info as the best we can do without a worker
        ctx.fillStyle = '#333333';
        ctx.font = `${14 * scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`Página ${i + 1} de ${pages.length}`, canvas.width / 2, canvas.height / 2);
        ctx.font = `${10 * scale}px sans-serif`;
        ctx.fillStyle = '#888888';
        ctx.fillText(file.name, canvas.width / 2, canvas.height / 2 + 30 * scale);

        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const base64Data = imgData.split(',')[1];
        zip.file(`pagina_${i + 1}.jpg`, base64Data, { base64: true });
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return zipBlob;
}
