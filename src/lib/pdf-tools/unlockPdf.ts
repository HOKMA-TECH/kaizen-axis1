import { PDFDocument } from 'pdf-lib';

/**
 * Unlocks a password-protected PDF.
 * Returns a new PDF blob without the password.
 */
export async function unlockPdf(file: File, password: string): Promise<Blob> {
    if (!password || password.trim().length === 0) {
        throw new Error('Por favor, informe a senha atual do PDF.');
    }

    const arrayBuffer = await file.arrayBuffer();

    let pdf: PDFDocument;
    try {
        pdf = await PDFDocument.load(arrayBuffer, { password });
    } catch (err: any) {
        const msg = String(err?.message ?? err).toLowerCase();
        if (msg.includes('password') || msg.includes('incorrect') || msg.includes('encrypted') || msg.includes('decrypt')) {
            throw new Error('Senha incorreta. Verifique a senha e tente novamente.');
        }
        if (msg.includes('not encrypted') || msg.includes('no password')) {
            throw new Error('Este PDF não está protegido por senha.');
        }
        throw new Error('Não foi possível abrir o PDF. Verifique o arquivo e a senha.');
    }

    // Save without encryption (pdf-lib default)
    const pdfBytes = await pdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}
