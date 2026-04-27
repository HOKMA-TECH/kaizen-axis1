import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Reorder } from 'framer-motion';
import { X, Loader2, CheckCircle2, Download, Database, Trash2, FileText, GripVertical, ScanLine } from 'lucide-react';
import { PDFToolType } from '@/pages/PdfTools';
import { PdfDropzone } from './PdfDropzone';
import { PdfToolConfig } from './PdfToolConfig';
import { SaveDocumentModal } from './SaveDocumentModal';
import { ImageScanModal } from './ImageScanModal';
import { saveAs } from 'file-saver';

// Import PDF function libraries
import { imageToPdf } from '@/lib/pdf-tools/imageToPdf';
import { mergePdf } from '@/lib/pdf-tools/mergePdf';
import { splitPdf } from '@/lib/pdf-tools/splitPdf';
import { compressPdf } from '@/lib/pdf-tools/compressPdf';
import { pdfToJpg } from '@/lib/pdf-tools/pdfToJpg';
import { protectPdf } from '@/lib/pdf-tools/protectPdf';
import { unlockPdf } from '@/lib/pdf-tools/unlockPdf';

interface FileItem {
    id: string;
    file: File;
    previewUrl: string;
}

interface PdfToolDrawerProps {
    tool: { id: PDFToolType; title: string; description: string; icon: any } | null;
    isOpen: boolean;
    onClose: () => void;
}

