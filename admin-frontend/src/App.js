// src/App.js

import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatWidgetProvider } from './context/ChatWidgetContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AgentLoginPage from './pages/AgentLoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminUsersPage from './pages/AdminUsersPage';
import BotPage from './pages/BotPage';
import HealthPage from './pages/HealthPage';
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
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bot/:botId"
          element={
            <ProtectedRoute>
              <BotPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/health"
          element={
            <ProtectedRoute>
              <HealthPage />
            </ProtectedRoute>
          }
        />
        
        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      
      {/* Chat Widget - only show when user is logged in and widget is activated */}
      {user && <ChatWidgetWrapper />}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <ChatWidgetProvider>
        <Router>
          <AppContent />
        </Router>
      </ChatWidgetProvider>
    </AuthProvider>
  );
}

export default App;
