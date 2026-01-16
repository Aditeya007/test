// src/pages/UserProfilePage.js
import React, { useState, useEffect, useOptimistic, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import Loader from '../components/Loader';
import '../styles/index.css';

function UserProfilePage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();
  
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({
    password: '',
    confirmPassword: ''
  });
  // Commented out: Forgot password email functionality - users can update password directly from profile
  // const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  // const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });

  // React 19: useOptimistic for optimistic UI updates
  const [optimisticData, setOptimisticData] = useOptimistic(
    {
      name: user?.name || '',
      email: user?.email || '',
      username: user?.username || '',
    },
    (current, newData) => ({ ...current, ...newData })
  );

  useEffect(() => {
    if (user) {
      const initialData = {
        name: user.name || '',
        email: user.email || '',
        username: user.username || '',
        password: '',
        confirmPassword: '',
      };
      setFormData(initialData);
      startTransition(() => {
        setOptimisticData(initialData);
      });
    }
  }, [user, setOptimisticData, startTransition]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    
    // Optimistic update for immediate feedback
    if (name !== 'password' && name !== 'confirmPassword') {
      startTransition(() => {
        setOptimisticData({ [name]: value });
      });
    }
    
    // Real-time password validation
    if (name === 'password' || name === 'confirmPassword') {
      validatePasswordFields(name === 'password' ? value : formData.password, name === 'confirmPassword' ? value : formData.confirmPassword);
    }
    
    // Clear errors when user starts typing
    if (error) setError('');
    if (success) setSuccess('');
  };

  const validatePasswordFields = (password, confirmPassword) => {
    const errors = {
      password: '',
      confirmPassword: ''
    };

    // Validate password
    if (password) {
      if (password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
      }
    }

    // Validate confirm password
    if (confirmPassword) {
      if (password && password !== confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      } else if (!password && confirmPassword) {
        errors.confirmPassword = 'Please enter password first';
      }
    }

    setPasswordErrors(errors);
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return false;
    }
    if (!formData.email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!formData.username.trim()) {
      setError('Username is required');
      return false;
    }
    if (formData.password && formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (formData.password && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate only profile fields (not password)
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.email.trim()) {
      setError('Email is required');
      return;
    }
    if (!formData.username.trim()) {
      setError('Username is required');
      return;
    }

    setLoading(true);

    try {
      const updateData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        username: formData.username.trim(),
      };

      const response = await apiRequest('/user/me', {
        method: 'PUT',
        token,
        data: updateData,
      });

      if (response.error) {
        setError(response.error);
      } else {
        setSuccess('Profile updated successfully!');
        // Update optimistic data with server response
        if (response.user) {
          startTransition(() => {
            setOptimisticData({
              name: response.user.name || formData.name,
              email: response.user.email || formData.email,
              username: response.user.username || formData.username,
            });
          });
        }
      }
    } catch (err) {
      setError('Failed to update profile. Please try again.');
      console.error('Profile update error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPasswordSuccess('');

    // Validate password fields
    validatePasswordFields(formData.password, formData.confirmPassword);

    if (!formData.password) {
      setError('Password is required');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setPasswordErrors(prev => ({ ...prev, password: 'Password must be at least 6 characters' }));
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setPasswordErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      return;
    }

    // Clear any validation errors if validation passes
    if (passwordErrors.password || passwordErrors.confirmPassword) {
      setPasswordErrors({ password: '', confirmPassword: '' });
    }

    setPasswordLoading(true);

    try {
      const updateData = {
        password: formData.password,
      };

      const response = await apiRequest('/user/me', {
        method: 'PUT',
        token,
        data: updateData,
      });

      if (response.error) {
        setError(response.error);
      } else {
        setPasswordSuccess('Password changed successfully!');
        // Clear password fields
        setFormData((prev) => ({
          ...prev,
          password: '',
          confirmPassword: '',
        }));
      }
    } catch (err) {
      setError('Failed to change password. Please try again.');
      console.error('Password change error:', err);
    } finally {
      setPasswordLoading(false);
    }
  };

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Clear password success message after 3 seconds
  useEffect(() => {
    if (passwordSuccess) {
      const timer = setTimeout(() => {
        setPasswordSuccess('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [passwordSuccess]);

  // Commented out: Forgot password email functionality - users can update password directly from profile
  // const handleForgotPassword = async () => {
  //   if (!user?.email && !user?.username) {
  //     setError('Email or username is required for password reset');
  //     return;
  //   }

  //   setForgotPasswordLoading(true);
  //   setError('');
  //   setForgotPasswordSuccess('');

  //   try {
  //     const response = await apiRequest('/auth/forgot-password', {
  //       method: 'POST',
  //       data: {
  //         email: user?.email,
  //         username: user?.username
  //       },
  //     });

  //     if (response.error) {
  //       setError(response.error);
  //     } else {
  //       setForgotPasswordSuccess('Password reset link has been sent to your email address. Please check your inbox.');
  //       // Clear success message after 5 seconds
  //       setTimeout(() => {
  //         setForgotPasswordSuccess('');
  //       }, 5000);
  //     }
  //   } catch (err) {
  //     setError('Failed to send password reset email. Please try again.');
  //     console.error('Forgot password error:', err);
  //   } finally {
  //     setForgotPasswordLoading(false);
  //   }
  // };

  const handleClose = () => {
    // Navigate back based on user role
    if (user?.role === 'admin') {
      navigate('/dashboard');
    } else if (user?.role === 'agent') {
      navigate('/agent');
    } else {
      navigate('/dashboard');
    }
  };

  if (!user) {
    return <Loader message="Loading profile..." />;
  }

  return (
    <div className="admin-users-container">
      <header className="admin-users-header">
        <div className="admin-users-header-content">
          <div className="admin-users-header-title">
            <h2>User Profile</h2>
          </div>
          <div className="admin-users-header-controls">
            <div className="admin-users-header-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && <div className="admin-users-error">{error}</div>}
      {success && (
        <div className="admin-users-success">{success}</div>
      )}
      {passwordSuccess && (
        <div className="admin-users-success">{passwordSuccess}</div>
      )}
      {/* Commented out: Forgot password success message */}
      {/* {forgotPasswordSuccess && (
        <div className="admin-users-success">{forgotPasswordSuccess}</div>
      )} */}

      <form className="admin-user-form" onSubmit={handleSubmit}>
        {/* Profile Information Section */}
        <div style={{ 
          marginBottom: "1.5em",
          paddingBottom: "1.5em",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)"
        }}>
          <h3 style={{ 
            marginBottom: "1em", 
            color: "#fff", 
            fontSize: "1.1em",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "0.5em"
          }}>
            <span style={{ color: "#f97316" }}>|</span>
            Profile Information
          </h3>
          
          <div className="user-form-row">
            <div>
              <label htmlFor="name">Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your name"
                required
                disabled={loading || isPending}
              />
            </div>

            <div>
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter your email"
                required
                disabled={loading || isPending}
              />
            </div>

            <div>
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter your username"
                required
                disabled={loading || isPending}
              />
            </div>

            <div>
              <label>Role</label>
              <div style={{ 
                padding: "0.7em 1em", 
                background: "rgba(15, 23, 42, 0.6)", 
                border: "2px solid rgba(255, 255, 255, 0.1)", 
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                minHeight: "42px"
              }}>
                <span
                  className={`user-badge ${
                    user?.role === 'admin'
                      ? 'badge-admin'
                      : user?.role === 'agent'
                      ? 'badge-agent'
                      : 'badge-user'
                  }`}
                >
                  {user?.role === 'admin' ? 'Admin' : user?.role === 'agent' ? 'Agent' : 'User'}
                </span>
              </div>
              <small style={{ display: "block", marginTop: "0.25em", color: "#94a3b8", fontSize: "0.8rem" }}>
                Your role cannot be changed
              </small>
            </div>
          </div>

          <div className="user-form-actions" style={{ marginTop: "1em" }}>
            <button
              type="submit"
              className="auth-btn"
              disabled={loading || isPending}
              style={{ width: "auto", minWidth: "150px", padding: "0.75em 1.5em", fontSize: "0.95em" }}
            >
              {loading || isPending ? "⏳ Updating..." : "💾 Update Profile"}
            </button>
          </div>
        </div>

        {/* Change Password Section */}
        <div style={{ 
          marginTop: "1.5em",
          paddingTop: "1.5em",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)"
        }}>
          <h3 style={{ 
            marginBottom: "1em", 
            color: "#fff", 
            fontSize: "1.1em",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "0.5em"
          }}>
            <span style={{ color: "#f97316" }}>|</span>
            Change Password
          </h3>

          <form className="admin-user-form" onSubmit={handlePasswordSubmit}>
            <div className="user-form-row">
              <div>
                <label htmlFor="password">New Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter new password"
                    disabled={passwordLoading || loading || isPending}
                    required={formData.password || formData.confirmPassword ? true : false}
                    className={passwordErrors.password ? 'input-error' : ''}
                    style={{ 
                      paddingRight: "45px",
                      width: "100%",
                      borderColor: passwordErrors.password ? '#ef4444' : undefined
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px 8px",
                      color: "#94a3b8",
                      fontSize: "1.2em",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "color 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.color = "#94a3b8";
                    }}
                    tabIndex={-1}
                    disabled={passwordLoading || loading || isPending}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {passwordErrors.password ? (
                  <small style={{ display: "block", marginTop: "0.25em", color: "#ef4444", fontSize: "0.8rem" }}>
                    {passwordErrors.password}
                  </small>
                ) : (
                  <small style={{ display: "block", marginTop: "0.25em", color: "#94a3b8", fontSize: "0.8rem" }}>
                    Enter a new password to change your current password
                  </small>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm new password"
                    disabled={passwordLoading || loading || isPending}
                    required={formData.password ? true : false}
                    className={passwordErrors.confirmPassword ? 'input-error' : ''}
                    style={{ 
                      paddingRight: "45px",
                      width: "100%",
                      borderColor: passwordErrors.confirmPassword ? '#ef4444' : undefined
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px 8px",
                      color: "#94a3b8",
                      fontSize: "1.2em",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "color 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.color = "#94a3b8";
                    }}
                    tabIndex={-1}
                    disabled={passwordLoading || loading || isPending}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {passwordErrors.confirmPassword && (
                  <small style={{ display: "block", marginTop: "0.25em", color: "#ef4444", fontSize: "0.8rem" }}>
                    {passwordErrors.confirmPassword}
                  </small>
                )}
                {!passwordErrors.confirmPassword && formData.password && formData.confirmPassword && formData.password === formData.confirmPassword && (
                  <small style={{ display: "block", marginTop: "0.25em", color: "#22c55e", fontSize: "0.8rem" }}>
                    ✓ Passwords match
                  </small>
                )}
              </div>
            </div>

            <div className="user-form-actions" style={{ marginTop: "1em" }}>
              <button
                type="submit"
                className="auth-btn"
                disabled={passwordLoading || loading || isPending || !formData.password || !formData.confirmPassword}
                style={{ width: "auto", minWidth: "150px", padding: "0.75em 1.5em", fontSize: "0.95em" }}
              >
                {passwordLoading || isPending ? "⏳ Changing..." : "🔒 Change Password"}
              </button>
            </div>
          </form>

          {/* Commented out: Forgot password email functionality - users can update password directly from profile */}
          {/* <div>
            <label>Forgot Password?</label>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={forgotPasswordLoading || loading || isPending}
              style={{
                width: "100%",
                padding: "0.85em 1.2em",
                background: "rgba(59, 130, 246, 0.1)",
                border: "2px solid rgba(59, 130, 246, 0.3)",
                borderRadius: "12px",
                color: "#60a5fa",
                cursor: forgotPasswordLoading || loading || isPending ? "not-allowed" : "pointer",
                fontSize: "0.95em",
                fontWeight: "500",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                if (!forgotPasswordLoading && !loading && !isPending) {
                  e.target.style.background = "rgba(59, 130, 246, 0.2)";
                  e.target.style.borderColor = "rgba(59, 130, 246, 0.5)";
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(59, 130, 246, 0.1)";
                e.target.style.borderColor = "rgba(59, 130, 246, 0.3)";
              }}
            >
              {forgotPasswordLoading ? "⏳ Sending..." : "📧 Send Password Reset Email"}
            </button>
            <small style={{ display: "block", marginTop: "0.3em", color: "#94a3b8" }}>
              We'll send a password reset link to your email: {user?.email}
            </small>
          </div> */}
        </div>
      </form>
    </div>
  );
}

export default UserProfilePage;
