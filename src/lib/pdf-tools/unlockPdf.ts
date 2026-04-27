import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Unlocks a password-protected PDF.
 * Uses pdfjs-dist (real AES decryption) to render each page and rebuilds
 * a brand-new PDF with pdf-lib — guaranteed to have no encryption.
 */
export async function unlockPdf(file: File, password: string): Promise<Blob> {
    if (!password || password.trim().length === 0) {
        throw new Error('Por favor, informe a senha atual do PDF.');
    }

    const arrayBuffer = await file.arrayBuffer();

    let pdfDoc: pdfjsLib.PDFDocumentProxy;
    try {
        pdfDoc = await pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer),
            password,
        }).promise;
    } catch (err: any) {
        const msg = String(err?.message ?? err?.name ?? err).toLowerCase();
        if (
            msg.includes('password') ||
            msg.includes('incorrect') ||
            msg.includes('passwordexception') ||
            msg.includes('wrong')
        ) {
            throw new Error('Senha incorreta. Verifique a senha e tente novamente.');
        }
        throw new Error('Não foi possível abrir o PDF. Verifique o arquivo e a senha.');
    }

    const numPages = pdfDoc.numPages;
    const newPdf = await PDFDocument.create();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        const pngDataUrl = canvas.toDataURL('image/png');
        const base64 = pngDataUrl.split(',')[1];
        const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

        const pngImage = await newPdf.embedPng(pngBytes);
        const pageWidth = viewport.width / 2;
        const pageHeight = viewport.height / 2;
        const pdfPage = newPdf.addPage([pageWidth, pageHeight]);
        pdfPage.drawImage(pngImage, {
            x: 0,
            y: 0,
            width: pageWidth,
            height: pageHeight,
        });
    }

    const pdfBytes = await newPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}
