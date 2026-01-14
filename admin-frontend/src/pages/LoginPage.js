// src/pages/LoginPage.js

import React, { useState, useTransition, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { validateField } from '../utils';
import Loader from '../components/Loader';
import '../styles/auth.css';

function LoginPage({ userMode = false }) {
  const { login, loading, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      startTransition(() => {
        // Redirect agents to /agent, others to /dashboard
        navigate(user.role === 'agent' ? '/agent' : '/dashboard', { replace: true });
      });
    }
  }, [loading, isAuthenticated, user, navigate]);

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

    // Attempt login with correct loginType
    const loginType = userMode ? 'user' : 'admin';
    const res = await login(username.trim(), password, loginType);
    
    if (res.success) {
      startTransition(() => {
        navigate('/dashboard');
      });
    } else {
      setServerError(res.message);
      
      // If backend suggests a redirect (wrong login page), redirect after a delay
      if (res.redirectTo) {
        setTimeout(() => {
          startTransition(() => {
            navigate(res.redirectTo);
          });
        }, 2000);
      }
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

  const pageTitle = userMode ? 'User Login' : 'Admin Portal';
  const pageSubtitle = userMode 
    ? 'Login with credentials provided by your administrator'
    : 'Welcome back! Please login to continue';

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
            <div className="logo-icon">🔐</div>
            <h1 className="auth-title-modern">{pageTitle}</h1>
          </div>
          <p className="auth-subtitle-modern">{pageSubtitle}</p>
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
                placeholder="Enter your username"
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
                <span>Login</span>
                <span className="btn-arrow">→</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-footer-modern">
          {!userMode && (
            <>
              <div className="auth-link-group">
                <span className="auth-link-text">Don't have an account?</span>
                <button 
                  className="auth-link-modern" 
                  onClick={() => navigate('/register')}
                  disabled={loading || isPending}
                  type="button"
                >
                  Register
                </button>
              </div>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <div className="auth-link-group">
                <button 
                  className="auth-link-modern secondary" 
                  onClick={() => navigate('/user/login')}
                  disabled={loading || isPending}
                  type="button"
                >
                  👤 User Login
                </button>
                <button 
                  className="auth-link-modern secondary" 
                  onClick={() => navigate('/agent/login')}
                  disabled={loading || isPending}
                  type="button"
                >
                  🤖 Agent Login
                </button>
              </div>
            </>
          )}

          {userMode && (
            <>
              <div className="auth-link-group">
                <span className="auth-link-text">Administrator?</span>
                <button 
                  className="auth-link-modern" 
                  onClick={() => navigate('/login')}
                  disabled={loading || isPending}
                  type="button"
                >
                  Admin Login
                </button>
              </div>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <div className="auth-link-group">
                <button 
                  className="auth-link-modern secondary" 
                  onClick={() => navigate('/agent/login')}
                  disabled={loading || isPending}
                  type="button"
                >
                  🤖 Agent Login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
