import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoundedButton } from '@/components/ui/PremiumComponents';
import { ShieldCheck, LogOut, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { Modal } from '@/components/ui/Modal';

export default function PendingApproval() {
    const navigate = useNavigate();
    const { signOut, profile } = useApp();
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);

    // If the profile becomes active while they are on this screen, they can enter
    useEffect(() => {
        if (profile?.status === 'Ativo' || profile?.status === 'active') {
            navigate('/');
        }
    }, [profile?.status, navigate]);

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            await signOut();
            navigate('/login');
        } finally {
            setIsSigningOut(false);
            setIsLogoutConfirmOpen(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-50 flex flex-col justify-center items-center p-6 text-center">
            <div className="w-full max-w-md bg-white dark:bg-surface-100 rounded-3xl shadow-xl p-10 animate-in fade-in zoom-in-95 duration-700">

                <div className="flex justify-center mb-8 relative">
                    <div className="absolute inset-0 bg-amber-200/50 dark:bg-amber-900/40 rounded-full blur-xl animate-pulse" />
                    <div className="relative w-24 h-24 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center border-4 border-amber-200 dark:border-amber-700/50 shadow-inner">
                        <ShieldCheck size={48} className="text-amber-600 dark:text-amber-500" />
                    </div>
                </div>

                <h1 className="text-2xl font-bold text-text-primary mb-3">
                    Cadastro em Análise
                </h1>

                <p className="text-text-secondary leading-relaxed mb-8">
                    Seu cadastro foi realizado com sucesso! Nossa diretoria está analisando a sua solicitação. Assim que aprovado, você receberá acesso a todas as funcionalidades do aplicativo Kaizen.
                </p>

                <div className="flex items-center justify-center gap-2 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 py-3 px-4 rounded-xl mb-8">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Aguardando liberação de acesso...</span>
                </div>

                <RoundedButton
                    variant="outline"
                    fullWidth
                    onClick={() => setIsLogoutConfirmOpen(true)}
                    className="text-text-secondary hover:text-text-primary border-surface-200"
                >
                    <LogOut size={18} className="mr-2" />
                    Sair e voltar ao Login
                </RoundedButton>

                <Modal
                    isOpen={isLogoutConfirmOpen}
                    onClose={() => !isSigningOut && setIsLogoutConfirmOpen(false)}
                    title="Confirmar saída"
                >
                    <div className="space-y-4 text-left">
                        <p className="text-sm text-text-secondary">
                            Tem certeza que deseja sair da conta agora?
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsLogoutConfirmOpen(false)}
                                disabled={isSigningOut}
                                className="px-4 py-2 rounded-lg border border-surface-200 text-text-secondary hover:bg-surface-100 disabled:opacity-60"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleSignOut(); }}
                                disabled={isSigningOut}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
                            >
                                {isSigningOut ? 'Saindo...' : 'Sair agora'}
                            </button>
                        </div>
                    </div>
                </Modal>

            </div>
        </div>
    );
}