export function PdfToolDrawer({ tool, isOpen, onClose }: PdfToolDrawerProps) {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
    const [generatedFileName, setGeneratedFileName] = useState<string>('');
    const [config, setConfig] = useState<any>({});
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState<FileItem | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setFiles([]);
        setIsProcessing(false);
        setSuccess(false);
        setGeneratedBlob(null);
        setConfig({});
    }, [tool?.id, isOpen]);

    const handleFilesAccepted = (acceptedFiles: File[]) => {
        const newItems = acceptedFiles.map((file) => ({
            id: Math.random().toString(36).substring(7),
            file,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
        }));

        const isSingleFile = ['split-pdf', 'compress-pdf', 'pdf-to-jpg', 'protect-pdf', 'unlock-pdf'].includes(tool?.id as string);
        if (isSingleFile) {
            setFiles([newItems[0]]);
        } else {
            setFiles(prev => [...prev, ...newItems]);
        }
    };

    const handleGenerate = async () => {
        if (!tool || files.length === 0) return;
        setIsProcessing(true);

        try {
            let resultBlob: Blob;
            let outName = 'documento.pdf';
            const fileArray = files.map(f => f.file);

            switch (tool.id) {
                case 'image-to-pdf':
                    resultBlob = await imageToPdf(fileArray, config);
                    outName = 'imagens_convertidas.pdf';
                    break;
                case 'merge-pdf':
                    resultBlob = await mergePdf(fileArray);
                    outName = 'pdf_mesclado.pdf';
                    break;
                case 'split-pdf':
                    resultBlob = await splitPdf(fileArray[0], config.pages || '1');
                    outName = 'pdf_dividido.pdf';
                    break;
                case 'compress-pdf':
                    resultBlob = await compressPdf(fileArray[0], config.quality ?? 0.5);
                    outName = 'pdf_comprimido.pdf';
                    break;
                case 'pdf-to-jpg':
                    resultBlob = await pdfToJpg(fileArray[0]);
                    outName = 'paginas_extraidas.zip';
                    break;
                case 'protect-pdf':
                    resultBlob = await protectPdf(fileArray[0], config.password);
                    outName = 'pdf_protegido.pdf';
                    break;
                case 'unlock-pdf':
                    resultBlob = await unlockPdf(fileArray[0], config.password);
                    outName = 'pdf_desbloqueado.pdf';
                    break;
                default:
                    throw new Error('Ferramenta desconhecida');
            }

            setGeneratedBlob(resultBlob!);
            setGeneratedFileName(outName);
            setSuccess(true);
        } catch (error: any) {
            console.error(error);
            alert('Erro ao processar: ' + (error.message || 'Verifique o console.'));
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen || !tool) return null;

    return createPortal(
        <>
            {/* Backdrop - underneath the drawer but above the bottom nav */}
            <div
                className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Drawer Panel - above the bottom nav */}
            <div className="fixed inset-0 z-[60] flex justify-end pointer-events-none">
                <div className="w-full md:w-[480px] h-full bg-white dark:bg-[#111b21] shadow-2xl flex flex-col pointer-events-auto">
                    {/* Header */}
                    <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg">
                                <tool.icon size={22} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{tool.title}</h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{tool.description}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Scrollable Body */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
                        {!success ? (
                            <>
                                <PdfDropzone
                                    onFilesAccepted={handleFilesAccepted}
                                    acceptType={tool.id === 'image-to-pdf' ? 'image' : 'pdf'}
                                    maxFiles={['image-to-pdf', 'merge-pdf'].includes(tool.id) ? 200 : 1}
                                />

                                {files.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                            Arquivos ({files.length})
                                        </h3>
                                        <Reorder.Group axis="y" values={files} onReorder={setFiles} className="space-y-2">
                                            {files.map((item) => (
                                                <Reorder.Item key={item.id} value={item} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#202c33] rounded-xl border border-gray-100 dark:border-gray-800 select-none cursor-grab active:cursor-grabbing">
                                                    <GripVertical size={15} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                                                    {item.previewUrl ? (
                                                        <img src={item.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500 flex-shrink-0">
                                                            <FileText size={18} />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.file.name}</p>
                                                        <p className="text-xs text-gray-400">{(item.file.size / 1024 / 1024).toFixed(2)} MB</p>
                                                    </div>
                                                    {/* Auto-Recortar: only for image files in image-to-pdf */}
                                                    {tool.id === 'image-to-pdf' && item.previewUrl && (
                                                        <button
                                                            onClick={() => setScanTarget(item)}
                                                            title="Auto-Recortar documento"
                                                            className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors flex-shrink-0"
                                                        >
                                                            <ScanLine size={15} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setFiles(files.filter(f => f.id !== item.id))}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </Reorder.Item>
                                            ))}
                                        </Reorder.Group>
                                    </div>
                                )}

                                {files.length > 0 && (
                                    <PdfToolConfig toolId={tool.id} config={config} onChange={setConfig} />
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 space-y-5 text-center">
                                <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 text-green-500 rounded-full flex items-center justify-center">
                                    <CheckCircle2 size={44} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Pronto!</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{generatedFileName} gerado com sucesso.</p>
                                </div>
                                <div className="flex flex-col gap-3 w-full max-w-xs pt-4">
                                    <button
                                        onClick={() => generatedBlob && saveAs(generatedBlob, generatedFileName)}
                                        className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors"
                                    >
                                        <Download size={18} /> Baixar arquivo
                                    </button>
                                    <button
                                        onClick={() => setIsSaveModalOpen(true)}
                                        className="flex items-center justify-center gap-2 w-full px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl font-semibold transition-colors"
                                    >
                                        <Database size={18} /> Salvar na ficha do cliente
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Fixed Footer - ALWAYS visible */}
                    {!success && (
                        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#0d1418]">
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3 px-4 bg-white dark:bg-[#202c33] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-[#2a3942] transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleGenerate}
                                    disabled={files.length === 0 || isProcessing}
                                    className="flex-[2] py-3 px-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:cursor-not-allowed text-white disabled:text-gray-400 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                                >
                                    {isProcessing
                                        ? <><Loader2 size={17} className="animate-spin" /> Processando...</>
                                        : 'Gerar arquivo'
                                    }
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* CRM Save Modal */}
            <SaveDocumentModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                fileBlob={generatedBlob}
                fileName={generatedFileName}
            />

            {/* Auto-Scan Modal */}
            {scanTarget && (
                <ImageScanModal
                    imageFile={scanTarget.file}
                    onConfirm={(croppedFile) => {
                        const newPreviewUrl = URL.createObjectURL(croppedFile);
                        setFiles(prev => prev.map(f =>
                            f.id === scanTarget.id
                                ? { ...f, file: croppedFile, previewUrl: newPreviewUrl }
                                : f
                        ));
                        setScanTarget(null);
                    }}
                    onClose={() => setScanTarget(null)}
                />
            )}
        </>,
        document.body
    );
}

