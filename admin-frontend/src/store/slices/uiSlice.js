// src/store/slices/uiSlice.js
import { createSlice } from "@reduxjs/toolkit";

// Detect if mobile on initial load
const isMobileInitial =
  typeof window !== "undefined" && window.innerWidth <= 768;

const initialState = {
  sidebarOpen: !isMobileInitial, // Closed on mobile by default
  activeMenuItem: "dashboard",
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action) => {
      state.sidebarOpen = action.payload;
    },
    setActiveMenuItem: (state, action) => {
      state.activeMenuItem = action.payload;
    },
  },
});

export const { toggleSidebar, setSidebarOpen, setActiveMenuItem } =
  uiSlice.actions;
export default uiSlice.reducer;
