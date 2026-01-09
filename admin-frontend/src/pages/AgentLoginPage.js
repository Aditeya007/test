// src/pages/AgentLoginPage.js

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import { validateField } from '../utils';
import Loader from '../components/Loader';

import '../styles/index.css';

function AgentLoginPage() {
  const navigate = useNavigate();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

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
        // Store token in localStorage (use 'jwt' key for consistency)
        localStorage.setItem('jwt', response.token);
        
        // Store agent flag to indicate this is an agent login
        localStorage.setItem('isAgent', 'true');
        
        // Store tenant data for AuthContext
        if (response.tenant) {
          localStorage.setItem('agentTenant', JSON.stringify(response.tenant));
        }

        // Redirect to dashboard
        navigate('/dashboard');
        window.location.reload(); // Force reload to reinitialize context
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
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value);
    if (errors.password) {
      setErrors(prev => ({ ...prev, password: '' }));
    }
  }

  return (
    <div className="auth-container">
      <h2 className="auth-heading">Agent Login</h2>
      <p style={{ textAlign: 'center', marginBottom: '1rem', color: '#666' }}>
        Login with your agent credentials
      </p>
      
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Username
          <input
            type="text"
            className={`auth-input ${errors.username ? 'input-error' : ''}`}
            value={username}
            onChange={handleUsernameChange}
            disabled={loading}
            required
            autoFocus
            autoComplete="username"
            placeholder="Enter your agent username"
          />
          {errors.username && (
            <span className="field-error">{errors.username}</span>
          )}
        </label>

        <label>
          Password
          <input
            type="password"
            className={`auth-input ${errors.password ? 'input-error' : ''}`}
            value={password}
            onChange={handlePasswordChange}
            disabled={loading}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
          />
          {errors.password && (
            <span className="field-error">{errors.password}</span>
          )}
        </label>

        {serverError && <div className="auth-error">{serverError}</div>}
        
        <button 
          className="auth-btn" 
          type="submit" 
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login as Agent'}
        </button>
      </form>

      {loading && <Loader size="small" message="Authenticating..." />}

      <div className="auth-footer">
        <span>Not an agent?</span>
        <button 
          className="auth-link" 
          onClick={() => navigate('/login')}
          disabled={loading}
        >
          Admin/User Login
        </button>
      </div>
    </div>
  );
}

export default AgentLoginPage;
