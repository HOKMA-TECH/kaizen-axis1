import { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { logAuditEvent } from '@/services/auditLogger';
import { rateLimiter } from '@/services/rateLimiter';

interface SaveDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileBlob: Blob | null;
    fileName: string;
}

export function SaveDocumentModal({ isOpen, onClose, fileBlob, fileName }: SaveDocumentModalProps) {
    const { profile, refreshClients } = useApp();
    const [clients, setClients] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [docType, setDocType] = useState('Outros');
    const [editableName, setEditableName] = useState('');
    const [fileExt, setFileExt] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) {
            setSearch('');
            setSelectedClient(null);
            setSaveStatus('idle');
            setErrorMsg('');
            setEditableName('');
            setFileExt('');
            return;
        }

        // Extract extension and base name
        const match = fileName.match(/^(.*)\.([^.]+)$/);
        if (match) {
            setEditableName(match[1]);
            setFileExt(`.${match[2]}`);
        } else {
            setEditableName(fileName);
            setFileExt('.pdf'); // default assumption
        }
    }, [isOpen, fileName]);

    useEffect(() => {
        if (!isOpen) return;

        const run = async () => {
            let query = supabase.from('clients').select('id, name').limit(10).order('name');
            if (search.trim()) {
                query = query.ilike('name', `%${search.trim()}%`);
            }
            const { data } = await query;
            setClients(data || []);
            setShowDropdown(true);
        };

        const timer = setTimeout(run, 250);
        return () => clearTimeout(timer);
    }, [search, isOpen]);

    const handleSave = async () => {
        if (!selectedClient || !fileBlob) return;
        setIsSaving(true);
        setSaveStatus('idle');
        setErrorMsg('');

        try {
            try {
                await rateLimiter.enforce('document_upload', { userId: profile?.id || null });
            } catch (err: any) {
                setErrorMsg(err?.message || 'Limite de upload atingido. Aguarde instantes.');
                setSaveStatus('error');
                setIsSaving(false);
                return;
            }

            const finalName = `${editableName.trim() || 'Documento Sem Nome'}${fileExt}`;
            const extForStorage = fileExt.replace('.', '');
            const storagePath = `${selectedClient.id}/${Date.now()}.${extForStorage}`;

            // Convert Blob to File (Supabase storage fetch sometimes hangs on raw Blobs from pdf-lib)
            const fileObj = new File([fileBlob], finalName, { type: fileBlob.type || 'application/pdf' });

            // Wrap upload in a timeout to guarantee it never hangs the UI forever
            const uploadPromise = supabase.storage
                .from('client-documents')
                .upload(storagePath, fileObj, {
                    contentType: fileObj.type,
                    upsert: false // changed to false to avoid UPDATE policy permission issues
                });

            const timeoutPromise = new Promise<{ data: any, error: any }>((_, reject) => {
                setTimeout(() => reject(new Error('Tempo limite de upload excedido (Timeout).')), 15000);
            });

            // Upload file to storage with timeout race
            const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);

            if (uploadError) {
                throw new Error(`Erro no Upload: ${uploadError.message || uploadError}`);
            }

            // Insert record
            const { error: dbError } = await supabase
                .from('client_documents')
                .insert({
                    client_id: selectedClient.id,
                    name: finalName,
                    type: docType,
                    url: storagePath,
                    created_by: profile?.id ?? null,
                });

            if (dbError) {
                throw new Error(`Erro no Banco: ${dbError.message}`);
            }

            await refreshClients();
            logAuditEvent({
                action: 'document_uploaded',
                entity: 'client_document',
                entityId: selectedClient.id,
                userId: profile?.id || null,
                metadata: { name: finalName, path: storagePath, origin: 'pdf_tools_modal' }
            });

            setSaveStatus('success');
            setTimeout(() => onClose(), 1500);
        } catch (err: any) {
            console.error('Save error:', err);
            setErrorMsg(err.message || 'Erro ao conectar com o servidor.');
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white dark:bg-[#1a2329] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Salvar na Ficha do Cliente</h3>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {saveStatus === 'success' && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl text-sm font-medium">
                            <CheckCircle2 size={16} /> Documento salvo com sucesso!
                        </div>
                    )}
                    {saveStatus === 'error' && (
                        <div className="flex flex-col gap-1 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm">
                            <div className="flex items-center gap-2 font-medium"><AlertCircle size={16} /> Erro ao salvar</div>
                            <span className="text-xs opacity-80">{errorMsg}</span>
                        </div>
                    )}

                    {/* Client Search */}
                    <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Selecionar Cliente</label>
                        <div className="relative">
                            <Search className="absolute text-gray-400 left-3 top-1/2 -translate-y-1/2" size={16} />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Digite o nome do cliente..."
                                value={selectedClient ? selectedClient.name : search}
                                onFocus={() => setShowDropdown(true)}
                                onChange={e => {
                                    setSearch(e.target.value);
                                    setSelectedClient(null);
                                }}
                                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </div>
                        {showDropdown && !selectedClient && clients.length > 0 && (
                            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                                {clients.map(c => (
                                    <button
                                        key={c.id}
                                        onMouseDown={() => { setSelectedClient(c); setShowDropdown(false); }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-900/10 text-sm text-gray-900 dark:text-white transition-colors"
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Doc type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tipo de Documento</label>
                        <select
                            value={docType}
                            onChange={e => setDocType(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#202c33] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                            <option>Identidade</option>
                            <option>Comprovante de Renda</option>
                            <option>Comprovante de Residência</option>
                            <option>Contrato</option>
                            <option>Declaração</option>
                            <option>Outros</option>
                        </select>
                    </div>

                    {/* File */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nome do Arquivo</label>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-xl focus-within:ring-2 focus-within:ring-amber-400 transition-all">
                            <span className="text-gray-400">📄</span>
                            <input
                                type="text"
                                value={editableName}
                                onChange={(e) => setEditableName(e.target.value)}
                                className="flex-1 bg-transparent border-none text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-0 py-1"
                                placeholder="Nome do documento"
                            />
                            <span className="text-sm font-medium text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded-md pointer-events-none select-none">
                                {fileExt}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 bg-gray-50 dark:bg-[#111b21] flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!selectedClient || isSaving || saveStatus === 'success'}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                    >
                        {isSaving ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Confirmar e Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
