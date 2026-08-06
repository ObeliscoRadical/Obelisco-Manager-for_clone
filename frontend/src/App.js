import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "sonner";
import Sidebar from "./components/Sidebar";
import NotificationsBell from "./components/NotificationsBell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import OrcamentosPage from "./pages/OrcamentosPage";
import PropostasPage from "./pages/PropostasPage";
import ObrasPage from "./pages/ObrasPage";
import AgendaPage from "./pages/AgendaPage";
import MateriaisPage from "./pages/MateriaisPage";
import MaoDeObraPage from "./pages/MaoDeObraPage";
import ProdutividadesPage from "./pages/ProdutividadesPage";
import DefinicoesPage from "./pages/DefinicoesPage";
import NegociacaoPage from "./pages/NegociacaoPage";
import LegendaQuadroPage from "./pages/LegendaQuadroPage";
import MascaraDinPage from "./pages/MascaraDinPage";
import UtilizadoresPage from "./pages/UtilizadoresPage";
import BibliotecaPage from "./pages/BibliotecaPage";
import FuncionariosPage from "./pages/FuncionariosPage";
import AssiduidadePage from "./pages/AssiduidadePage";
import ProcessamentoSalarialPage from "./pages/ProcessamentoSalarialPage";
import CreditosPage from "./pages/CreditosPage";
import CustosFixosPage from "./pages/CustosFixosPage";
import ConfiguracoesSalariaisPage from "./pages/ConfiguracoesSalariaisPage";
import PublicSignPage from "./pages/PublicSignPage";
import DespesasPage from "./pages/DespesasPage";
import FaturasPage from "./pages/FaturasPage";
import DashboardFinanceiroPage from "./pages/DashboardFinanceiroPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import GuiasPage from "./pages/GuiasPage";
import PipelinePage from "./pages/PipelinePage";
import PontoEquilibrioPage from "./pages/PontoEquilibrioPage";
import ContabilistaPage from "./pages/ContabilistaPage";
import TechDashboardPage from "./pages/TechDashboardPage";
import TechExecucaoPage from "./pages/TechExecucaoPage";
import TechObraDetailPage from "./pages/TechObraDetailPage";
import TechGuideDetailPage from "./pages/TechGuideDetailPage";
import TechAgendaPage from "./pages/TechAgendaPage";
import TechPontoPage from "./pages/TechPontoPage";
import TechChatPage from "./pages/TechChatPage";
import TechPerfilPage from "./pages/TechPerfilPage";
import AdminMensagensTecnicosPage from "./pages/AdminMensagensTecnicosPage";
import CaixaObraPage from "./pages/CaixaObraPage";
import PedidosServicoPage from "./pages/PedidosServicoPage";
import WidgetPedidoPage from "./pages/WidgetPedidoPage";
import RelatoriosPontoPage from "./pages/RelatoriosPontoPage";
import PontoGPSPage from "./pages/PontoGPSPage";
import TechPedidosPage from "./pages/TechPedidosPage";
import PerfilClientePage from "./pages/PerfilClientePage";
import AnaliseBancariaPage from "./pages/AnaliseBancariaPage";
import TechLayout from "./components/TechLayout";

const LoadingScreen = () => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-zinc-400 text-sm font-medium">A carregar...</p>
    </div>
  </div>
);

function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 ml-72 p-6 md:p-8 lg:p-10 relative">
        <div className="absolute top-4 right-6 md:right-8 lg:right-10 z-40">
          <NotificationsBell />
        </div>
        {children}
      </main>
    </div>
  );
}

function ProtectedRoute({ children, module: moduleKey }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  // Se for técnico, redireciona-o para o portal técnico
  if (user.__kind === 'tech') return <Navigate to="/tech" replace />;
  // Verificação granular de módulo (se o Route especificou uma chave)
  if (moduleKey && user.role !== 'admin') {
    const perms = user.module_permissions;
    if (perms && perms[moduleKey] !== true) {
      return <Layout><div className="p-8 text-center text-zinc-400" data-testid="no-permission-msg">
        <p className="text-2xl font-bold text-yellow-400 mb-2">Sem permissão</p>
        <p className="text-sm">Não tem acesso a este módulo. Contacte o administrador.</p>
      </div></Layout>;
    }
  }
  return <Layout>{children}</Layout>;
}

function TechProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  // Permite: técnico (employees), admin (supervisor), OU user com permissão tech_portal
  const isTech = user.__kind === 'tech';
  const isAdmin = user.role === 'admin';
  const hasTechPerm = user.module_permissions?.tech_portal === true;
  if (!isTech && !isAdmin && !hasTechPerm) return <Navigate to="/" replace />;
  return <TechLayout>{children}</TechLayout>;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) {
    // Redirect based on kind
    return <Navigate to={user.__kind === 'tech' ? '/tech' : '/'} replace />;
  }
  return <LoginPage />;
}

function CatchAllRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user?.__kind === 'tech') return <Navigate to="/tech" replace />;
  return <Navigate to="/" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" theme="dark" richColors />
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/p/:token" element={<PublicSignPage />} />
          <Route path="/" element={<ProtectedRoute module="dashboard"><DashboardPage /></ProtectedRoute>} />
          <Route path="/orcamentos" element={<ProtectedRoute module="orcamentos"><OrcamentosPage /></ProtectedRoute>} />
          <Route path="/propostas" element={<ProtectedRoute module="propostas"><PropostasPage /></ProtectedRoute>} />
          <Route path="/negociacao" element={<ProtectedRoute module="propostas"><NegociacaoPage /></ProtectedRoute>} />
          <Route path="/legenda-quadro" element={<ProtectedRoute module="propostas"><LegendaQuadroPage /></ProtectedRoute>} />
          <Route path="/mascara-din" element={<ProtectedRoute module="propostas"><MascaraDinPage /></ProtectedRoute>} />
          <Route path="/obras" element={<ProtectedRoute module="obras"><ObrasPage /></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute module="agenda"><AgendaPage /></ProtectedRoute>} />
          <Route path="/materiais" element={<ProtectedRoute module="materiais"><MateriaisPage /></ProtectedRoute>} />
          <Route path="/mao-de-obra" element={<ProtectedRoute module="materiais"><MaoDeObraPage /></ProtectedRoute>} />
          <Route path="/produtividades" element={<ProtectedRoute module="materiais"><ProdutividadesPage /></ProtectedRoute>} />
          <Route path="/utilizadores" element={<ProtectedRoute module="utilizadores"><UtilizadoresPage /></ProtectedRoute>} />
          <Route path="/biblioteca" element={<ProtectedRoute module="biblioteca"><BibliotecaPage /></ProtectedRoute>} />
          <Route path="/funcionarios" element={<ProtectedRoute module="funcionarios"><FuncionariosPage /></ProtectedRoute>} />
          <Route path="/assiduidade" element={<ProtectedRoute module="assiduidade"><AssiduidadePage /></ProtectedRoute>} />
          <Route path="/processamento-salarial" element={<ProtectedRoute module="salarios"><ProcessamentoSalarialPage /></ProtectedRoute>} />
          <Route path="/creditos" element={<ProtectedRoute module="salarios"><CreditosPage /></ProtectedRoute>} />
          <Route path="/custos-fixos" element={<ProtectedRoute module="custos_fixos"><CustosFixosPage /></ProtectedRoute>} />
          <Route path="/config-salariais" element={<ProtectedRoute module="salarios"><ConfiguracoesSalariaisPage /></ProtectedRoute>} />
          <Route path="/despesas" element={<ProtectedRoute module="despesas"><DespesasPage /></ProtectedRoute>} />
          <Route path="/faturas" element={<ProtectedRoute module="faturas"><FaturasPage /></ProtectedRoute>} />
          <Route path="/financeiro" element={<ProtectedRoute module="financeiro"><DashboardFinanceiroPage /></ProtectedRoute>} />
          <Route path="/relatorios" element={<ProtectedRoute module="relatorios"><RelatoriosPage /></ProtectedRoute>} />
          <Route path="/guias" element={<ProtectedRoute module="transporte_guias"><GuiasPage /></ProtectedRoute>} />
          <Route path="/pipeline" element={<ProtectedRoute module="obras"><PipelinePage /></ProtectedRoute>} />
          <Route path="/ponto-equilibrio" element={<ProtectedRoute module="ponto_equilibrio"><PontoEquilibrioPage /></ProtectedRoute>} />
          <Route path="/contabilista" element={<ProtectedRoute module="contabilista"><ContabilistaPage /></ProtectedRoute>} />
          <Route path="/definicoes" element={<ProtectedRoute module="configuracoes"><DefinicoesPage /></ProtectedRoute>} />
          <Route path="/mensagens-tecnicos" element={<ProtectedRoute module="funcionarios"><AdminMensagensTecnicosPage /></ProtectedRoute>} />
          <Route path="/caixa-obra" element={<ProtectedRoute module="obras"><CaixaObraPage /></ProtectedRoute>} />
          <Route path="/pedidos-servico" element={<ProtectedRoute module="obras"><PedidosServicoPage /></ProtectedRoute>} />
          <Route path="/ponto-gps" element={<ProtectedRoute module="assiduidade"><PontoGPSPage /></ProtectedRoute>} />
          <Route path="/relatorios-ponto" element={<ProtectedRoute module="assiduidade"><RelatoriosPontoPage /></ProtectedRoute>} />
          <Route path="/pedido-servico" element={<WidgetPedidoPage />} />
          <Route path="/perfil-cliente" element={<ProtectedRoute module="obras"><PerfilClientePage /></ProtectedRoute>} />
          <Route path="/analise-bancaria" element={<ProtectedRoute module="financeiro"><AnaliseBancariaPage /></ProtectedRoute>} />
          {/* ===== Portal Técnico (isolado do admin) ===== */}
          <Route path="/tech" element={<TechProtectedRoute><TechDashboardPage /></TechProtectedRoute>} />
          <Route path="/tech/pedidos" element={<TechProtectedRoute><TechPedidosPage /></TechProtectedRoute>} />
          <Route path="/tech/execucao" element={<TechProtectedRoute><TechExecucaoPage /></TechProtectedRoute>} />
          <Route path="/tech/execucao/:workId" element={<TechProtectedRoute><TechExecucaoPage /></TechProtectedRoute>} />
          <Route path="/tech/obra/:workId" element={<TechProtectedRoute><TechObraDetailPage /></TechProtectedRoute>} />
          <Route path="/tech/guias/:id" element={<TechProtectedRoute><TechGuideDetailPage /></TechProtectedRoute>} />
          <Route path="/tech/agenda" element={<TechProtectedRoute><TechAgendaPage /></TechProtectedRoute>} />
          <Route path="/tech/ponto" element={<TechProtectedRoute><TechPontoPage /></TechProtectedRoute>} />
          <Route path="/tech/chat" element={<TechProtectedRoute><TechChatPage /></TechProtectedRoute>} />
          <Route path="/tech/perfil" element={<TechProtectedRoute><TechPerfilPage /></TechProtectedRoute>} />
          <Route path="*" element={<CatchAllRoute />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
