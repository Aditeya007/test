// src/components/AgentRoute.js

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

/**
 * AgentRoute - Guards routes that require agent authentication
 * Redirects non-agents to the dashboard
 */
function AgentRoute({ children }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return <Loader message="Verifying authentication..." />;
  }

  // Not authenticated at all - redirect to agent login
  if (!isAuthenticated) {
    return <Navigate to="/agent/login" replace />;
  }

  // Authenticated but not an agent - redirect to dashboard
  if (user.role !== 'agent') {
    return <Navigate to="/dashboard" replace />;
  }

  // Agent authenticated - allow access
  return children;
}

export default AgentRoute;
