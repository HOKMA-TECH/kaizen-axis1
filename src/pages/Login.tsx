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
    confirmPassword: '',
    team: ''
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
              name: formData.name,
              team: formData.team
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
    <div className="min-h-screen bg-surface-50 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md bg-white dark:bg-surface-100 rounded-3xl shadow-xl p-8 animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">

        <div className="flex flex-col items-center mb-8 relative z-10">
          <div className="w-16 h-16 bg-gold-500 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-gold-500/30">
            {showMfaInput ? <ShieldCheck size={32} /> : <Building2 size={32} />}
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Kaizen Axis</h1>
          <p className="text-sm text-text-secondary mt-1 text-center">
            {showMfaInput
              ? 'Autenticação em Dois Fatores'
              : isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}
          </p>
        </div>

        {/* ── Tela MFA ──────────────────────────────────────────────────────── */}
        {showMfaInput ? (
          <form onSubmit={handleMfaSubmit} className="space-y-6 animate-in slide-in-from-right-8 duration-300 relative z-10">
            <div className="text-center text-sm text-text-secondary mb-2">
              Abra seu Google Authenticator ou Authy e digite o código de 6 dígitos para o Kaizen Axis.
            </div>

            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                className="w-full py-4 text-center tracking-[0.5em] text-2xl font-mono bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-500 text-text-primary placeholder:tracking-normal"
                placeholder="000000"
                autoFocus
                required
              />
            </div>

            <RoundedButton type="submit" fullWidth className="py-4 text-base" disabled={loading || mfaCode.length !== 6}>
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Verificar e Entrar'}
            </RoundedButton>

            <button
              type="button"
              onClick={() => { setShowMfaInput(false); setMfaCode(''); }}
              className="flex items-center justify-center gap-2 text-sm text-text-secondary hover:text-text-primary w-full mt-4 transition-colors p-2"
              disabled={loading}
            >
              <ArrowLeft size={16} /> Voltar ao Login
            </button>
          </form>

        ) : (
          /* ── Tela Login/Cadastro Padrão ───────────────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
            {!isLogin && (
              <div className="animate-in slide-in-from-top-4 duration-300 space-y-4">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={20} />
                  <input
                    type="text"
                    name="name"
                    placeholder="Nome completo"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-500 text-text-primary"
                  />
                </div>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={20} />
                  <select
                    name="team"
                    required
                    value={formData.team}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-500 text-text-primary appearance-none"
                  >
                    <option value="" disabled>Selecione sua equipe</option>
                    <option value="alpha">Equipe Alpha</option>
                    <option value="beta">Equipe Beta</option>
                    <option value="gamma">Equipe Gamma</option>
                  </select>
                </div>
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={20} />
              <input
                type="email"
                name="email"
                placeholder="E-mail"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-500 text-text-primary"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={20} />
              <input
                type="password"
                name="password"
                placeholder="Senha"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-500 text-text-primary"
              />
            </div>

            {!isLogin && (
              <div className="relative animate-in slide-in-from-top-4 duration-300">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={20} />
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Confirme a senha"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 bg-surface-50 rounded-xl border-none focus:ring-2 focus:ring-gold-500 text-text-primary"
                />
              </div>
            )}

            {isLogin && (
              <div className="flex justify-between items-center px-1">
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  className="text-xs font-medium text-blue-600 hover:text-blue-500 transition-colors"
                >
                  Preencher Demo Diretor
                </button>
                <button type="button" className="text-xs font-medium text-gold-600 hover:text-gold-500 transition-colors">
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <RoundedButton type="submit" fullWidth className="mt-6 py-4 text-base" disabled={loading}>
              {loading ? <Loader2 size={20} className="animate-spin" /> : (isLogin ? 'Entrar' : 'Cadastrar')}
            </RoundedButton>
          </form>
        )}

        {!showMfaInput && (
          <div className="mt-8 text-center relative z-10">
            <p className="text-sm text-text-secondary">
              {isLogin ? 'Ainda não tem uma conta?' : 'Já possui uma conta?'}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="ml-1 font-bold text-gold-600 hover:text-gold-500 transition-colors"
              >
                {isLogin ? 'Cadastre-se' : 'Faça login'}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
