// src/App.js

import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatWidgetProvider } from './context/ChatWidgetContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AgentLoginPage from './pages/AgentLoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminUsersPage from './pages/AdminUsersPage';
import UserProfilePage from './pages/UserProfilePage';
import BotPage from './pages/BotPage';
import HealthPage from './pages/HealthPage';
import AgentPanel from './pages/AgentPanel';
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
            <ProtectedRoute>
              <AgentPanel />
            </ProtectedRoute>
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
        
        {/* Default redirect */}
        <Route 
          path="/" 
          element={<Navigate to={user?.role === 'agent' ? '/agent' : '/dashboard'} replace />} 
        />
        
        {/* 404 fallback */}
        <Route 
          path="*" 
          element={<Navigate to={user?.role === 'agent' ? '/agent' : '/dashboard'} replace />} 
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
