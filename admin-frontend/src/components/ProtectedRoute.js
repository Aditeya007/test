// src/components/ProtectedRoute.js

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

/**
 * ProtectedRoute - Guards routes that require authentication
 * Shows loader while checking auth, redirects to login if not authenticated
 * Supports both role="user" and role="agent"
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  // Show loader while authentication status is being determined
  if (loading) {
    return <Loader message="Verifying authentication..." />;
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Allow both regular users and agents
  if (user.role !== 'user' && user.role !== 'agent' && user.role !== 'admin') {
    console.warn('Unknown user role:', user.role);
  }

  // Render protected content if authenticated
  return children;
}

export default ProtectedRoute;
