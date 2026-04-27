/**
 * Tesseract OCR Worker — Kaizen Axis
 * Roda em um Web Worker isolado (Vite: importado com `?worker`)
 * Recebe: { canvas: OffscreenCanvas | ImageData, pageNum: number }
 * Envia:  { pageNum: number, text: string } | { pageNum: number, error: string }
 */

import { createWorker } from 'tesseract.js';

// Tesseract worker (single per Web Worker instance — 1 worker = 1 página)
let tesseractWorker: Awaited<ReturnType<typeof createWorker>> | null = null;

async function ensureWorker() {
    if (!tesseractWorker) {
        tesseractWorker = await createWorker('por', 1, { logger: () => { } });
    }
    return tesseractWorker;
}

self.onmessage = async (e: MessageEvent<{
    imageData: ImageData;
    pageNum: number;
    width: number;
    height: number;
}>) => {
    const { imageData, pageNum, width, height } = e.data;

    try {
        // Reconstrói o canvas a partir do ImageData — OffscreenCanvas para Web Workers
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(imageData, 0, 0);

        const worker = await ensureWorker();

        // Tesseract 5.x aceita OffscreenCanvas diretamente via canvas como any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: { text } } = await worker.recognize(canvas as any);

        self.postMessage({ pageNum, text });
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'OCR error';
        self.postMessage({ pageNum, text: '', error: errMsg });
    }
};
