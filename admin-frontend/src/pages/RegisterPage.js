// src/pages/RegisterPage.js

import React, { useState, useTransition, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { validateField, getPasswordStrength } from '../utils';
import Loader from '../components/Loader';
import '../styles/auth.css';

function RegisterPage() {
  const { register, loading, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [showPasswordStrength, setShowPasswordStrength] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      startTransition(() => {
        navigate(user.role === 'agent' ? '/agent' : '/dashboard', { replace: true });
      });
    }
  }, [loading, isAuthenticated, user, navigate]);

  // Validate entire form
  function validateForm() {
    const newErrors = {};
    
    // Validate each field
    ['name', 'email', 'username', 'password'].forEach(field => {
      const error = validateField(field, formData[field]);
      if (error) newErrors[field] = error;
    });
    
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

    // Attempt registration
    const res = await register({
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      username: formData.username.trim(),
      password: formData.password,
    });

    if (res.success) {
      startTransition(() => {
        navigate('/dashboard');
      });
    } else {
      setServerError(res.message);
    }
  }

  // Handle input changes
  function handleChange(field) {
    return (e) => {
      setFormData(prev => ({ ...prev, [field]: e.target.value }));
      // Clear field error on change
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: '' }));
      }
      if (serverError) setServerError('');
    };
  }

  const passwordStrength = getPasswordStrength(formData.password);
  const strengthColor = passwordStrength === 'Strong' ? '#4ade80' : passwordStrength === 'Medium' ? '#fbbf24' : '#fb923c';

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
            <div className="logo-icon">✨</div>
            <h1 className="auth-title-modern">Create Account</h1>
          </div>
          <p className="auth-subtitle-modern">Join us and start managing your chatbots</p>
        </div>
        
        <form className="auth-form-modern" onSubmit={handleSubmit}>
          <div className="form-group-modern">
            <label className="form-label-modern">
              <span className="label-icon">👤</span>
              Full Name
            </label>
            <div className="input-wrapper-modern">
              <input
                type="text"
                className={`form-input-modern ${errors.name ? 'input-error' : ''}`}
                value={formData.name}
                onChange={handleChange('name')}
                disabled={loading || isPending}
                required
                autoFocus
                autoComplete="name"
                placeholder="Enter your full name"
              />
            </div>
            {errors.name && (
              <span className="field-error-modern">{errors.name}</span>
            )}
          </div>

          <div className="form-group-modern">
            <label className="form-label-modern">
              <span className="label-icon">📧</span>
              Email
            </label>
            <div className="input-wrapper-modern">
              <input
                type="email"
                className={`form-input-modern ${errors.email ? 'input-error' : ''}`}
                value={formData.email}
                onChange={handleChange('email')}
                disabled={loading || isPending}
                required
                autoComplete="email"
                placeholder="your.email@example.com"
              />
            </div>
            {errors.email && (
              <span className="field-error-modern">{errors.email}</span>
            )}
          </div>

          <div className="form-group-modern">
            <label className="form-label-modern">
              <span className="label-icon">🏷️</span>
              Username
            </label>
            <div className="input-wrapper-modern">
              <input
                type="text"
                className={`form-input-modern ${errors.username ? 'input-error' : ''}`}
                value={formData.username}
                onChange={handleChange('username')}
                disabled={loading || isPending}
                required
                autoComplete="username"
                placeholder="Choose a username (3-20 chars)"
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
                value={formData.password}
                onChange={handleChange('password')}
                onFocus={() => setShowPasswordStrength(true)}
                onBlur={() => setShowPasswordStrength(false)}
                disabled={loading || isPending}
                required
                autoComplete="new-password"
                placeholder="Create a strong password"
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
            {showPasswordStrength && formData.password && !errors.password && (
              <div className="password-strength-modern">
                <div className="strength-bar">
                  <div 
                    className="strength-fill" 
                    style={{ 
                      width: passwordStrength === 'Strong' ? '100%' : passwordStrength === 'Medium' ? '66%' : '33%',
                      backgroundColor: strengthColor
                    }}
                  ></div>
                </div>
                <span className={`strength-text ${passwordStrength === 'Strong' ? 'strong' : passwordStrength === 'Medium' ? 'medium' : 'weak'}`}>
                  {passwordStrength}
                </span>
              </div>
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
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>Create Account</span>
                <span className="btn-arrow">→</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-footer-modern">
          <div className="auth-link-group">
            <span className="auth-link-text">Already have an account?</span>
            <button 
              className="auth-link-modern" 
              onClick={() => navigate('/login')}
              disabled={loading || isPending}
              type="button"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
