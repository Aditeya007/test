// src/components/layout/AdminLayout.js
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  setActiveMenuItem,
  toggleSidebar,
  setSidebarOpen,
} from "../../store/slices/uiSlice";
import "./AdminLayout.css";

function AdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const dispatch = useAppDispatch();
  const { activeMenuItem, sidebarOpen } = useAppSelector((state) => state.ui);

  // Close sidebar on mobile when route changes (but allow manual toggle)
  React.useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      // Only close on route change, not on sidebar state change
      dispatch(setSidebarOpen(false));
    }
  }, [location.pathname, dispatch]);

  // Handle window resize - close sidebar if resizing to mobile
  React.useEffect(() => {
    let lastWidth = window.innerWidth;

    const handleResize = () => {
      const currentWidth = window.innerWidth;
      const isMobile = currentWidth <= 768;
      const wasDesktop = lastWidth > 768;

      // Only close if transitioning from desktop to mobile
      if (isMobile && wasDesktop && sidebarOpen) {
        dispatch(setSidebarOpen(false));
      }

      lastWidth = currentWidth;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [dispatch, sidebarOpen]);

  // Update active menu item based on current route
  React.useEffect(() => {
    const path = location.pathname;
    if (path === "/dashboard" || path === "/") {
      dispatch(setActiveMenuItem("dashboard"));
    } else if (path === "/admin/users") {
      dispatch(setActiveMenuItem("users"));
    } else if (path === "/agents" || path.startsWith("/agents/")) {
      dispatch(setActiveMenuItem("agents"));
    } else if (path.startsWith("/bot/")) {
      dispatch(setActiveMenuItem("dashboard"));
    }
  }, [location.pathname, dispatch]);

  // Prevent body scroll when sidebar is open on mobile
  React.useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile && sidebarOpen) {
      // Prevent body scroll
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    } else {
      // Restore body scroll
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, [sidebarOpen]);

  // Close sidebar when clicking outside on mobile
  const handleOverlayClick = () => {
    if (window.innerWidth <= 768) {
      dispatch(toggleSidebar());
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const menuItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "📊",
      path: "/dashboard",
    },
    {
      id: "users",
      label: "Manage Users",
      icon: "👥",
      path: "/admin/users",
      adminOnly: true,
    },
    {
      id: "agents",
      label: "Agents",
      icon: "👤",
      path: "/agents",
      userOnly: true, // Only show for regular users, not admins
    },
  ];

  const isAdmin = user?.role === "admin";

  // Get panel title based on user role
  const getPanelTitle = () => {
    if (user?.role === "admin") {
      return "Admin Panel";
    } else if (user?.role === "agent") {
      return "Agent Panel";
    } else {
      return "User Panel";
    }
  };

  const handleMenuClick = (item) => {
    dispatch(setActiveMenuItem(item.id));
    navigate(item.path);
    // Close sidebar on mobile after navigation
    if (window.innerWidth <= 768) {
      dispatch(toggleSidebar());
    }
  };

  return (
    <div className="admin-layout">
      {/* Mobile Overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-logo">{getPanelTitle()}</h2>
        </div>

        <nav className="sidebar-nav">
          {menuItems
            .filter((item) => {
              if (item.adminOnly && !isAdmin) return false;
              if (item.userOnly && isAdmin) return false;
              return true;
            })
            .map((item) => (
              <button
                key={item.id}
                className={`nav-item ${
                  activeMenuItem === item.id ? "active" : ""
                }`}
                onClick={() => handleMenuClick(item)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item logout-btn" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="admin-main">
        {/* Top Header */}
        <header className="admin-header">
          <div className="header-left">
            <button
              className="sidebar-toggle"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dispatch(toggleSidebar());
              }}
              type="button"
              aria-label="Toggle sidebar menu"
            >
              {sidebarOpen ? "✕" : "☰"}
            </button>
          </div>
          <div className="header-right">
            <div className="user-info">
              <span className="user-name">
                {user?.name || user?.agentUsername || user?.username || "User"}
              </span>
              {user?.role && (
                <span
                  className={`user-badge ${
                    user.role === "admin"
                      ? "badge-admin"
                      : user.role === "agent"
                      ? "badge-agent"
                      : "badge-user"
                  }`}
                >
                  {user.role === "admin"
                    ? "Admin"
                    : user.role === "agent"
                    ? "Agent"
                    : "User"}
                </span>
              )}
              <button
                className="profile-icon-btn"
                onClick={() => navigate("/profile")}
                title="View Profile"
                aria-label="View Profile"
              >
                <span className="profile-icon">👤</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}

export default AdminLayout;
