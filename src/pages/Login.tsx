import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoundedButton } from '@/components/ui/PremiumComponents';
import { Building2, Mail, Lock, User, Users, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAuditEvent } from '@/services/auditLogger';

export default function Login() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  // Dados de formulário básico
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  // Estado MFA
  const [showMfaInput, setShowMfaInput] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  // Estado de redefinição de senha (vindo do link do e-mail)
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Detecta evento PASSWORD_RECOVERY do Supabase
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      alert('As senhas não coincidem.');
      return;
    }
    if (newPassword.length < 8) {
      alert('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      alert('Erro ao redefinir senha: ' + error.message);
    } else {
      alert('Senha redefinida com sucesso! Faça login com sua nova senha.');
      setShowResetPassword(false);
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!isLogin) {
        // Cadastro
        if (formData.password !== formData.confirmPassword) {
          alert('As senhas não coincidem.');
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              name: formData.name
            }
          }
        });

        if (error) throw error;
        alert('Cadastro realizado com sucesso! Verifique seu e-mail ou faça login.');
        setIsLogin(true);
        setLoading(false);
      } else {
        // Login protegido no backend: secure-login aplica rate limit por IP antes de autenticar.
        const { data: loginData, error: loginError } = await supabase.functions.invoke('secure-login', {
          body: { email: formData.email, password: formData.password },
        });

        if (loginError) {
          let status = 500;
          let message = 'Falha no login seguro. Tente novamente.';
          try {
            const response = (loginError as any).context;
            if (response) {
              status = response.status || status;
              const errData = await response.json().catch(() => ({}));
              message = errData?.message || message;
            }
          } catch {
            // ignore parse failure, keep generic message
          }

          if (status === 429) throw new Error(message || 'Muitas tentativas. Aguarde antes de tentar novamente.');
          if (status === 400) throw new Error(message || 'Dados de login inválidos.');
          if (status === 401) throw new Error(message || 'Credenciais inválidas.');
          throw new Error(message);
        }

        const accessToken = loginData?.access_token;
        const refreshToken = loginData?.refresh_token;
        if (!accessToken || !refreshToken) {
          throw new Error('Resposta de autenticação inválida.');
        }

        const { data: sessionSetData, error: sessionSetError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionSetError) throw sessionSetError;

        const session = sessionSetData?.session;
        setPendingUserId(session?.user?.id || loginData?.user?.id || null);

        // Verificar se requer MFA (Assurance Level AAL2 não atingido)
        if (session && session.user) {
          const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (mfaError) throw mfaError;

          if (mfaData.nextLevel === 'aal2' && mfaData.nextLevel !== mfaData.currentLevel) {
            // Requer MFA. Pegar o fator TOTP ativo.
            const { data: factors } = await supabase.auth.mfa.listFactors();
            const totpFactor = factors?.totp?.find(f => f.status === 'verified');

            if (totpFactor) {
              setMfaFactorId(totpFactor.id);
              setShowMfaInput(true);
              setLoading(false);
              return; // Para aqui e aguarda o código MFA
            }

            // MFA é exigido mas nenhum fator verificado encontrado — bloqueia acesso
            await supabase.auth.signOut();
            logAuditEvent({ action: 'login_failed', entity: 'auth', metadata: { reason: 'mfa_required_no_factor' } });
            throw new Error('Autenticação em dois fatores é obrigatória. Configure o 2FA nas configurações da sua conta.');
          }
        }

        // Login direto bem-sucedido (não tem MFA ativado)
        finishLogin(session?.user?.id || loginData?.user?.id || null);
        setPendingUserId(null);
      }
    } catch (error: any) {
      console.error('Erro na autenticação:', error.message);
      logAuditEvent({
        action: 'login_failed',
        entity: 'auth',
        metadata: { email: formData.email, reason: error.message }
      });
      alert(error.message);
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaCode.length !== 6) {
      alert('O código deve ter 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challengeError) throw challengeError;

      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challengeData.id,
        code: mfaCode
      });

      if (verifyError) throw verifyError;

      // Código verificado com sucesso, entra no sistema
      finishLogin(pendingUserId || verifyData?.user?.id || null);
      setPendingUserId(null);
    } catch (error: any) {
      console.error('Erro MFA:', error.message);
      logAuditEvent({
        action: 'login_failed',
        entity: 'auth',
        metadata: { email: formData.email, stage: 'mfa', reason: error.message }
      });
      alert('Código inválido. Tente novamente.');
      setLoading(false);
    }
  };

  const finishLogin = (userId?: string | null) => {
    logAuditEvent({
      action: 'login_success',
      entity: 'auth',
      userId: userId ?? null,
      metadata: { email: formData.email }
    });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex items-center justify-center md:p-6">

      {/* ── Login Card: fullscreen on mobile, card on desktop ── */}
      <div className="w-full md:max-w-md bg-white dark:bg-surface-100 md:rounded-3xl md:shadow-xl min-h-screen md:min-h-0 p-8 animate-in fade-in zoom-in-95 duration-500 flex flex-col justify-center">

        <div className="flex flex-col items-center mb-10 text-center">
          <h2 className="text-2xl font-bold text-text-primary tracking-tight">
            {showResetPassword ? 'Nova Senha' : showMfaInput ? 'Autenticação' : (isLogin ? 'Bem-vindo de volta' : 'Criar Nova Conta')}
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            {showResetPassword
              ? 'Digite e confirme sua nova senha'
              : showMfaInput
              ? 'Proteção em Dois Fatores'
              : 'Insira suas credenciais para acessar a plataforma'}
          </p>
        </div>

        {/* ── Tela Redefinir Senha ───────────────────────────────────────────── */}
        {showResetPassword ? (
          <form onSubmit={handleResetPasswordSubmit} className="space-y-5 animate-in fade-in duration-300">
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="password"
                placeholder="Nova senha"
                required
                minLength={8}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-sm text-text-primary focus:outline-none"
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="password"
                placeholder="Confirme a nova senha"
                required
                minLength={8}
                value={confirmNewPassword}
                onChange={e => setConfirmNewPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-sm text-text-primary focus:outline-none"
              />
            </div>
            <RoundedButton type="submit" fullWidth className="py-4 text-base font-semibold shadow-gold-500/20 shadow-lg" disabled={loading}>
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Salvar Nova Senha'}
            </RoundedButton>
          </form>
        ) : showMfaInput ? (
          <form onSubmit={handleMfaSubmit} className="space-y-6 animate-in slide-in-from-right-8 duration-300">
            <div className="text-center text-sm text-text-secondary bg-surface-50 dark:bg-surface-800 p-4 rounded-xl">
              Abra seu Google Authenticator ou Authy e digite o código de 6 dígitos para o Kaizen Axis.
            </div>

            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                className="w-full py-4 text-center tracking-[0.75em] text-3xl font-mono bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-sm text-text-primary placeholder:tracking-normal placeholder:text-lg focus:outline-none"
                placeholder="000000"
                autoFocus
                required
              />
            </div>

            <RoundedButton type="submit" fullWidth className="py-4 text-base font-semibold shadow-gold-500/20 shadow-lg" disabled={loading || mfaCode.length !== 6}>
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Verificar e Entrar'}
            </RoundedButton>

            <button
              type="button"
              onClick={() => { setShowMfaInput(false); setMfaCode(''); }}
              className="flex items-center justify-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary w-full mt-2 transition-colors py-2"
              disabled={loading}
            >
              <ArrowLeft size={16} /> Voltar ao Login
            </button>
          </form>
        ) : (
          /* ── Tela Login/Cadastro Padrão ───────────────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="animate-in slide-in-from-top-4 duration-300">
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-gold-500 transition-colors" size={20} />
                  <input
                    type="text"
                    name="name"
                    placeholder="Nome completo"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full pl-12 pr-4 py-3.5 bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-sm text-text-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="email"
                name="email"
                placeholder="E-mail profissional"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full pl-12 pr-4 py-3.5 bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-sm text-text-primary focus:outline-none"
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-gold-500 transition-colors" size={20} />
              <input
                type="password"
                name="password"
                placeholder="Senha"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full pl-12 pr-4 py-3.5 bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-sm text-text-primary focus:outline-none"
              />
            </div>

            {!isLogin && (
              <div className="relative animate-in slide-in-from-top-4 duration-300 group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-gold-500 transition-colors" size={20} />
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Confirme a senha"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full pl-12 pr-4 py-3.5 bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-sm text-text-primary focus:outline-none"
                />
              </div>
            )}

            {isLogin && (
              <div className="flex justify-end items-center px-1">
                <button
                  type="button"
                  className="text-xs font-semibold text-gold-600 hover:text-gold-500 transition-colors"
                  onClick={async () => {
                    const email = formData.email.trim();
                    if (!email) {
                      alert('Digite seu e-mail no campo acima antes de clicar em "Esqueceu a senha?".');
                      return;
                    }
                    setLoading(true);
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                    setLoading(false);
                    if (error) {
                      alert('Erro ao enviar e-mail: ' + error.message);
                    } else {
                      alert('E-mail de redefinição de senha enviado! Verifique sua caixa de entrada.');
                    }
                  }}
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <RoundedButton type="submit" fullWidth className="mt-8 py-4 text-base font-semibold shadow-gold-500/20 shadow-lg" disabled={loading}>
              {loading ? <Loader2 size={20} className="animate-spin" /> : (isLogin ? 'Entrar na Plataforma' : 'Cadastrar Conta')}
            </RoundedButton>
          </form>
        )}

        {!showMfaInput && !showResetPassword && (
          <div className="mt-8 text-center border-t border-surface-100 dark:border-surface-800 pt-6">
            <p className="text-sm text-text-secondary">
              {isLogin ? 'Novo por aqui?' : 'Já faz parte da equipe?'}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="ml-1.5 font-bold text-gold-600 hover:text-gold-500 transition-colors"
              >
                {isLogin ? 'Solicite acesso' : 'Faça login'}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
