// src/pages/SiteSettingsPage.js

import React from "react";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/Loader";
import AdminApiKeySection from "../components/users/AdminApiKeySection";
import "../styles/index.css";

function SiteSettingsPage() {
    const { token, user: currentUser } = useAuth();

    if (!token || !currentUser) {
        return <Loader message="Validating session..." />;
    }

    return (
        <div className="admin-users-container">
            <header className="admin-users-header">
                <div className="admin-users-header-content">
                    <div className="admin-users-header-title">
                        <h2>Site Settings</h2>
                    </div>
                </div>
            </header>

            <AdminApiKeySection
                currentUser={currentUser}
                token={token}
                onApiKeySaved={(newKey) => {
                    console.log("API Key updated:", newKey ? "Set" : "Cleared");
                }}
            />
        </div>
    );
}

export default SiteSettingsPage;
