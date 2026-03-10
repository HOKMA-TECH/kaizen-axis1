import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoundedButton } from '@/components/ui/PremiumComponents';
import { Building2, Mail, Lock, User, Users, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleDemoLogin = () => {
    setFormData({
      ...formData,
      email: 'diretor@kaizen.com',
      password: 'demo'
    });
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
        // Login Etapa 1: Senha
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password
        });

        if (error) throw error;

        // Verificar se requer MFA (Assurance Level AAL2 não atingido)
        if (data.session && data.session.user) {
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
          }
        }

        // Login direto bem-sucedido (não tem MFA ativado)
        finishLogin();
      }
    } catch (error: any) {
      console.error('Erro na autenticação:', error.message);
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
      finishLogin();
    } catch (error: any) {
      console.error('Erro MFA:', error.message);
      alert('Código inválido. Tente novamente.');
      setLoading(false);
    }
  };

  const finishLogin = () => {
    localStorage.setItem('isAuthenticated', 'true');
    navigate('/');
  };

  return (
    <div className="min-h-screen w-full flex bg-surface-50 dark:bg-surface-900 font-sans selection:bg-gold-500/30">

      {/* ── Left Side: Premium Background Art (Desktop) ── */}
      <div className="hidden lg:flex relative w-1/2 overflow-hidden bg-surface-50 items-center justify-center">
        <img
          src="/bg-login.png"
          alt="Kaizen Axis"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* ── Right Side: Login Form ── */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 relative">

        {/* Mobile Background */}
        <div className="absolute inset-0 lg:hidden z-0 overflow-hidden bg-surface-50 dark:bg-surface-900">
          <div className="absolute inset-0 bg-surface-50/90 dark:bg-surface-900/90 backdrop-blur-xl" />
        </div>

        {/* Glassmorphism Card */}
        <div className="w-full max-w-md bg-white/95 dark:bg-surface-100/95 backdrop-blur-md rounded-[2rem] shadow-2xl shadow-black/5 p-8 lg:p-10 animate-in fade-in zoom-in-95 duration-500 relative z-10 border border-white/50 dark:border-surface-700/50">

          <div className="flex flex-col items-center mb-10 text-center">
            {/* Mobile Logo */}
            <div className="lg:hidden w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-gold-500/30">
              {showMfaInput ? <ShieldCheck size={32} /> : <Building2 size={32} />}
            </div>

            <h2 className="text-2xl font-bold text-text-primary tracking-tight">
              {showMfaInput ? 'Autenticação' : (isLogin ? 'Bem-vindo de volta' : 'Criar Nova Conta')}
            </h2>
            <p className="text-sm text-text-secondary mt-2">
              {showMfaInput
                ? 'Proteção em Dois Fatores'
                : 'Insira suas credenciais para acessar a plataforma'}
            </p>
          </div>

          {/* ── Tela MFA ──────────────────────────────────────────────────────── */}
          {showMfaInput ? (
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
                  className="w-full py-4 text-center tracking-[0.75em] text-3xl font-mono bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-all text-text-primary placeholder:tracking-normal placeholder:text-lg focus:outline-none"
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
                  <button type="button" className="text-xs font-semibold text-gold-600 hover:text-gold-500 transition-colors">
                    Esqueceu a senha?
                  </button>
                </div>
              )}

              <RoundedButton type="submit" fullWidth className="mt-8 py-4 text-base font-semibold shadow-gold-500/20 shadow-lg" disabled={loading}>
                {loading ? <Loader2 size={20} className="animate-spin" /> : (isLogin ? 'Entrar na Plataforma' : 'Cadastrar Conta')}
              </RoundedButton>
            </form>
          )}

          {!showMfaInput && (
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
    </div>
  );
}
