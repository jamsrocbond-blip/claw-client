import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import MainLayout from './components/MainLayout';
import ChatPage from './pages/ChatPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import AppListPage from './pages/AppListPage';
import AppEditPage from './pages/AppEditPage';
import AppCreateWizard from './pages/AppCreateWizard';
import LawLibraryPage from './pages/LawLibraryPage';
import SettingsPage from './pages/SettingsPage';
import ClawPage from './pages/ClawPage';
import { AuthProvider, useAuth } from './hooks/useAuth';

const ProtectedRoutes: React.FC = () => {
  const { isLoggedIn, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <MainLayout>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/apps" element={<AppListPage />} />
        <Route path="/apps/create" element={<AppCreateWizard />} />
        <Route path="/apps/:id/edit" element={<AppEditPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/laws" element={<LawLibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/claw" element={<ClawPage />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </MainLayout>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;
