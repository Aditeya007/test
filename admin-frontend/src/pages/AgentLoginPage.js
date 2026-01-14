// src/pages/AgentLoginPage.js

import React, { useState, useTransition, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import { validateField } from '../utils';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import '../styles/auth.css';

function AgentLoginPage() {
  const navigate = useNavigate();
  const { loading: authLoading, user, isAuthenticated } = useAuth();
  const [isPending, startTransition] = useTransition();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      startTransition(() => {
        // Redirect agents to /agent, others to /dashboard
        navigate(user.role === 'agent' ? '/agent' : '/dashboard', { replace: true });
      });
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  // Enable scrolling on auth pages
  useEffect(() => {
    document.body.classList.add('auth-page-active');
    document.getElementById('root')?.classList.add('auth-page-active');
    
    return () => {
      document.body.classList.remove('auth-page-active');
      document.getElementById('root')?.classList.remove('auth-page-active');
    };
  }, []);

  // Validate form before submission
  function validateForm() {
    const newErrors = {};
    
    // Validate username (required, 3-20 chars)
    if (!username.trim()) {
      newErrors.username = 'Username is required';
    } else if (username.length < 3 || username.length > 20) {
      newErrors.username = 'Username must be 3-20 characters';
    }
    
    // Validate password
    const passwordError = validateField('password', password);
    if (passwordError) {
      newErrors.password = passwordError;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');
    
    // Client-side validation
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Call agent login endpoint
      const response = await apiRequest('/agent/login', {
        method: 'POST',
        data: {
          username: username.trim(),
          password
        }
      });

      if (response.token) {
        // Store agent JWT under the agent-specific key (do NOT use "token")
        localStorage.setItem("agentToken", response.token);

        // Mark this session as an agent session
        localStorage.setItem("isAgent", "true");

        // Store agent profile data for AgentPanel
        if (response.agent) {
          localStorage.setItem("agentData", JSON.stringify(response.agent));
        } else {
          localStorage.removeItem("agentData");
        }
        
        // Store tenant data for AuthContext
        if (response.tenant) {
          localStorage.setItem('agentTenant', JSON.stringify(response.tenant));
        }

        // Force a page reload to trigger AuthContext session restoration
        // This ensures the AuthContext properly recognizes the agent session
        window.location.href = '/agent';
      }
    } catch (error) {
      setServerError(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  // Clear field error on change
  function handleUsernameChange(e) {
    setUsername(e.target.value);
    if (errors.username) {
      setErrors(prev => ({ ...prev, username: '' }));
    }
    if (serverError) setServerError('');
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value);
    if (errors.password) {
      setErrors(prev => ({ ...prev, password: '' }));
    }
    if (serverError) setServerError('');
  }

  return (
    <div className="auth-page">
      <div className="auth-page-background">
        <div className="auth-background-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
        </div>
      </div>

      <div className="auth-container-modern">
        <div className="auth-header-modern">
          <div className="auth-logo">
            <div className="logo-icon">🤖</div>
            <h1 className="auth-title-modern">Agent Login</h1>
          </div>
          <p className="auth-subtitle-modern">Login with your agent credentials</p>
        </div>
        
        <form className="auth-form-modern" onSubmit={handleSubmit}>
          <div className="form-group-modern">
            <label className="form-label-modern">
              <span className="label-icon">👤</span>
              Username
            </label>
            <div className="input-wrapper-modern">
              <input
                type="text"
                className={`form-input-modern ${errors.username ? 'input-error' : ''}`}
                value={username}
                onChange={handleUsernameChange}
                disabled={loading || isPending}
                required
                autoFocus
                autoComplete="username"
                placeholder="Enter your agent username"
              />
            </div>
            {errors.username && (
              <span className="field-error-modern">{errors.username}</span>
            )}
          </div>

          <div className="form-group-modern">
            <label className="form-label-modern">
              <span className="label-icon">🔒</span>
              Password
            </label>
            <div className="input-wrapper-modern password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                className={`form-input-modern ${errors.password ? 'input-error' : ''}`}
                value={password}
                onChange={handlePasswordChange}
                disabled={loading || isPending}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {errors.password && (
              <span className="field-error-modern">{errors.password}</span>
            )}
          </div>

          {serverError && (
            <div className="auth-error-modern">
              <span className="error-icon">⚠️</span>
              {serverError}
            </div>
          )}
          
          <button 
            className="auth-btn-modern" 
            type="submit" 
            disabled={loading || isPending}
          >
            {loading || isPending ? (
              <>
                <span className="btn-loader"></span>
                <span>Logging in...</span>
              </>
            ) : (
              <>
                <span>Login as Agent</span>
                <span className="btn-arrow">→</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-footer-modern">
          <div className="auth-link-group">
            <span className="auth-link-text">Not an agent?</span>
            <button 
              className="auth-link-modern" 
              onClick={() => navigate('/login')}
              disabled={loading || isPending}
              type="button"
            >
              Admin/User Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentLoginPage;
