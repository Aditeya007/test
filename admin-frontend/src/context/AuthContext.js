// src/context/AuthContext.js

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '../config';

const AuthContext = createContext();

// Helper to decode JWT token
function decodeToken(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

export function AuthProvider({ children }) {
  // Separate state for user and agent
  const [user, setUser] = useState(null);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTenant, setActiveTenantState] = useState(() => {
    const stored = localStorage.getItem('activeTenant');
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.warn('Failed to parse stored tenant:', error);
      localStorage.removeItem('activeTenant');
      return null;
    }
  });

  // On mount: restore either user or agent session
  useEffect(() => {
    async function restoreSession() {
      try {
        // Check for agent token first
        const agentToken = localStorage.getItem('agentToken');
        if (agentToken) {
          const decoded = decodeToken(agentToken);
          
          if (!decoded || decoded.role !== 'agent') {
            // Invalid agent token
            localStorage.removeItem('agentToken');
            localStorage.removeItem('isAgent');
            localStorage.removeItem('agentTenant');
            setLoading(false);
            return;
          }

          // Restore agent session from localStorage
          const storedTenant = localStorage.getItem('agentTenant');
          const storedAgentData = localStorage.getItem('agentData');
          
          try {
            const tenantData = storedTenant ? JSON.parse(storedTenant) : null;
            const agentData = storedAgentData ? JSON.parse(storedAgentData) : null;
            const effectiveUserId = decoded.tenantId;
            
            // Set agent as the authenticated entity
            setAgent({
              id: effectiveUserId,
              _id: effectiveUserId,
              username: decoded.username,
              role: 'agent',
              agentId: decoded.agentId || null,
              tenantId: decoded.tenantId || null,
              name: agentData?.name || tenantData?.name || decoded.username,
              email: agentData?.email || tenantData?.email || '',
              databaseUri: tenantData?.databaseUri || null,
              maxAgents: tenantData?.maxAgents || 0
            });
            
            // Also set as user for backward compatibility with existing components
            setUser({
              id: effectiveUserId,
              _id: effectiveUserId,
              username: decoded.username,
              role: 'agent',
              agentId: decoded.agentId || null,
              tenantId: decoded.tenantId || null,
              name: agentData?.name || tenantData?.name || decoded.username,
              email: agentData?.email || tenantData?.email || '',
              databaseUri: tenantData?.databaseUri || null,
              maxAgents: tenantData?.maxAgents || 0
            });
            
            if (tenantData) {
              setActiveTenantState({
                ...tenantData,
                id: effectiveUserId,
                _id: effectiveUserId
              });
            }
          } catch (parseError) {
            console.error('Failed to parse agent/tenant data:', parseError);
            localStorage.removeItem('agentToken');
            localStorage.removeItem('isAgent');
            localStorage.removeItem('agentTenant');
            localStorage.removeItem('agentData');
          }
          
          setLoading(false);
          return;
        }

        // Check for regular user JWT
        const userToken = localStorage.getItem('jwt');
        if (userToken) {
          const decoded = decodeToken(userToken);
          
          if (!decoded) {
            // Invalid token
            localStorage.removeItem('jwt');
            setLoading(false);
            return;
          }

          // Fetch user profile from backend
          const res = await fetch(`${API_BASE_URL}/user/me`, {
            headers: { Authorization: `Bearer ${userToken}` }
          });
          
          if (res.ok) {
            const data = await res.json();
            setUser(data);
            localStorage.removeItem('isAgent'); // Clean up agent flag
          } else {
            // Token invalid or expired
            localStorage.removeItem('jwt');
          }
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
      } finally {
        setLoading(false);
      }
    }
    
    restoreSession();
  }, []); // Run once on mount

  // Login helper (for admin/user)
  async function login(username, password, loginType = 'admin') {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, loginType }),
      });
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('jwt', data.token);
        setUser(data.user || null);
        setAgent(null); // Clear agent state
        setActiveTenantState(null);
        localStorage.removeItem('activeTenant');
        localStorage.removeItem('agentToken');
        localStorage.removeItem('isAgent');
        localStorage.removeItem('agentTenant');
        return { success: true };
      } else {
        setUser(null);
        return { 
          success: false, 
          message: data.error || data.message || 'Login failed',
          redirectTo: data.redirectTo
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      setLoading(false);
    }
  }

  // Register helper - backend expects: name, email, username, password
  async function register({ name, email, username, password }) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, username, password }),
      });
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('jwt', data.token);
        setUser(data.user || null);
        setAgent(null); // Clear agent state
        setActiveTenantState(null);
        localStorage.removeItem('activeTenant');
        localStorage.removeItem('agentToken');
        localStorage.removeItem('isAgent');
        localStorage.removeItem('agentTenant');
        return { success: true };
      } else {
        setUser(null);
        return { success: false, message: data.error || data.message || 'Registration failed' };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setUser(null);
    setAgent(null);
    localStorage.removeItem('jwt');
    localStorage.removeItem('agentToken');
    localStorage.removeItem('agentData');
    localStorage.removeItem('isAgent');
    localStorage.removeItem('agentTenant');
    setActiveTenantState(null);
    localStorage.removeItem('activeTenant');
  }

  // Check if user is authenticated (either as user or agent)
  const isAuthenticated = !!(user || agent);
  const token = localStorage.getItem('agentToken') || localStorage.getItem('jwt') || '';

  const setActiveTenant = useCallback((tenant) => {
    if (tenant) {
      setActiveTenantState(tenant);
      localStorage.setItem('activeTenant', JSON.stringify(tenant));
    } else {
      setActiveTenantState(null);
      localStorage.removeItem('activeTenant');
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user, // Will be set for both user and agent sessions
        agent, // Will be set only for agent sessions
        token,
        loading,
        isAuthenticated,
        login,
        register,
        logout,
        activeTenant,
        setActiveTenant
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
