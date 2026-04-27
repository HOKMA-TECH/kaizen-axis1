import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoundedButton } from '@/components/ui/PremiumComponents';
import { Lock, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Escuta o evento PASSWORD_RECOVERY — dispara quando Supabase processa
    // o token do link de redefinição de senha
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // Também verifica se já há sessão de recovery ativa (caso o evento já disparou)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('As senhas não coincidem.');
      return;
    }
    if (newPassword.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      alert('Erro ao redefinir senha: ' + error.message);
    } else {
      setDone(true);
      await supabase.auth.signOut();
      setTimeout(() => navigate('/login'), 2500);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle size={56} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Senha redefinida!</h2>
          <p className="text-text-secondary text-sm">Você será redirecionado para o login em instantes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-text-primary">Redefinir Senha</h2>
          <p className="text-sm text-text-secondary mt-2">Digite e confirme sua nova senha</p>
        </div>

        {!ready ? (
          <div className="flex flex-col items-center gap-3 py-6 text-text-secondary">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">Validando link de redefinição...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="password"
                placeholder="Nova senha"
                required
                minLength={6}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-surface-50 rounded-xl border border-surface-200 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-sm text-text-primary focus:outline-none"
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="password"
                placeholder="Confirme a nova senha"
                required
                minLength={6}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-surface-50 rounded-xl border border-surface-200 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-sm text-text-primary focus:outline-none"
              />
            </div>
            <RoundedButton type="submit" fullWidth className="py-4 text-base font-semibold" disabled={loading}>
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Salvar Nova Senha'}
            </RoundedButton>
          </form>
        )}
      </div>
    </div>
  );
}
