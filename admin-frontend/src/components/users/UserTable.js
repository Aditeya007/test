// src/components/users/UserTable.js

import React from 'react';

function UserTable({ users, onEdit, onDelete, onViewResources, onSelect, activeTenantId }) {
  if (!users || users.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">👥</div>
        <h3>No Users Yet</h3>
        <p>Get started by creating your first user account.</p>
      </div>
    );
  }

  const formatDate = (value) => {
    if (!value) {
      return '—';
    }
    try {
      const date = new Date(value);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (err) {
      return value;
    }
  };

  return (
    <div className="admin-users-table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Email</th>
            <th>Status</th>
            <th>Bots</th>
            <th>Agents</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const userId = user.id || user._id;
            const isActive = userId === activeTenantId;
            return (
              <tr key={userId} className={isActive ? 'active-tenant-row' : ''}>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25em' }}>
                    <strong>{user.name}</strong>
                    <small style={{ color: '#999', fontSize: '0.8rem' }}>{userId}</small>
                  </div>
                </td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ textAlign: 'center', fontSize: '0.9rem' }}>
                  <span title={`Maximum bots allowed: ${user.maxBots || 1}`}>
                    {user.maxBots || 1}
                  </span>
                </td>
                <td style={{ textAlign: 'center', fontSize: '0.9rem' }}>
                  <span title={`Maximum agents allowed: ${user.maxAgents || 0}`}>
                    {user.maxAgents || 0}
                  </span>
                </td>
                <td style={{ fontSize: '0.85rem' }}>{formatDate(user.createdAt)}</td>
                <td>
                  <div className="action-buttons">
                    {!isActive && (
                      <button
                        type="button"
                        className="action-btn action-btn-success"
                        onClick={() => onSelect?.(user)}
                        title="Set as active tenant"
                      >
                        Activate
                      </button>
                    )}
                    {isActive && (
                      <span className="action-btn action-btn-primary" style={{ cursor: 'default', opacity: 0.7 }}>
                        Current
                      </span>
                    )}
                    <button
                      type="button"
                      className="action-btn action-btn-info"
                      onClick={() => onViewResources(user)}
                      title="View resources"
                    >
                      Resources
                    </button>
                    <button
                      type="button"
                      className="action-btn action-btn-secondary"
                      onClick={() => onEdit(user)}
                      title="Edit user"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="action-btn action-btn-danger"
                      onClick={() => onDelete(user)}
                      title="Delete user"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default UserTable;
