// src/components/ProtectedRoute.js

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

/**
 * ProtectedRoute - Guards routes that require authentication
 * Shows loader while checking auth, redirects to appropriate login if not authenticated
 * Supports both role="user" and role="agent"
 */
function ProtectedRoute({ children }) {
  const { user, loading, isAuthenticated } = useAuth();

  // Show loader while authentication status is being determined
  if (loading) {
    return <Loader message="Verifying authentication..." />;
  }

  // Redirect to appropriate login page if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Render protected content if authenticated (user or agent)
  return children;
}

export default ProtectedRoute;
