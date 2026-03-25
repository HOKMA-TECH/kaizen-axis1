import { jsPDF } from 'jspdf';

export interface ImageToPdfOptions {
    orientation?: 'portrait' | 'landscape';
    format?: 'a4' | 'fit';
}

/**
 * Converts multiple images into a single PDF document.
 * Images are scaled to fit the page while preserving their original aspect ratio.
 */
export async function imageToPdf(files: File[], options: ImageToPdfOptions = { orientation: 'portrait', format: 'a4' }): Promise<Blob> {
    let doc: jsPDF | null = null;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const imgData = await fileToDataUrl(file);
        const { width: imgW, height: imgH } = await getImageDimensions(imgData);
        const imgAspect = imgW / imgH;

        if (options.format === 'fit') {
            // Page dimensions match the image exactly (convert px → mm at 96 dpi)
            const mmW = (imgW / 96) * 25.4;
            const mmH = (imgH / 96) * 25.4;
            const orientation = imgAspect >= 1 ? 'l' : 'p';

            if (!doc) {
                doc = new jsPDF({ orientation, unit: 'mm', format: [mmW, mmH] });
            } else {
                doc.addPage([mmW, mmH], orientation);
            }

            const pageWidth  = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.addImage(imgData, getImgType(file), 0, 0, pageWidth, pageHeight, undefined, 'FAST');

        } else {
            // A4 mode: fit the image inside the page preserving aspect ratio, centered
            const orientation = options.orientation === 'landscape' ? 'l' : 'p';

            if (!doc) {
                doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
            } else {
                doc.addPage('a4', orientation);
            }

            const pageWidth  = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const pageAspect = pageWidth / pageHeight;

            let drawW: number;
            let drawH: number;

            if (imgAspect > pageAspect) {
                // Image is wider than the page → fit by width
                drawW = pageWidth;
                drawH = pageWidth / imgAspect;
            } else {
                // Image is taller than the page → fit by height
                drawH = pageHeight;
                drawW = pageHeight * imgAspect;
            }

            // Center on page
            const x = (pageWidth  - drawW) / 2;
            const y = (pageHeight - drawH) / 2;

            doc.addImage(imgData, getImgType(file), x, y, drawW, drawH, undefined, 'FAST');
        }
    }

    if (!doc) throw new Error('Nenhuma imagem fornecida');
    return doc.output('blob');
}

function getImgType(file: File): string {
    if (file.type === 'image/png')  return 'PNG';
    if (file.type === 'image/webp') return 'WEBP';
    return 'JPEG';
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src     = dataUrl;
    });
}
