// src/pages/WebsitesPage.js

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useDeferredValue,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useChatWidget } from "../context/ChatWidgetContext";
import {
  apiRequest,
  getUserOwnBots,
  createBot,
  startBotScheduler,
  stopBotScheduler,
} from "../api";
import Loader from "../components/Loader";
import WidgetInstaller from "../components/WidgetInstaller";
import Pagination from "../components/Pagination";
import "../styles/index.css";

function WebsitesPage() {
  const { user, token } = useAuth();
  const { selectedBotId, switchBot } = useChatWidget();
  const navigate = useNavigate();

  // Website Actions panel state
  const [showWebsiteActionsPanel, setShowWebsiteActionsPanel] = useState(false);

  // Bots/Websites state
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [maxWebsites, setMaxWebsites] = useState(0);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // React 19: useDeferredValue for performance optimization
  const deferredWebsites = useDeferredValue(websites);

  // Derive selectedWebsite from context
  const selectedWebsite = useMemo(() => {
    return (
      deferredWebsites.find((w) => (w._id || w.id) === selectedBotId) || null
    );
  }, [deferredWebsites, selectedBotId]);

  // Add website modal state
  const [addWebsiteModalOpen, setAddWebsiteModalOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [addWebsiteLoading, setAddWebsiteLoading] = useState(false);
  const [addWebsiteError, setAddWebsiteError] = useState("");

  // Scrape state
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [scrapeSuccess, setScrapeSuccess] = useState("");
  const [scrapeHistory, setScrapeHistory] = useState([]);
  const [scrapeHistoryLoading, setScrapeHistoryLoading] = useState(false);
  const [pollingIntervalId, setPollingIntervalId] = useState(null);

  // Scheduler state
  const [schedulerStatus, setSchedulerStatus] = useState("inactive");
  const [schedulerConfig, setSchedulerConfig] = useState(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerError, setSchedulerError] = useState("");

  // Widget installer
  const [isWidgetInstallerOpen, setWidgetInstallerOpen] = useState(false);

  // Add knowledge modal state
  const [addKnowledgeModalOpen, setAddKnowledgeModalOpen] = useState(false);
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [addKnowledgeLoading, setAddKnowledgeLoading] = useState(false);
  const [addKnowledgeError, setAddKnowledgeError] = useState("");
  const [addKnowledgeSuccess, setAddKnowledgeSuccess] = useState("");

  // Lead Delivery Email state
  const [leadDeliveryEmail, setLeadDeliveryEmail] = useState("");
  const [leadEmailError, setLeadEmailError] = useState("");
  const [leadEmailSuccess, setLeadEmailSuccess] = useState("");
  const [leadEmailSaving, setLeadEmailSaving] = useState(false);

  // Handle Add Knowledge
  async function handleAddKnowledge() {
    if (!selectedWebsite || !token) return;

    const trimmedContent = knowledgeContent.trim();

    if (!trimmedContent) {
      setAddKnowledgeError("Please enter some content");
      return;
    }

    setAddKnowledgeLoading(true);
    setAddKnowledgeError("");
    setAddKnowledgeSuccess("");

    const botId = selectedWebsite._id || selectedWebsite.id;

    try {
      await apiRequest(`/bot/${botId}/manual-knowledge`, {
        method: "POST",
        token,
        data: { content: trimmedContent },
      });

      setAddKnowledgeSuccess("Knowledge added successfully!");

      // Clear form and close modal after a short delay
      setTimeout(() => {
        setKnowledgeContent("");
        setAddKnowledgeModalOpen(false);
        setAddKnowledgeSuccess("");
      }, 1500);
    } catch (err) {
      setAddKnowledgeError(err.message || "Failed to add knowledge");
    } finally {
      setAddKnowledgeLoading(false);
    }
  }

  // Fetch user details to get maxBots
  useEffect(() => {
    if (!token || !user || user.role !== "user") return;

    async function fetchUserDetails() {
      try {
        const response = await apiRequest("/user/me", {
          method: "GET",
          token,
        });
        setMaxWebsites(response.maxBots || 0);
      } catch (err) {
        console.error("Failed to fetch user details:", err);
        if (user.maxBots !== undefined) {
          setMaxWebsites(user.maxBots);
        }
      }
    }

    if (user.maxBots !== undefined) {
      setMaxWebsites(user.maxBots);
    } else {
      fetchUserDetails();
    }
  }, [token, user]);

  // Fetch websites
  const fetchWebsites = useCallback(
    async (page = currentPage) => {
      if (!token) return;

      setLoading(true);
      setError("");

      try {
        const response = await getUserOwnBots(token, page, itemsPerPage);

        if (response.bots) {
          setWebsites(response.bots);
          setTotalCount(response.totalCount || response.count || 0);
          setTotalPages(response.totalPages || 1);
        }
      } catch (err) {
        setError(err.message || "Failed to load websites");
        console.error("Error fetching websites:", err);
      } finally {
        setLoading(false);
      }
    },
    [token, currentPage, itemsPerPage]
  );

  useEffect(() => {
    fetchWebsites(currentPage);
  }, [currentPage, fetchWebsites]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // Fetch scheduler status for selected website
  const fetchSchedulerStatus = useCallback(async () => {
    if (!selectedWebsite || !token) return;

    const websiteId = selectedWebsite._id || selectedWebsite.id;
    try {
      const response = await apiRequest(`/bot/${websiteId}/scheduler/status`, {
        method: "GET",
        token,
      });

      if (response.success) {
        setSchedulerStatus(response.schedulerStatus || "inactive");
        setSchedulerConfig(response.schedulerConfig);
      }
    } catch (err) {
      console.error("Failed to fetch scheduler status:", err);
    }
  }, [selectedWebsite, token]);

  // Fetch scrape history for selected website
  const fetchScrapeHistory = useCallback(async () => {
    if (!selectedWebsite || !token) {
      setScrapeHistory([]);
      return;
    }

    setScrapeHistoryLoading(true);
    const websiteId = selectedWebsite._id || selectedWebsite.id;

    try {
      const response = await apiRequest(`/bot/${websiteId}/scrape/history`, {
        method: "GET",
        token,
      });

      if (response.history) {
        setScrapeHistory(response.history);
      }
    } catch (err) {
      console.error("Failed to fetch scrape history:", err);
    } finally {
      setScrapeHistoryLoading(false);
    }
  }, [selectedWebsite, token]);

  // Fetch scheduler status and scrape history when website is selected
  useEffect(() => {
    if (selectedWebsite) {
      fetchSchedulerStatus();
      fetchScrapeHistory();
      // Prefill lead delivery email
      setLeadDeliveryEmail(selectedWebsite.lead_delivery_email || "");
      setLeadEmailError("");
      setLeadEmailSuccess("");
    }
  }, [selectedWebsite, fetchSchedulerStatus, fetchScrapeHistory]);

  // Poll for scrape completion
  function startPollingForScrapeCompletion(websiteId) {
    // Clear any existing interval
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
    }

    const intervalId = setInterval(async () => {
      try {
        const response = await apiRequest(`/bot/${websiteId}/scrape/status`, {
          method: "GET",
          token,
        });

        if (response.success && response.status !== "running") {
          // Scrape completed or failed, stop polling
          clearInterval(intervalId);
          setPollingIntervalId(null);
          setScrapeLoading(false);

          // Refetch websites to get updated state
          await fetchWebsites();
          await fetchScrapeHistory();

          if (response.status === "completed") {
            setScrapeSuccess("Website crawl completed successfully!");
            setTimeout(() => setScrapeSuccess(""), 5000);
          }
        }
      } catch (err) {
        console.error("Error polling scrape status:", err);
        clearInterval(intervalId);
        setPollingIntervalId(null);
        setScrapeLoading(false);
      }
    }, 5000); // Poll every 5 seconds

    setPollingIntervalId(intervalId);
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [pollingIntervalId]);

  function handleWebsiteSelect(website) {
    const websiteId = website?._id || website?.id;
    if (websiteId) {
      switchBot(websiteId);
      setShowWebsiteActionsPanel(true);
    }
  }

  async function handleAddWebsite() {
    if (!websiteUrl.trim()) {
      setAddWebsiteError("Please enter a website URL");
      return;
    }

    try {
      new URL(websiteUrl.trim());
    } catch {
      setAddWebsiteError(
        "Please enter a valid URL (e.g., https://example.com)"
      );
      return;
    }

    setAddWebsiteLoading(true);
    setAddWebsiteError("");

    try {
      const response = await createBot(
        { scrapedWebsites: [websiteUrl.trim()] },
        token
      );

      setAddWebsiteModalOpen(false);
      setWebsiteUrl("");

      // Reset to first page to show the newly added website
      setCurrentPage(1);

      if (response.bot) {
        const websiteId = response.bot._id || response.bot.id;
        if (websiteId) {
          switchBot(websiteId);
          setShowWebsiteActionsPanel(true);
        }
      }
    } catch (err) {
      setAddWebsiteError(err.message || "Failed to add website");
    } finally {
      setAddWebsiteLoading(false);
    }
  }

  async function handleRunScrape() {
    if (!selectedWebsite || !token) return;

    setScrapeLoading(true);
    setScrapeError("");
    setScrapeSuccess("");

    const websiteId = selectedWebsite._id || selectedWebsite.id;
    const website = selectedWebsite.scrapedWebsites?.[0];

    if (!website) {
      setScrapeError("No website configured");
      setScrapeLoading(false);
      return;
    }

    try {
      const response = await apiRequest(`/bot/${websiteId}/scrape`, {
        method: "POST",
        token,
        data: { startUrl: website },
      });

      if (response.success) {
        startPollingForScrapeCompletion(websiteId);
      } else {
        throw new Error(response.error || "Failed to start scrape");
      }
    } catch (err) {
      setScrapeError(err.message || "Failed to start scrape");
      setScrapeLoading(false);
    }
  }

  async function handleSchedulerToggle(enable) {
    if (!selectedWebsite || !token || schedulerLoading) return;

    setSchedulerLoading(true);
    setSchedulerError("");

    const websiteId = selectedWebsite._id || selectedWebsite.id;

    try {
      if (enable) {
        await startBotScheduler(websiteId, token);
      } else {
        await stopBotScheduler(websiteId, token);
      }

      await fetchWebsites(currentPage);
      await fetchSchedulerStatus();
    } catch (err) {
      setSchedulerError(err.message || "Failed to toggle scheduler");
      setTimeout(() => setSchedulerError(""), 5000);
    } finally {
      setSchedulerLoading(false);
    }
  }

  // Handle Lead Delivery Email Save
  async function handleSaveLeadEmail() {
    if (!selectedWebsite || !token) return;

    const trimmedEmail = leadDeliveryEmail.trim();

    // Validate email format if not empty
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setLeadEmailError("Please enter a valid email address");
      return;
    }

    setLeadEmailSaving(true);
    setLeadEmailError("");
    setLeadEmailSuccess("");

    const botId = selectedWebsite._id || selectedWebsite.id;

    try {
      const { updateBot } = await import("../api");
      await updateBot(botId, { lead_delivery_email: trimmedEmail || null }, token);

      // Update local state
      setWebsites((prev) =>
        prev.map((w) =>
          (w._id || w.id) === botId
            ? { ...w, lead_delivery_email: trimmedEmail || null }
            : w
        )
      );

      setLeadEmailSuccess("Lead delivery email saved successfully!");
      setTimeout(() => setLeadEmailSuccess(""), 3000);
    } catch (err) {
      setLeadEmailError(err.message || "Failed to save email");
    } finally {
      setLeadEmailSaving(false);
    }
  }

  if (loading) {
    return <Loader message="Loading websites..." />;
  }

  return (
    <div className="admin-users-container">
      <header className="admin-users-header">
        <div className="admin-users-header-content">
          <div className="admin-users-header-title">
            <h2 style={{ marginRight: "10px" }}>Your Websites</h2>
            {/* <p>Manage your chatbot websites and configurations</p> */}
            {maxWebsites > 0 && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#cbd5e1",
                  marginLeft: "10px",
                }}
              >
                <strong
                  style={{
                    color: "#cbd5e1",
                    fontWeight: "600",
                    marginRight: "0.3rem",
                  }}
                >
                  Website Capacity:
                </strong>
                <span style={{ color: "#cbd5e1" }}>
                  {websites.length} / {maxWebsites} websites
                </span>
                {websites.length < maxWebsites && (
                  <span style={{ marginLeft: "0.3rem", color: "#cbd5e1" }}>
                    ({maxWebsites - websites.length} available)
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="admin-users-header-controls">
            {/* Add Website Button */}
            {(() => {
              if (maxWebsites === undefined || maxWebsites === null) {
                return true;
              }
              return maxWebsites > 0 && websites.length < maxWebsites;
            })() && (
              <button
                type="button"
                className="auth-btn auth-btn--success"
                onClick={() => setAddWebsiteModalOpen(true)}
              >
                ➕ Add Website
              </button>
            )}
          </div>
        </div>
      </header>

      {error && <div className="admin-users-error">{error}</div>}

      {/* Websites Table */}
      <div style={{ marginTop: "1.2em" }}>
        {websites.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🌐</div>
            <h3>No Websites Yet</h3>
            <p>
              {maxWebsites === 0
                ? "Website creation is disabled for this account."
                : "You have not added any websites yet. Click 'Add Website' to create your first chatbot website."}
            </p>
          </div>
        ) : (
          <div className="admin-users-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Website URL</th>
                  <th>Status</th>
                  <th>Last Crawl</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deferredWebsites.map((website) => {
                  const websiteId = website._id || website.id;
                  const websiteUrl = website.scrapedWebsites?.[0] || "—";
                  return (
                    <tr key={websiteId}>
                      <td>
                        {websiteUrl !== "—" ? (
                          <a
                            href={websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#60a5fa",
                              textDecoration: "none",
                              wordBreak: "break-all",
                            }}
                          >
                            {websiteUrl}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            website.botReady
                              ? "status-badge--ready"
                              : "status-badge--pending"
                          }`}
                        >
                          {website.botReady ? "✓ Ready" : "⏳ Pending"}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {website.lastScrapeAt
                          ? new Date(website.lastScrapeAt).toLocaleString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )
                          : "Never"}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {website.createdAt
                          ? new Date(website.createdAt).toLocaleString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )
                          : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleWebsiteSelect(website)}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "1.2rem",
                            padding: "0.25rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "transform 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "scale(1.1)";
                            e.currentTarget.style.opacity = "0.8";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "scale(1)";
                            e.currentTarget.style.opacity = "1";
                          }}
                          title="View Details"
                        >
                          📋
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {websites.length > 0 && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
        />
      )}

      {/* Website Actions Panel - Only show when panel is explicitly shown and a website is selected */}
      {showWebsiteActionsPanel && selectedWebsite && (
        <div
          style={{
            padding: "1.5rem",
            background: "#f0f9ff",
            border: "2px solid #3b82f6",
            borderRadius: "8px",
            marginTop: "1.5rem",
            position: "relative",
          }}
        >
          {/* Close Button */}
          <button
            onClick={() => {
              setShowWebsiteActionsPanel(false);
            }}
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              background: "transparent",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: "#64748b",
              lineHeight: 1,
              padding: "0.25rem",
              width: "2rem",
              height: "2rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#e2e8f0";
              e.currentTarget.style.color = "#334155";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#64748b";
            }}
            title="Close actions panel"
          >
            ✕
          </button>

          <h4
            style={{
              margin: "0 2rem 0.5rem 0",
              color: "#0c4a6e",
              fontSize: "1.125rem",
            }}
          >
            Website Actions
          </h4>
          <p
            style={{
              margin: "0 0 1rem 0",
              fontSize: "0.875rem",
              color: "#475569",
            }}
          >
            Manage chatbot for:{" "}
            <strong>
              {selectedWebsite.scrapedWebsites &&
              selectedWebsite.scrapedWebsites[0]
                ? selectedWebsite.scrapedWebsites[0]
                : "this website"}
            </strong>
          </p>

          {/* Crawl Status & Metadata Display */}
          <div
            style={{
              padding: "1rem",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.75rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#334155",
                }}
              >
                Crawl Status
              </span>
              {selectedWebsite.schedulerConfig?.status === "running" && (
                <span
                  style={{
                    padding: "0.25rem 0.75rem",
                    background: "#dbeafe",
                    color: "#1e40af",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    borderRadius: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#3b82f6",
                      animation:
                        "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    }}
                  ></span>
                  Crawl in progress
                </span>
              )}
              {selectedWebsite.schedulerConfig?.status === "completed" && (
                <span
                  style={{
                    padding: "0.25rem 0.75rem",
                    background: "#d1fae5",
                    color: "#065f46",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    borderRadius: "12px",
                  }}
                >
                  ✓ Completed
                </span>
              )}
              {selectedWebsite.schedulerConfig?.status === "failed" && (
                <span
                  style={{
                    padding: "0.25rem 0.75rem",
                    background: "#fee2e2",
                    color: "#991b1b",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    borderRadius: "12px",
                  }}
                >
                  ✗ Failed
                </span>
              )}
              {!selectedWebsite.schedulerConfig?.status && (
                <span
                  style={{
                    padding: "0.25rem 0.75rem",
                    background: "#f3f4f6",
                    color: "#6b7280",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    borderRadius: "12px",
                  }}
                >
                  Not started
                </span>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
                fontSize: "0.8125rem",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#64748b",
                    marginBottom: "0.25rem",
                  }}
                >
                  Last Crawl
                </div>
                <div style={{ color: "#1e293b", fontWeight: "500" }}>
                  {selectedWebsite.lastScrapeAt
                    ? new Date(selectedWebsite.lastScrapeAt).toLocaleString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )
                    : "Never"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: "#64748b",
                    marginBottom: "0.25rem",
                  }}
                >
                  Bot Status
                </div>
                <div style={{ color: "#1e293b", fontWeight: "500" }}>
                  {selectedWebsite.botReady ? (
                    <span style={{ color: "#059669" }}>✓ Ready</span>
                  ) : (
                    <span style={{ color: "#dc2626" }}>Not Ready</span>
                  )}
                </div>
              </div>
            </div>

            {selectedWebsite.schedulerConfig?.totalDocuments !== undefined &&
              selectedWebsite.schedulerConfig.totalDocuments > 0 && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "#64748b",
                    }}
                  >
                    Documents Crawled
                  </div>
                  <div
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: "700",
                      color: "#0ea5e9",
                      marginTop: "0.25rem",
                    }}
                  >
                    {selectedWebsite.schedulerConfig.totalDocuments.toLocaleString()}
                  </div>
                </div>
              )}

            {/* Crawl History */}
            {scrapeHistory.length > 0 && (
              <div
                style={{
                  marginTop: "0.75rem",
                  paddingTop: "0.75rem",
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "#64748b",
                    marginBottom: "0.5rem",
                    fontWeight: "600",
                  }}
                >
                  Crawl History
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    maxHeight: "200px",
                    overflowY: "auto",
                  }}
                >
                  {scrapeHistory.map((entry, index) => (
                    <div
                      key={entry._id || index}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.5rem",
                        background: "#f8fafc",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.125rem",
                        }}
                      >
                        <div
                          style={{
                            color: "#1e293b",
                            fontWeight: "500",
                          }}
                        >
                          {new Date(entry.completedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div
                          style={{
                            color: "#64748b",
                            fontSize: "0.7rem",
                          }}
                        >
                          {entry.trigger === "scheduler"
                            ? "Scheduled"
                            : "Manual"}
                        </div>
                      </div>
                      <div>
                        {entry.success ? (
                          <span style={{ color: "#059669", fontSize: "1rem" }}>
                            ✓
                          </span>
                        ) : (
                          <span style={{ color: "#dc2626", fontSize: "1rem" }}>
                            ✗
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {scrapeHistoryLoading && (
              <div
                style={{
                  marginTop: "0.75rem",
                  paddingTop: "0.75rem",
                  borderTop: "1px solid #e2e8f0",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  Loading history...
                </div>
              </div>
            )}
          </div>

          {/* Lead Delivery Email Section */}
          <div
            style={{
              padding: "1rem",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "#334155",
                marginBottom: "0.75rem",
              }}
            >
              📧 Lead Delivery Email
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#64748b",
                marginBottom: "0.75rem",
              }}
            >
              Receive lead notifications when users provide contact information
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <input
                  type="email"
                  value={leadDeliveryEmail}
                  onChange={(e) => {
                    setLeadDeliveryEmail(e.target.value);
                    setLeadEmailError("");
                  }}
                  placeholder="sales@example.com"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: `1px solid ${leadEmailError ? "#ef4444" : "#cbd5e1"}`,
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => {
                    if (!leadEmailError) {
                      e.target.style.borderColor = "#3b82f6";
                    }
                  }}
                  onBlur={(e) => {
                    if (!leadEmailError) {
                      e.target.style.borderColor = "#cbd5e1";
                    }
                  }}
                />
                {leadEmailError && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#dc2626",
                      marginTop: "0.25rem",
                    }}
                  >
                    {leadEmailError}
                  </div>
                )}
                {leadEmailSuccess && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#059669",
                      marginTop: "0.25rem",
                    }}
                  >
                    ✓ {leadEmailSuccess}
                  </div>
                )}
              </div>
              <button
                onClick={handleSaveLeadEmail}
                disabled={leadEmailSaving}
                style={{
                  padding: "0.5rem 1rem",
                  background: leadEmailSaving ? "#94a3b8" : "#0ea5e9",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  cursor: leadEmailSaving ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!leadEmailSaving) {
                    e.currentTarget.style.background = "#0284c7";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!leadEmailSaving) {
                    e.currentTarget.style.background = "#0ea5e9";
                  }
                }}
              >
                {leadEmailSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {scrapeSuccess && (
            <div
              style={{
                padding: "0.75rem",
                background: "#d1fae5",
                border: "1px solid #10b981",
                borderRadius: "4px",
                color: "#065f46",
                marginBottom: "1rem",
                fontSize: "0.875rem",
              }}
            >
              {scrapeSuccess}
            </div>
          )}

          {scrapeError && (
            <div
              style={{
                padding: "0.75rem",
                background: "#fee2e2",
                border: "1px solid #ef4444",
                borderRadius: "4px",
                color: "#991b1b",
                marginBottom: "1rem",
                fontSize: "0.875rem",
              }}
            >
              {scrapeError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <button
              className="dashboard-action-btn"
              onClick={handleRunScrape}
              disabled={
                scrapeLoading ||
                selectedWebsite.schedulerConfig?.status === "running"
              }
              style={{
                opacity:
                  scrapeLoading ||
                  selectedWebsite.schedulerConfig?.status === "running"
                    ? 0.6
                    : 1,
                cursor:
                  scrapeLoading ||
                  selectedWebsite.schedulerConfig?.status === "running"
                    ? "not-allowed"
                    : "pointer",
                flex: "1 1 200px",
              }}
            >
              {scrapeLoading
                ? "⏳ Running..."
                : selectedWebsite.schedulerConfig?.status === "running"
                ? "⏳ Crawling..."
                : "🔄 Run Crawl"}
            </button>
            <button
              className="dashboard-action-btn"
              onClick={() => setAddKnowledgeModalOpen(true)}
              style={{ flex: "1 1 200px" }}
            >
              📝 Add Knowledge
            </button>
            <button
              className="dashboard-action-btn dashboard-action-btn--widget"
              onClick={() => setWidgetInstallerOpen(true)}
              style={{ flex: "1 1 200px" }}
            >
              🚀 Install Widget
            </button>
          </div>
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              background: "#e0f2fe",
              borderRadius: "4px",
              fontSize: "0.875rem",
              color: "#0c4a6e",
            }}
          >
            ℹ️ <strong>Run Crawl</strong> adds website content to your chatbot's
            knowledge base.
          </div>

          {/* Scheduler Section */}
          <div
            style={{
              marginTop: "1.5rem",
              paddingTop: "1.5rem",
              borderTop: "2px solid #e2e8f0",
            }}
          >
            <h5
              style={{
                margin: "0 0 1rem 0",
                fontSize: "1rem",
                color: "#0f172a",
                fontWeight: "600",
              }}
            >
              ⏱️ Scheduled Crawling
            </h5>

            {schedulerError && (
              <div
                style={{
                  padding: "0.75rem",
                  background: "#fee2e2",
                  border: "1px solid #ef4444",
                  borderRadius: "4px",
                  color: "#991b1b",
                  marginBottom: "1rem",
                  fontSize: "0.875rem",
                }}
              >
                {schedulerError}
              </div>
            )}

            {/* Scheduler Toggle */}
            <div
              style={{
                padding: "1rem",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.75rem",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      color: "#334155",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Enable Scheduled Crawling
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#64748b",
                    }}
                  >
                    Automatically crawl website every 10 minutes
                  </div>
                </div>

                <label
                  style={{
                    position: "relative",
                    display: "inline-block",
                    width: "52px",
                    height: "28px",
                    cursor: schedulerLoading ? "not-allowed" : "pointer",
                    opacity: schedulerLoading ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={schedulerStatus === "active"}
                    onChange={(e) => handleSchedulerToggle(e.target.checked)}
                    disabled={schedulerLoading}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      cursor: schedulerLoading ? "not-allowed" : "pointer",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor:
                        schedulerStatus === "active" ? "#10b981" : "#cbd5e1",
                      transition: "0.4s",
                      borderRadius: "28px",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        content: '""',
                        height: "20px",
                        width: "20px",
                        left: schedulerStatus === "active" ? "28px" : "4px",
                        bottom: "4px",
                        backgroundColor: "white",
                        transition: "0.4s",
                        borderRadius: "50%",
                      }}
                    ></span>
                  </span>
                </label>
              </div>

              {/* Scheduler Status Display */}
              <div
                style={{
                  paddingTop: "0.75rem",
                  borderTop: "1px solid #e2e8f0",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                  fontSize: "0.8125rem",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#64748b",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Scheduler Status
                  </div>
                  <div style={{ fontWeight: "600" }}>
                    {schedulerLoading ? (
                      <span style={{ color: "#6b7280" }}>⏳ Updating...</span>
                    ) : schedulerStatus === "active" ? (
                      <span style={{ color: "#059669" }}>✓ Active</span>
                    ) : (
                      <span style={{ color: "#64748b" }}>○ Inactive</span>
                    )}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      color: "#64748b",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Last Scheduled Crawl
                  </div>
                  <div style={{ fontWeight: "500", color: "#1e293b" }}>
                    {schedulerConfig?.lastScrapeCompleted
                      ? new Date(
                          schedulerConfig.lastScrapeCompleted
                        ).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Never"}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "0.75rem",
                background: "#fef3c7",
                borderRadius: "4px",
                fontSize: "0.875rem",
                color: "#78350f",
              }}
            >
              ℹ️ When enabled, the scheduler will automatically crawl your
              website every 10 minutes and automatically updates chatbot
              knowledge.
            </div>
          </div>
        </div>
      )}

      {/* Add Website Modal */}
      {addWebsiteModalOpen && (
        <div className="scrape-modal-overlay" role="dialog" aria-modal="true">
          <div className="scrape-modal">
            <h3>Add Website</h3>
            <p className="scrape-modal-subtitle">
              Enter the website URL you want to create a chatbot for.
            </p>

            {addWebsiteError && (
              <p className="scrape-error">{addWebsiteError}</p>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label
                htmlFor="website-url"
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: "500",
                }}
              >
                Website URL
              </label>
              <input
                id="website-url"
                type="url"
                placeholder="https://example.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={addWebsiteLoading}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontSize: "1rem",
                }}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleAddWebsite();
                  }
                }}
              />
            </div>

            <div className="scrape-modal-actions">
              <button
                type="button"
                className="scrape-btn-neutral"
                onClick={() => {
                  setAddWebsiteModalOpen(false);
                  setWebsiteUrl("");
                  setAddWebsiteError("");
                }}
                disabled={addWebsiteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="scrape-btn-primary"
                onClick={handleAddWebsite}
                disabled={addWebsiteLoading}
              >
                {addWebsiteLoading ? "⏳ Adding..." : "➕ Add Website"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Knowledge Modal */}
      {addKnowledgeModalOpen && (
        <div className="scrape-modal-overlay" role="dialog" aria-modal="true">
          <div className="scrape-modal">
            <h3>Add Knowledge</h3>
            <p className="scrape-modal-subtitle">
              Add trusted information to your chatbot's knowledge base manually.
            </p>

            {addKnowledgeError && (
              <p className="scrape-error">{addKnowledgeError}</p>
            )}
            {addKnowledgeSuccess && (
              <div
                style={{
                  padding: "0.75rem",
                  background: "#d1fae5",
                  border: "1px solid #10b981",
                  borderRadius: "4px",
                  color: "#065f46",
                  marginBottom: "1rem",
                }}
              >
                ✅ {addKnowledgeSuccess}
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label
                htmlFor="knowledge-content"
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: "500",
                }}
              >
                Content
              </label>
              <textarea
                id="knowledge-content"
                placeholder="Enter the information you want to add to the chatbot's knowledge base..."
                value={knowledgeContent}
                onChange={(e) => setKnowledgeContent(e.target.value)}
                disabled={addKnowledgeLoading}
                rows={10}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            <div className="scrape-modal-actions">
              <button
                type="button"
                className="scrape-btn-neutral"
                onClick={() => {
                  setAddKnowledgeModalOpen(false);
                  setKnowledgeContent("");
                  setAddKnowledgeError("");
                  setAddKnowledgeSuccess("");
                }}
                disabled={addKnowledgeLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="scrape-btn-primary"
                onClick={handleAddKnowledge}
                disabled={addKnowledgeLoading || !knowledgeContent.trim()}
                style={{
                  opacity:
                    addKnowledgeLoading || !knowledgeContent.trim() ? 0.6 : 1,
                  cursor:
                    addKnowledgeLoading || !knowledgeContent.trim()
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {addKnowledgeLoading ? "⏳ Adding..." : "✅ Add Knowledge"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Widget Installer Modal */}
      <WidgetInstaller
        isOpen={isWidgetInstallerOpen}
        onClose={() => setWidgetInstallerOpen(false)}
        bots={selectedWebsite ? [selectedWebsite] : []}
      />
    </div>
  );
}

export default WebsitesPage;
