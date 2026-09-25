import { useState, useEffect, Component, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Home from './screens/Home';
import NovoRomaneio from './screens/NovoRomaneio';
import EditarRomaneio from './screens/EditarRomaneio';
import VisualizarRomaneio from './screens/VisualizarRomaneio';
import Configuracoes from './screens/Configuracoes';
import Login from './screens/Login';
import Ativacao from './screens/Ativacao';
import { ModalAtivacao } from './components/ModalAtivacao';
import { useAuthStore } from './store/useAuthStore';
import { Menu, User, Loader2, Zap, RefreshCw, AlertTriangle } from 'lucide-react';
import Swal from 'sweetalert2';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou erro:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 font-sans">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-950/50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Ops! Ocorreu um erro inesperado</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 p-3 rounded-xl font-mono text-left break-all max-h-32 overflow-y-auto">
              {this.state.error?.message || 'Erro desconhecido.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <RefreshCw size={16} />
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface MainLayoutProps {
  activationInfo: {
    ativado: boolean;
    motivo: 'unactivated' | 'expired' | 'fraud' | 'ok';
    isTrial?: boolean;
    diasRestantes?: number;
    validade?: string;
    hardwareId?: string;
  };
  onRecheckActivation: () => void;
}

function MainLayout({ activationInfo, onRecheckActivation }: MainLayoutProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modalAtivacaoAberto, setModalAtivacaoAberto] = useState(false);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 992) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path === '/novo') return 'Novo Romaneio';
    if (path.startsWith('/editar/')) return 'Editar Romaneio';
    if (path.startsWith('/visualizar/')) return 'Visualizar Romaneio';
    if (path === '/configuracoes') return 'Configurações';
    return 'MT PRO - Madeira Serrada';
  };

  return (
    <div className="wrapper">
      {/* SIDEBAR RESPONSIVA */}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* OVERLAY ESCURO (Bloqueador de fundo no Mobile) */}
      <div 
        className={`sidebar-overlay ${mobileOpen ? 'active' : ''}`} 
        id="sidebar-overlay" 
        onClick={() => setMobileOpen(false)}
      />

      {/* ÁREA DE CONTEÚDO PRINCIPAL (MAIN CONTENT) */}
      <div id="content">
        {/* HEADER DA PÁGINA (Barra Superior) */}
        <header className="main-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {/* Botão Hamburger (Apenas Mobile) */}
            <button className="btn-hamburger" id="btn-hamburger" onClick={() => setMobileOpen(true)} title="Abrir Menu">
              <Menu />
            </button>
            <h2 id="view-title">{getPageTitle()}</h2>
          </div>

          {/* Área Direita do Header (Informações de Perfil / Status / Trial) */}
          <div className="header-right">
            {activationInfo.isTrial && (
              <button
                type="button"
                onClick={() => setModalAtivacaoAberto(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-black transition-all cursor-pointer shadow-xs hover:scale-105"
                title="Versão de avaliação. Clique para ativar a chave de licença completa."
              >
                <Zap size={14} className="animate-pulse text-amber-500" />
                <span>Trial: {activationInfo.diasRestantes ?? 7} dia{(activationInfo.diasRestantes ?? 7) === 1 ? '' : 's'}</span>
                <span className="bg-amber-500 text-slate-900 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ml-0.5">Ativar</span>
              </button>
            )}

            <div className="user-info">
              <User />
              <span>{user?.email || 'Administrador'}</span>
            </div>
          </div>
        </header>

        {/* CONTAINER ONDE AS VIEWS DINÂMICAS SERÃO CARREGADAS */}
        <main id="dynamic-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/novo" element={<NovoRomaneio />} />
            <Route path="/editar/:id" element={<EditarRomaneio />} />
            <Route path="/visualizar/:id" element={<VisualizarRomaneio />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Routes>
        </main>
      </div>

      {/* Modal de Ativação Rápida */}
      <ModalAtivacao
        isOpen={modalAtivacaoAberto}
        onClose={() => setModalAtivacaoAberto(false)}
        onActivated={() => {
          setModalAtivacaoAberto(false);
          onRecheckActivation();
        }}
        diasRestantes={activationInfo.diasRestantes}
        validade={activationInfo.validade}
      />
    </div>
  );
}

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initTrialSession = useAuthStore((state) => state.initTrialSession);
  const [isActivated, setIsActivated] = useState(false);
  const [activationMotivo, setActivationMotivo] = useState<'unactivated' | 'expired' | 'fraud' | 'ok'>('unactivated');
  const [activationInfo, setActivationInfo] = useState<{
    ativado: boolean;
    motivo: 'unactivated' | 'expired' | 'fraud' | 'ok';
    isTrial?: boolean;
    diasRestantes?: number;
    validade?: string;
    hardwareId?: string;
  }>({ ativado: false, motivo: 'unactivated' });
  const [checkingActivation, setCheckingActivation] = useState(true);

  // Aplica o tema salvo no localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, []);

  // Listener global de Atualização Automática Pronta para Instalar
  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.onUpdateDownloaded === 'function') {
      const unsubscribeDownloaded = window.electronAPI.onUpdateDownloaded(() => {
        Swal.fire({
          title: '🎉 Atualização Pronta!',
          text: 'Uma nova versão do sistema foi baixada e está pronta para ser instalada. Deseja reiniciar agora para aplicar?',
          icon: 'info',
          showCancelButton: true,
          confirmButtonColor: '#059669',
          cancelButtonColor: '#64748b',
          confirmButtonText: 'Reiniciar e Atualizar Agora',
          cancelButtonText: 'Lembrar Mais Tarde',
          customClass: { popup: 'rounded-3xl' }
        }).then((result) => {
          if (result.isConfirmed) {
            window.electronAPI.installUpdate();
          }
        });
      });

      return () => {
        unsubscribeDownloaded();
      };
    }
  }, []);

  const checkActivation = async () => {
    try {
      if (window.electronAPI && typeof window.electronAPI.checkActivationStatus === 'function') {
        const res = await window.electronAPI.checkActivationStatus();
        setIsActivated(res.ativado);
        setActivationMotivo(res.motivo);
        setActivationInfo(res);
        if (res.ativado && res.isTrial) {
          initTrialSession(res.diasRestantes, res.validade, res.hardwareId);
        }
      } else {
        setIsActivated(true);
        setActivationMotivo('ok');
        setActivationInfo({ ativado: true, motivo: 'ok', isTrial: false });
      }
    } catch (e) {
      console.error('Erro ao verificar licença:', e);
      setIsActivated(true);
      setActivationMotivo('ok');
      setActivationInfo({ ativado: true, motivo: 'ok', isTrial: false });
    } finally {
      setCheckingActivation(false);
    }
  };

  useEffect(() => {
    checkActivation();
  }, []);

  if (checkingActivation) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-955 font-sans">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
        <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Verificando licença de uso...</span>
      </div>
    );
  }

  if (!isActivated) {
    return (
      <ErrorBoundary>
        <Ativacao onActivated={checkActivation} motivo={activationMotivo} />
      </ErrorBoundary>
    );
  }

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <Login />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <MainLayout activationInfo={activationInfo} onRecheckActivation={checkActivation} />
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;

