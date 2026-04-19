import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "sonner";
import Sidebar from "./components/Sidebar";
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
import UtilizadoresPage from "./pages/UtilizadoresPage";
import BibliotecaPage from "./pages/BibliotecaPage";
import FuncionariosPage from "./pages/FuncionariosPage";
import AssiduidadePage from "./pages/AssiduidadePage";
import ProcessamentoSalarialPage from "./pages/ProcessamentoSalarialPage";
import ConfiguracoesSalariaisPage from "./pages/ConfiguracoesSalariaisPage";
import PublicSignPage from "./pages/PublicSignPage";
import DespesasPage from "./pages/DespesasPage";

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
      <main className="flex-1 ml-72 p-6 md:p-8 lg:p-10">
        {children}
      </main>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" theme="dark" richColors />
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/p/:token" element={<PublicSignPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/orcamentos" element={<ProtectedRoute><OrcamentosPage /></ProtectedRoute>} />
          <Route path="/propostas" element={<ProtectedRoute><PropostasPage /></ProtectedRoute>} />
          <Route path="/negociacao" element={<ProtectedRoute><NegociacaoPage /></ProtectedRoute>} />
          <Route path="/obras" element={<ProtectedRoute><ObrasPage /></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute><AgendaPage /></ProtectedRoute>} />
          <Route path="/materiais" element={<ProtectedRoute><MateriaisPage /></ProtectedRoute>} />
          <Route path="/mao-de-obra" element={<ProtectedRoute><MaoDeObraPage /></ProtectedRoute>} />
          <Route path="/produtividades" element={<ProtectedRoute><ProdutividadesPage /></ProtectedRoute>} />
          <Route path="/utilizadores" element={<ProtectedRoute><UtilizadoresPage /></ProtectedRoute>} />
          <Route path="/biblioteca" element={<ProtectedRoute><BibliotecaPage /></ProtectedRoute>} />
          <Route path="/funcionarios" element={<ProtectedRoute><FuncionariosPage /></ProtectedRoute>} />
          <Route path="/assiduidade" element={<ProtectedRoute><AssiduidadePage /></ProtectedRoute>} />
          <Route path="/processamento-salarial" element={<ProtectedRoute><ProcessamentoSalarialPage /></ProtectedRoute>} />
          <Route path="/config-salariais" element={<ProtectedRoute><ConfiguracoesSalariaisPage /></ProtectedRoute>} />
          <Route path="/despesas" element={<ProtectedRoute><DespesasPage /></ProtectedRoute>} />
          <Route path="/definicoes" element={<ProtectedRoute><DefinicoesPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
