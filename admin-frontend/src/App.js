// src/App.js

import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatWidgetProvider } from './context/ChatWidgetContext';
import ProtectedRoute from './components/ProtectedRoute';
import AgentRoute from './components/AgentRoute';
import AdminLayout from './components/layout/AdminLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AgentLoginPage from './pages/AgentLoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminUsersPage from './pages/AdminUsersPage';
import SiteSettingsPage from './pages/SiteSettingsPage';
import CreateEditUserPage from './pages/CreateEditUserPage';
import UserProfilePage from './pages/UserProfilePage';
import BotPage from './pages/BotPage';
import HealthPage from './pages/HealthPage';
import AgentPanel from './pages/AgentPanel';
import AgentsPage from './pages/AgentsPage';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentChatsPage from './pages/AgentChatsPage';
import WebsitesPage from './pages/WebsitesPage';
import ChatWidgetWrapper from './components/ChatWidget/ChatWidgetWrapper';

import './styles/index.css';

// Inner component that has access to auth context
function AppContent() {
  const { user } = useAuth();

  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/user/login" element={<LoginPage userMode={true} />} />
        <Route path="/agent/login" element={<AgentLoginPage />} />

        {/* Protected routes - require authentication */}
        <Route
          path="/agent"
          element={
            <AgentRoute>
              <AgentPanel />
            </AgentRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <DashboardPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/new"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <CreateEditUserPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/:userId/edit"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <CreateEditUserPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <AdminUsersPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <SiteSettingsPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <UserProfilePage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bot/:botId"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <BotPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/health"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <HealthPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/websites"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <WebsitesPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/new"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <CreateAgentPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/:userId?"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <AgentsPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/:agentId/chats"
          element={
            <ProtectedRoute>
              <AdminLayout>
                {user?.role === 'agent' ? <Navigate to="/agent" replace /> : <AgentChatsPage />}
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route
          path="/"
          element={
            <Navigate
              to={
                user?.role === 'agent'
                  ? '/agent'
                  : user?.role === 'admin'
                    ? '/admin/users'
                    : '/dashboard'
              }
              replace
            />
          }
        />

        {/* 404 fallback */}
        <Route
          path="*"
          element={
            <Navigate
              to={
                user?.role === 'agent'
                  ? '/agent'
                  : user?.role === 'admin'
                    ? '/admin/users'
                    : '/dashboard'
              }
              replace
            />
          }
        />
      </Routes>

      {/* Chat Widget - only show when user is logged in and widget is activated (not for agents) */}
      {user && user.role !== 'agent' && <ChatWidgetWrapper />}
    </>
  );
}

function App() {
  return (
    <Provider store={store}>
      <AuthProvider>
        <ChatWidgetProvider>
          <Router>
            <AppContent />
          </Router>
        </ChatWidgetProvider>
      </AuthProvider>
    </Provider>
  );
}

export default App;
