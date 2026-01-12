// src/pages/UserProfilePage.js
import React, { useState, useEffect, useOptimistic, useTransition } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import Loader from '../components/Loader';
import '../styles/index.css';

function UserProfilePage() {
  const { user, token } = useAuth();
  const [isPending, startTransition] = useTransition();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
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
      setOptimisticData(initialData);
    }
  }, [user, setOptimisticData]);

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
    
    // Clear errors when user starts typing
    if (error) setError('');
    if (success) setSuccess('');
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

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const updateData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        username: formData.username.trim(),
      };

      // Only include password if it's provided
      if (formData.password) {
        updateData.password = formData.password;
      }

      const response = await apiRequest('/user/me', {
        method: 'PUT',
        token,
        data: updateData,
      });

      if (response.error) {
        setError(response.error);
      } else {
        setSuccess('Profile updated successfully!');
        // Clear password fields
        setFormData((prev) => ({
          ...prev,
          password: '',
          confirmPassword: '',
        }));
        // Update optimistic data with server response
        if (response.user) {
          setOptimisticData({
            name: response.user.name || formData.name,
            email: response.user.email || formData.email,
            username: response.user.username || formData.username,
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

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  if (!user) {
    return <Loader message="Loading profile..." />;
  }

  return (
    <div className="profile-container">
      <div className="profile-card">
        <h2 className="profile-title">User Profile</h2>
        <p className="profile-subtitle">Update your account information</p>

        {error && <div className="dashboard-alert dashboard-alert--error">{error}</div>}
        {success && (
          <div className="dashboard-alert dashboard-alert--success">
            {success}
          </div>
        )}

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="form-group">
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

          <div className="form-group">
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

          <div className="form-group">
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

          <div className="form-group">
            <label htmlFor="password">New Password (leave blank to keep current)</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter new password"
              disabled={loading || isPending}
            />
          </div>

          {formData.password && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm new password"
                disabled={loading || isPending}
              />
            </div>
          )}

          <div className="form-group">
            <label>Role</label>
            <div className="role-display">
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
          </div>

          <button 
            type="submit" 
            className="profile-submit-btn" 
            disabled={loading || isPending}
          >
            {loading || isPending ? 'Updating...' : 'Update Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default UserProfilePage;
