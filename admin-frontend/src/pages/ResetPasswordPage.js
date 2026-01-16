// src/pages/ResetPasswordPage.js

import React, { useState, useTransition, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api';
import { validateField } from '../utils';
import Loader from '../components/Loader';
import '../styles/auth.css';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const token = searchParams.get('token');

  // Enable scrolling on auth pages
  useEffect(() => {
    document.body.classList.add('auth-page-active');
    document.getElementById('root')?.classList.add('auth-page-active');
    
    return () => {
      document.body.classList.remove('auth-page-active');
      document.getElementById('root')?.classList.remove('auth-page-active');
    };
  }, []);

  // Check if token is present
  useEffect(() => {
    if (!token) {
      setServerError('Invalid reset link. Please request a new password reset.');
    }
  }, [token]);

  // Validate form before submission
  function validateForm() {
    const newErrors = {};
    
    // Validate password
    const passwordError = validateField('password', password);
    if (passwordError) {
      newErrors.password = passwordError;
    }
    
    // Validate confirm password
    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');
    setSuccess('');
    
    // Client-side validation
    if (!validateForm()) {
      return;
    }

    if (!token) {
      setServerError('Invalid reset link. Please request a new password reset.');
      return;
    }

    setLoading(true);

    try {
      const response = await apiRequest('/auth/reset-password', {
        method: 'POST',
        data: {
          token,
          password
        }
      });

      if (response.error) {
        setServerError(response.error);
      } else {
        setSuccess(response.message || 'Password reset successful! Redirecting to login...');
        // Redirect to login after 2 seconds
        setTimeout(() => {
          startTransition(() => {
            navigate('/login', { replace: true });
          });
        }, 2000);
      }
    } catch (err) {
      setServerError('Failed to reset password. Please try again.');
      console.error('Reset password error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Clear field error on change
  function handlePasswordChange(e) {
    setPassword(e.target.value);
    if (errors.password) {
      setErrors(prev => ({ ...prev, password: '' }));
    }
    if (serverError) setServerError('');
  }

  function handleConfirmPasswordChange(e) {
    setConfirmPassword(e.target.value);
    if (errors.confirmPassword) {
      setErrors(prev => ({ ...prev, confirmPassword: '' }));
    }
    if (serverError) setServerError('');
  }

  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>Invalid Reset Link</h1>
          <p style={{ color: '#ef4444', marginBottom: '1.5em' }}>
            This password reset link is invalid or has expired. Please request a new password reset.
          </p>
          <button
            type="button"
            className="auth-btn"
            onClick={() => navigate('/login')}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Reset Password</h1>
        <p style={{ color: '#94a3b8', marginBottom: '1.5em' }}>
          Enter your new password below.
        </p>

        {serverError && (
          <div className="auth-error" style={{ marginBottom: '1em' }}>
            {serverError}
          </div>
        )}

        {success && (
          <div className="auth-success" style={{ marginBottom: '1em' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="password">New Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="Enter new password"
                required
                disabled={loading || isPending}
                className={errors.password ? 'error' : ''}
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
              <span className="field-error">{errors.password}</span>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <div className="password-input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                placeholder="Confirm new password"
                required
                disabled={loading || isPending}
                className={errors.confirmPassword ? 'error' : ''}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {errors.confirmPassword && (
              <span className="field-error">{errors.confirmPassword}</span>
            )}
          </div>

          <button
            type="submit"
            className="auth-btn"
            disabled={loading || isPending}
          >
            {loading || isPending ? '⏳ Resetting...' : 'Reset Password'}
          </button>
        </form>

        <div className="auth-footer">
          <button
            type="button"
            className="auth-link"
            onClick={() => navigate('/login')}
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
