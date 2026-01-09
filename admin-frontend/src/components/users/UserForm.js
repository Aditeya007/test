// src/components/users/UserForm.js

import React, { useEffect, useMemo, useState } from 'react';

const defaultValues = {
  name: '',
  email: '',
  username: '',
  password: '',
  maxBots: 1,
  maxAgents: 0
};

function UserForm({
  mode = 'create',
  initialValues,
  loading = false,
  onSubmit,
  onCancel,
  resetKey = 0
}) {
  const [values, setValues] = useState(defaultValues);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEditMode = mode === 'edit';

  const mergedInitialValues = useMemo(
    () => ({
      ...defaultValues,
      ...(initialValues || {}),
      password: ''
    }),
    [initialValues, resetKey]
  );

  useEffect(() => {
    setValues({ ...mergedInitialValues });
    setFieldErrors({});
  }, [mergedInitialValues, resetKey]);

  const updateValue = (field, value) => {
    setValues((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    updateValue(name, type === 'checkbox' ? checked : value);
  };

  const validate = () => {
    const errors = {};

    if (!values.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!values.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      errors.email = 'Enter a valid email address';
    }

    if (!values.username.trim()) {
      errors.username = 'Username is required';
    } else if (values.username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(values.username.trim())) {
      errors.username = 'Username can only include letters, numbers, and underscores';
    }

    if (!isEditMode && !values.password.trim()) {
      errors.password = 'Password is required';
    } else if (values.password && values.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (!isEditMode) {
      const maxBots = parseInt(values.maxBots, 10);
      if (isNaN(maxBots) || maxBots < 1) {
        errors.maxBots = 'Max bots must be a positive integer';
      }
      
      const maxAgents = parseInt(values.maxAgents, 10);
      if (isNaN(maxAgents) || maxAgents < 0) {
        errors.maxAgents = 'Max agents must be 0 or greater';
      }
    }

    return errors;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const errors = validate();

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    onSubmit?.(values);
  };

  return (
    <form className="admin-user-form" onSubmit={handleSubmit}>
      <h3>
        {isEditMode ? '✏️ Edit User' : '➕ Create New User'}
      </h3>

      <div style={{ marginBottom: '1.2em' }}>
        <label htmlFor="user-name">Name</label>
        <input
          id="user-name"
          name="name"
          type="text"
          placeholder="Enter full name"
          value={values.name}
          onChange={handleChange}
          disabled={loading}
          className={fieldErrors.name ? 'input-error' : ''}
        />
        {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
      </div>

      <div style={{ marginBottom: '1.2em' }}>
        <label htmlFor="user-email">Email</label>
        <input
          id="user-email"
          name="email"
          type="email"
          placeholder="user@example.com"
          value={values.email}
          onChange={handleChange}
          disabled={loading}
          className={fieldErrors.email ? 'input-error' : ''}
        />
        {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
      </div>

      <div style={{ marginBottom: '1.2em' }}>
        <label htmlFor="user-username">Username</label>
        <input
          id="user-username"
          name="username"
          type="text"
          placeholder="username123"
          value={values.username}
          onChange={handleChange}
          disabled={loading}
          className={fieldErrors.username ? 'input-error' : ''}
        />
        {fieldErrors.username && <span className="field-error">{fieldErrors.username}</span>}
      </div>

      <div style={{ marginBottom: '1.5em' }}>
        <label htmlFor="user-password">Password</label>
        <input
          id="user-password"
          name="password"
          type="password"
          placeholder={isEditMode ? 'Leave blank to keep current password' : 'Minimum 6 characters'}
          value={values.password}
          onChange={handleChange}
          disabled={loading}
          className={fieldErrors.password ? 'input-error' : ''}
        />
        {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
      </div>

      {!isEditMode && (
        <>
          <div style={{ marginBottom: '1.2em' }}>
            <label htmlFor="max-bots">
              Max Bots Allowed
            </label>
            <input
              id="max-bots"
              name="maxBots"
              type="number"
              min="1"
              max="10"
              placeholder="1"
              value={values.maxBots}
              onChange={handleChange}
              disabled={loading}
              className={fieldErrors.maxBots ? 'input-error' : ''}
              style={{ width: '100%' }}
            />
            {fieldErrors.maxBots && <span className="field-error">{fieldErrors.maxBots}</span>}
            <small style={{ display: 'block', marginTop: '0.3em', color: '#666' }}>
              Set the maximum number of bots this user can create (1-10).
            </small>
          </div>

          <div style={{ marginBottom: '1.2em' }}>
            <label htmlFor="max-agents">
              Max Agents Allowed
            </label>
            <input
              id="max-agents"
              name="maxAgents"
              type="number"
              min="0"
              max="50"
              placeholder="0"
              value={values.maxAgents}
              onChange={handleChange}
              disabled={loading}
              className={fieldErrors.maxAgents ? 'input-error' : ''}
              style={{ width: '100%' }}
            />
            {fieldErrors.maxAgents && <span className="field-error">{fieldErrors.maxAgents}</span>}
            <small style={{ display: 'block', marginTop: '0.3em', color: '#666' }}>
              Set the maximum number of human agents this tenant can create (0-50).
            </small>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: '0.8em', marginTop: '2em' }}>
        {isEditMode && (
          <button
            type="button"
            className="btn-ghost"
            onClick={onCancel}
            disabled={loading}
            style={{ flex: 1 }}
          >
            Cancel
          </button>
        )}
        <button 
          type="submit" 
          className="auth-btn" 
          disabled={loading}
          style={{ flex: 1 }}
        >
          {loading ? '⏳ Saving...' : isEditMode ? '💾 Save Changes' : '✨ Create User'}
        </button>
      </div>
    </form>
  );
}

export default UserForm;
