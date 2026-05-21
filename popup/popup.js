// popup.js - Extension popup logic (Fixed)
// Fixed: Duplicate DOMContentLoaded, malformed checkAuth, event listener leaks

// === CONFIG: Production URL for extension ===
const API_BASE_URL = "https://linkedaai.flowentech.com";

// ---- State ----
let state = {
  profile: null,
  isGenerating: false,
  isLoggedIn: false,
  usageCount: 0,
  usageLimit: 10,
  leads: [],
  notes: [],
  notesPage: 1,
  notesTotalPages: 1,
  notesLoadingMore: false,

  currentPanel: "main",
  authMode: "login" // 'login' | 'signup'
};

// ---- DOM refs ----
const $ = (id) => document.getElementById(id);

// Panels
const panels = {
  auth: null,
  main: null,
  leads: null,
  notes: null,
  settings: null
};

// Auth elements
let authEmail, authPassword, authName, authBtn, authTitle, authSubtitle, authToggle, authToggleText;

// ---- Session Cache Helpers ----
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for auth

async function cacheGet(key) {
  try {
    const result = await chrome.storage.session.get([key]);
    if (!result[key]) return null;
    const entry = result[key];
    if (Date.now() - entry.ts > CACHE_TTL) return null;
    return entry.data;
  } catch { return null; }
}

async function cacheSet(key, data) {
  try {
    await chrome.storage.session.set({ [key]: { data, ts: Date.now() } });
  } catch { /* storage quota exceeded */ }
}

async function cacheRemove(key) {
  try { await chrome.storage.session.remove([key]); } catch {}
}

// ---- Keepalive: wake service worker on popup open ----
function initKeepalive() {
  try {
    const port = chrome.runtime.connect({ name: "popup-keepalive" });
    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) { /* handled silently */ }
    });
  } catch (e) { /* sendBg retry will handle it */ }
}

// ---- Save state on visibility change ----
function setupVisibilitySave() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.profile) {
      chrome.storage.session.set({
        cachedProfile: state.profile,
        cachedProfileTs: Date.now(),
      }).catch(() => {});
    }
  });
}

// ---- Loading overlay ----
function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.classList.add("hidden");
    setTimeout(() => overlay.remove(), 300);
  }
}

// ---- Init ----
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 LinkedIn AI Outreach initialized");

  try {
    // Cache DOM refs
    panels.auth = $("auth-panel");
    panels.main = $("main-panel");
    panels.leads = $("leads-panel");
    panels.notes = $("notes-panel");
    panels.settings = $("settings-panel");

    authEmail = $("auth-email");
    authPassword = $("auth-password");
    authName = $("auth-name");
    authBtn = $("auth-btn");
    authTitle = $("auth-title");
    authSubtitle = $("auth-subtitle");
    authToggle = $("auth-toggle");
    authToggleText = $("auth-toggle-text");

    // Setup event listeners
    setupPasswordToggle();
    setupEventListeners();
    setupVisibilitySave();

    // Try cached profile first for instant UI
    try {
      const cached = await chrome.storage.session.get(["cachedProfile", "cachedProfileTs"]);
      if (cached.cachedProfile && cached.cachedProfileTs && Date.now() - cached.cachedProfileTs < 30000) {
        state.profile = cached.cachedProfile;
      }
    } catch {}

    // Check auth (now uses session cache — skips network if recently verified)
    await checkAuth();
  } catch (error) {
    console.error("❌ Initialization error:", error);
    const authPanel = document.getElementById("auth-panel");
    if (authPanel) {
      authPanel.style.display = "flex";
    }
  } finally {
    hideLoadingOverlay();
  }
});

// ---- Password Toggle ----
function setupPasswordToggle() {
  const togglePasswordBtn = $("toggle-password");
  const eyeIcon = $("eye-icon");

  if (togglePasswordBtn && authPassword && eyeIcon) {
    togglePasswordBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    togglePasswordBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (authPassword.type === "password") {
        authPassword.type = "text";
        eyeIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        authPassword.type = "password";
        eyeIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
      }
    });
  } else {
    console.error("Password toggle elements missing:", { togglePasswordBtn, authPassword, eyeIcon });
  }
}

// ---- Event Listeners ----
function setupEventListeners() {
  // Auth button (login / signup)
  if (authBtn) {
    authBtn.addEventListener("click", handleAuthSubmit);
  }

  // Auth mode toggle
  if (authToggle) {
    authToggle.addEventListener("click", (e) => {
      e.preventDefault();
      toggleAuthMode();
    });
  }

  // Sign out
  $("signout-btn")?.addEventListener("click", async () => {
    await sendBg({ type: "CLEAR_AUTH_TOKEN" });
    await cacheRemove("authCheck");
    chrome.storage.session.remove(["cachedProfile", "cachedProfileTs"]).catch(() => {});
    state.isLoggedIn = false;
    state.profile = null;
    showPanel("auth");
    showToast("Signed out", "success");
  });

  // Panel navigation
  $("leads-btn")?.addEventListener("click", () => {
    showPanel("leads");
    loadLeads();
  });

  $("notes-btn")?.addEventListener("click", () => {
    showPanel("notes");
    loadNotes();
  });

  $("settings-btn")?.addEventListener("click", () => {
    if ($("settings-usage")) {
      $("settings-usage").textContent = `${state.usageCount} / ${state.usageLimit}`;
    }
    showPanel("settings");
  });

  $("leads-back-btn")?.addEventListener("click", () => showPanel("main"));
  $("notes-back-btn")?.addEventListener("click", () => showPanel("main"));
  $("settings-back-btn")?.addEventListener("click", () => showPanel("main"));

  // Profile refresh
  $("refresh-profile-btn")?.addEventListener("click", loadProfile);

  // Google Search
  $("google-search-btn")?.addEventListener("click", handleGoogleSearch);

  // Save lead
  $("save-lead-btn")?.addEventListener("click", handleSaveLead);

  // Manual Lead Creation
  $("add-manual-lead-btn")?.addEventListener("click", openManualLeadModal);
  $("close-manual-lead-btn")?.addEventListener("click", closeManualLeadModal);
  $("save-manual-lead-btn")?.addEventListener("click", handleSaveManualLead);

  // Notes
  $("create-note-btn")?.addEventListener("click", () => openNoteModal());
  $("close-note-modal")?.addEventListener("click", closeNoteModal);
  $("save-note-btn")?.addEventListener("click", handleSaveNote);
  $("delete-note-btn")?.addEventListener("click", handleDeleteNote);

  // Search
  $("leads-search")?.addEventListener("input", debounce(handleLeadsSearch, 250));
  $("notes-search")?.addEventListener("input", debounce(() => { state.notesPage = 1; loadNotes(); }, 300));
  $("sticky-toggle")?.addEventListener("change", () => {
    stickyFilterActive = $("sticky-toggle")?.checked || false;
    if (stickyFilterActive) selectedNoteTag = "";
    state.notesPage = 1;
    loadNotes();
  });

  // Upgrade
  $("upgrade-to-pro-btn")?.addEventListener("click", handleUpgrade);
}

function openManualLeadModal() {
  const section = $("manual-lead-section");
  if (!section) return;
  section.classList.remove("hidden");
  section.style.display = "block";
  setTimeout(() => $("manual-lead-name")?.focus(), 0);
}

function closeManualLeadModal() {
  const section = $("manual-lead-section");
  if (!section) return;
  section.classList.add("hidden");
  section.style.display = "none";
}

// ---- Auth ----
function resetAuthForm() {
  if (authBtn) {
    authBtn.disabled = false;
    authBtn.textContent = state.authMode === "signup" ? "Sign Up" : "Sign In";
  }
  if (authPassword) authPassword.value = "";
}

function toggleAuthMode() {
  state.authMode = state.authMode === "login" ? "signup" : "login";

  if (state.authMode === "signup") {
    authTitle.textContent = "Create Account";
    authSubtitle.textContent = "Get started with personalized LinkedIn outreach";
    authName?.classList.remove("hidden");
    authBtn.textContent = "Sign Up";
    authToggleText.textContent = "Already have an account?";
    authToggle.textContent = "Sign in";
  } else {
    authTitle.textContent = "Welcome Back";
    authSubtitle.textContent = "Sign in to generate personalized LinkedIn messages with AI";
    authName?.classList.add("hidden");
    authBtn.textContent = "Sign In";
    authToggleText.textContent = "Don't have an account?";
    authToggle.textContent = "Sign up free";
  }

  // Re-enable button when switching modes
  if (authBtn) authBtn.disabled = false;
}

async function handleAuthSubmit() {
  if (state.authMode === "signup") {
    await handleSignup();
  } else {
    await handleLogin();
  }
}

async function handleLogin() {
  const email = authEmail?.value.trim();
  const password = authPassword?.value.trim();

  if (!email || !password) {
    showToast("Please fill in all fields", "error");
    return;
  }

  authBtn.disabled = true;
  const originalText = authBtn.textContent;
  authBtn.textContent = "Signing in...";

  try {
    console.log("Attempting login to:", API_BASE_URL + "/api/auth/login");
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    console.log("Login response:", res.status, data);

    if (!res.ok) {
      showToast(data.error || "Sign in failed", "error");
      authBtn.disabled = false;
      authBtn.textContent = originalText;
      return;
    }

    await sendBg({ type: "SET_AUTH_TOKEN", token: data.token });
    if (authPassword) authPassword.value = "";
    await checkAuth();
    showToast("Welcome back! 👋", "success");

  } catch (error) {
    console.error("Login error:", error);
    showToast("Network error", "error");
    authBtn.disabled = false;
    authBtn.textContent = originalText;
  }
}

async function handleSignup() {
  const name = authName?.value.trim();
  const email = authEmail?.value.trim();
  const password = authPassword?.value.trim();

  if (!name || !email || !password) {
    showToast("Please fill in all fields", "error");
    return;
  }

  if (password.length < 6) {
    showToast("Password must be at least 6 characters", "error");
    return;
  }

  authBtn.disabled = true;
  const originalText = authBtn.textContent;
  authBtn.textContent = "Creating account...";

  try {
    console.log("Attempting signup to:", API_BASE_URL + "/api/auth/signup");
    const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    console.log("Signup response:", res.status, data);

    if (!res.ok) {
      showToast(data.error || "Sign up failed", "error");
      authBtn.disabled = false;
      authBtn.textContent = originalText;
      return;
    }

    await sendBg({ type: "SET_AUTH_TOKEN", token: data.token });
    if (authPassword) authPassword.value = "";
    if (authName) authName.value = "";
    await checkAuth();
    showToast("Account created! 🎉", "success");

  } catch (error) {
    console.error("Signup error:", error);
    showToast("Network error", "error");
    authBtn.disabled = false;
    authBtn.textContent = originalText;
  }
}

async function checkAuth() {
  console.log("🔐 Checking authentication...");

  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });
    console.log("📦 Token from storage:", token ? "exists" : "null");

    if (!token) {
      showPanel("auth");
      return;
    }

    // Try session cache first — avoid network call if recently verified
    const cachedAuth = await cacheGet("authCheck");
    if (cachedAuth) {
      state.isLoggedIn = true;
      state.usageCount = cachedAuth.usageToday || 0;
      state.usageLimit = cachedAuth.usageLimit || 10;
      if ($("settings-email")) $("settings-email").textContent = cachedAuth.email || "—";
      if ($("settings-plan")) $("settings-plan").textContent = cachedAuth.plan === "pro" ? "Pro" : "Free";
      updateUsageCounter();
      showPanel("main");
      loadProfile(); // don't await — show UI instantly
      return;
    }

    // Verify token with server
    let res;
    try {
      res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (networkErr) {
      console.warn("🌐 Network error verifying token, using cached token:", networkErr);
      state.isLoggedIn = true;
      showPanel("main");
      loadProfile(); // don't await
      return;
    }

    if (res.status === 401 || res.status === 403) {
      console.warn("🚫 Token rejected by server (", res.status, "), clearing...");
      await sendBg({ type: "CLEAR_AUTH_TOKEN" });
      await cacheRemove("authCheck");
      showPanel("auth");
      return;
    }

    if (!res.ok) {
      console.warn("⚠️ /api/auth/me returned", res.status, "— keeping token, showing main panel");
      state.isLoggedIn = true;
      showPanel("main");
      loadProfile(); // don't await
      return;
    }

    const data = await res.json();
    state.isLoggedIn = true;
    state.usageCount = data.usageToday || 0;
    state.usageLimit = data.usageLimit || 10;

    // Cache auth result
    await cacheSet("authCheck", {
      email: data.email,
      plan: data.plan,
      usageToday: data.usageToday,
      usageLimit: data.usageLimit,
    });

    if ($("settings-email")) $("settings-email").textContent = data.email || "—";
    if ($("settings-plan")) $("settings-plan").textContent = data.plan === "pro" ? "Pro" : "Free";
    updateUsageCounter();

    showPanel("main");
    loadProfile(); // don't await

  } catch (error) {
    console.error("Auth check error:", error);
    showPanel("auth");
  }
}

// ---- Panel Navigation ----
function showPanel(name) {
  state.currentPanel = name;
  Object.keys(panels).forEach(key => {
    if (panels[key]) {
      const isActive = key === name;
      panels[key].classList.toggle("active", isActive);
      // Nuclear option: explicitly set display to ensure panels are truly hidden/shown
      panels[key].style.display = isActive ? "flex" : "none";
    }
  });

  // Toggle header buttons based on login state
  const headerButtons = document.querySelectorAll(".header-action-btn");
  headerButtons.forEach(btn => {
    btn.style.display = state.isLoggedIn ? "flex" : "none";
  });

  // Reset auth form when returning to auth panel
  if (name === "auth") {
    resetAuthForm();
  }
}

// ---- Profile ----
async function loadProfile() {
  console.log("🔄 Loading profile from LinkedIn tab...");
  setStatus("loading", "Loading profile...");

  // Render cached profile instantly if available
  if (state.profile) {
    renderProfile(state.profile);
    setStatus("ready", "Profile loaded ✓");
  }

  try {
    const result = await sendBg({ type: "GET_PROFILE_FROM_TAB" });

    if (!result.success || !result.profile) {
      if (!state.profile) {
        $("profile-loaded")?.classList.add("hidden");
        $("profile-empty")?.classList.remove("hidden");
        $("save-lead-btn") && ($("save-lead-btn").disabled = true);
        setStatus("error", "No profile detected");
      }
      return;
    }

    state.profile = result.profile;
    renderProfile(result.profile);
    setStatus("ready", "Profile loaded ✓");

    // Cache profile for next open
    chrome.storage.session.set({
      cachedProfile: result.profile,
      cachedProfileTs: Date.now(),
    }).catch(() => {});

  } catch (error) {
    console.error("Profile load error:", error);
    if (!state.profile) setStatus("error", "Failed to load profile");
  }
}

function renderProfile(profile) {
  if (!profile) return;

  const profileName = $("profile-name");
  const profileTitle = $("profile-title");
  const profileCompany = $("profile-company");
  const profileLocation = $("profile-location");
  const profileEmail = $("profile-email");
  const profilePhone = $("profile-phone");
  const profileWebsite = $("profile-website");
  const profileAvatar = $("profile-avatar");

  if (profileName) profileName.textContent = profile.name || "Unknown";
  if (profileTitle) profileTitle.textContent = profile.title || "";
  if (profileCompany) profileCompany.textContent = profile.company || "Not specified";
  if (profileLocation) profileLocation.textContent = profile.location || "Not specified";
  if (profileEmail) profileEmail.textContent = profile.email || "";
  if (profilePhone) profilePhone.textContent = profile.phone || "";
  if (profileWebsite) {
    if (profile.website) {
      profileWebsite.textContent = profile.website;
      profileWebsite.style.display = "block";
    } else {
      profileWebsite.style.display = "none";
    }
  }

  // Auto-fill lead detail inputs from profile data
  const leadEmailInput = $("lead-email");
  const leadPhoneInput = $("lead-phone");
  const leadLinkedinInput = $("lead-linkedin");
  const leadWebsiteInput = $("lead-website");
  if (leadEmailInput) leadEmailInput.value = profile.email || "";
  if (leadPhoneInput) leadPhoneInput.value = profile.phone || "";
  if (leadLinkedinInput) leadLinkedinInput.value = profile.linkedinUrl || "";
  if (leadWebsiteInput) leadWebsiteInput.value = profile.website || "";

  if (profileAvatar) {
    if (profile.photoUrl) {
      profileAvatar.innerHTML = `<img src="${profile.photoUrl}" alt="${profile.name}" />`;
    } else {
      const initial = (profile.name || "?")[0].toUpperCase();
      profileAvatar.textContent = initial;
    }
  }

  $("profile-loaded")?.classList.remove("hidden");
  $("profile-empty")?.classList.add("hidden");

  if ($("save-lead-btn")) $("save-lead-btn").disabled = false;
}

// ---- Save Lead ----
async function handleSaveLead() {
  if (!state.profile) {
    showToast("No profile to save", "error");
    return;
  }

  if (state.usageCount >= state.usageLimit) {
    showToast(`Daily limit of ${state.usageLimit} reached`, "error");
    return;
  }

  const saveLeadBtn = $("save-lead-btn");
  if (saveLeadBtn) {
    saveLeadBtn.disabled = true;
    saveLeadBtn.innerHTML = '<span class="button-spinner"></span>';
  }

  const extraFields = {
    email: $("lead-email")?.value?.trim() || "",
    phone: $("lead-phone")?.value?.trim() || "",
    linkedinUrl: $("lead-linkedin")?.value?.trim() || "",
    website: $("lead-website")?.value?.trim() || "",
    tags: $("lead-tags")?.value?.trim() ? $("lead-tags").value.split(",").map(t => t.trim()).filter(Boolean) : [],
    roleTag: $("lead-role-tag")?.value?.trim() || "",
    leadStatus: $("lead-status-tag")?.value?.trim() || "",
  };

  try {
    const result = await sendBg({
      type: "SAVE_LEAD",
      payload: {
        profile: {
          ...state.profile,
          ...extraFields,
        },
        tags: extraFields.tags,
        roleTag: extraFields.roleTag,
        leadStatus: extraFields.leadStatus,
      },
    });

    if (result.success) {
      state.usageCount++;
      updateUsageCounter();
      showToast("Lead saved successfully! 🎉", "success");
      setStatus("ready", "Lead saved ✓");

      if (saveLeadBtn) {
        saveLeadBtn.disabled = false;
        saveLeadBtn.innerHTML = `
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save Lead
        `;
      }
    } else {
      showToast(result.error || "Failed to save lead", "error");
      if (saveLeadBtn) {
        saveLeadBtn.disabled = false;
        saveLeadBtn.innerHTML = `
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save Lead
        `;
      }
    }
  } catch (error) {
    showToast("Failed to save lead", "error");
    if (saveLeadBtn) {
      saveLeadBtn.disabled = false;
      saveLeadBtn.innerHTML = `
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save Lead
      `;
    }
  }
}

async function handleSaveManualLead() {
  const name = $("manual-lead-name")?.value?.trim();
  if (!name) {
    showToast("Name is required", "error");
    return;
  }

  const saveBtn = $("save-manual-lead-btn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="button-spinner"></span>';
  }

  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });
    if (!token) {
      showToast("Please sign in first", "error");
      return;
    }

    const leadData = {
      profile: {
        name: name,
        company: $("manual-lead-company")?.value?.trim() || "",
        title: $("manual-lead-title")?.value?.trim() || "",
        email: $("manual-lead-email")?.value?.trim() || "",
        phone: $("manual-lead-phone")?.value?.trim() || "",
        linkedinUrl: $("manual-lead-linkedin")?.value?.trim() || "",
      },
      notes: $("manual-lead-notes")?.value?.trim() || "",
      tags: $("manual-lead-tags")?.value?.trim() ? $("manual-lead-tags").value.split(",").map(t => t.trim()).filter(Boolean) : [],
      roleTag: $("manual-lead-role")?.value || "",
      leadStatus: $("manual-lead-status")?.value || "",
    };

    if (!leadData.profile.linkedinUrl) {
      leadData.profile.linkedinUrl = `manual://${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    }
    leadData.profile.profileUrl = leadData.profile.linkedinUrl;

    const res = await fetch(`${API_BASE_URL}/api/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(leadData),
    });

    if (res.ok) {
      showToast("Lead created successfully!", "success");
      // Clear form
      $("manual-lead-name").value = "";
      $("manual-lead-company").value = "";
      $("manual-lead-title").value = "";
      $("manual-lead-email").value = "";
      $("manual-lead-phone").value = "";
      $("manual-lead-linkedin").value = "";
      $("manual-lead-role").value = "";
      $("manual-lead-status").value = "";
      $("manual-lead-tags").value = "";
      $("manual-lead-notes").value = "";
      closeManualLeadModal();
    } else {
      const errorData = await res.json().catch(() => ({}));
      showToast(errorData.error || "Failed to create lead", "error");
    }
  } catch (error) {
    console.error("Error creating lead:", error);
    showToast("Failed to create lead", "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = "Save Lead";
    }
  }
}

// ---- Load Leads ----
let selectedLeadTag = "";
let googleResults = [];

// ---- Load Notes ----
let selectedNoteTag = "";
let stickyFilterActive = false;

async function loadLeads() {
  console.log("🔄 Loading leads...");
  const leadsList = $("leads-list");

  if (!leadsList) return;

  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });

    if (!token) {
      leadsList.innerHTML = `
        <div class="text-center text-muted" style="padding: 48px 24px;">
          <p>Please sign in to view leads</p>
        </div>
      `;
      return;
    }

    const params = new URLSearchParams();
    if (selectedLeadTag) params.set("tag", selectedLeadTag);

    const response = await fetch(`${API_BASE_URL}/api/leads?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error("Failed to load leads");
    }

    const data = await response.json();
    state.leads = data.leads || [];

    renderLeads();
    updateLeadStats();
    renderTagFilters();

  } catch (error) {
    console.error("Error loading leads:", error);
    if (leadsList) {
      leadsList.innerHTML = `
        <div class="text-center text-muted" style="padding: 48px 24px;">
          <p>Failed to load leads</p>
        </div>
      `;
    }
  }
}

function handleLeadsSearch(e) {
  const search = e.target.value.toLowerCase();
  const filtered = state.leads.filter(lead => {
    const profile = lead.profile || {};
    return (profile.name || "").toLowerCase().includes(search) ||
           (profile.company || "").toLowerCase().includes(search) ||
           (profile.title || "").toLowerCase().includes(search);
  });
  // Store original and show filtered
  state._filteredLeads = state.leads;
  state.leads = filtered;
  renderLeads();
  state.leads = state._filteredLeads || state.leads; // Restore
}

function handleGoogleSearch() {
  if (!state.profile || !state.profile.company) {
    showToast("Please fetch profile first", "error");
    return;
  }
  
  const name = state.profile.name || "";
  const company = state.profile.company;
  const query = `"${name}" "${company}" email`;
  const resultsDiv = $("google-search-results");
  resultsDiv.style.display = "block";
  
  resultsDiv.innerHTML = `
    <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: #666;">Search: ${escapeHtml(query)}</div>
    <div style="font-size: 11px; color: #333;">
      <a href="https://www.google.com/search?q=${encodeURIComponent(query)}" target="_blank" style="color: #3B82F6; text-decoration: none; display: block; margin: 4px 0;" onclick="event.stopPropagation()">
        🔍 Google Search
      </a>
      <a href="https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name + " " + company)}" target="_blank" style="color: #0077b5; text-decoration: none; display: block; margin: 4px 0;" onclick="event.stopPropagation()">
        💼 LinkedIn Search
      </a>
    </div>
  `;
  
  showToast("Search ready!", "success");
}


function renderTagFilters() {
  const tagsContainer = $("leads-tags-filter");
  if (!tagsContainer) return;

  const allTags = new Set();
  state.leads.forEach(lead => {
    (lead.tags || []).forEach((tag) => allTags.add(tag));
  });

  const tags = Array.from(allTags).sort();

  if (tags.length === 0) {
    tagsContainer.innerHTML = `
      <button class="btn btn-secondary" data-tag="" style="padding: 6px 12px; font-size: 12px; white-space: nowrap;">All</button>
    `;
    return;
  }

  tagsContainer.innerHTML = `
    <button class="btn ${!selectedLeadTag ? 'btn-primary' : 'btn-secondary'}" data-tag="" style="padding: 6px 12px; font-size: 12px; white-space: nowrap;">All</button>
    ${tags.map(tag => `
      <button class="btn ${selectedLeadTag === tag ? 'btn-primary' : 'btn-secondary'}" data-tag="${tag}" style="padding: 6px 12px; font-size: 12px; white-space: nowrap;">${tag}</button>
    `).join("")}
  `;

  tagsContainer.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedLeadTag = btn.dataset.tag || "";
      loadLeads();
    });
  });
}

function updateLeadStats() {
  const today = new Date().toDateString();
  const todayLeads = state.leads.filter(lead =>
    new Date(lead.createdAt).toDateString() === today
  );

  const totalEl = $("total-leads-count");
  const todayEl = $("today-leads-count");
  const creditsEl = $("credits-remaining");

  if (totalEl) totalEl.textContent = state.leads.length;
  if (todayEl) todayEl.textContent = todayLeads.length;
  if (creditsEl) creditsEl.textContent = state.usageLimit - state.usageCount;
}

function renderLeads() {
  const leadsList = $("leads-list");
  if (!leadsList) return;

  if (state.leads.length === 0) {
    leadsList.innerHTML = `
      <div class="text-center text-muted" style="padding: 48px 24px;">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin-bottom: 12px;">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <div style="font-weight: 600; margin-bottom: 4px;">No leads yet</div>
        <div style="font-size: 12px;">Start saving LinkedIn profiles!</div>
      </div>
    `;
    return;
  }

  leadsList.innerHTML = state.leads.map(lead => createLeadCard(lead)).join("");

  // Add event listeners
  leadsList.querySelectorAll(".lead-card").forEach(card => {
    const leadId = card.dataset.leadId;

    card.querySelector(".lead-card-header")?.addEventListener("click", (e) => {
      if (!e.target.closest("button")) {
        card.classList.toggle("expanded");
      }
    });

    card.querySelector(".btn-delete-lead")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Delete this lead?")) {
        await deleteLead(leadId);
      }
    });

    card.querySelector(".btn-insert-message")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const lead = state.leads.find(l => l._id === leadId);
      if (lead && lead.message) {
        const result = await sendBg({
          type: "INSERT_MESSAGE_IN_TAB",
          text: lead.message,
        });
        if (result.success) {
          showToast("Message inserted!", "success");
        } else {
          showToast("Open LinkedIn messaging first", "error");
        }
      }
    });
  });
}

function createLeadCard(lead) {
  const profile = lead.profile || {};
  // Fallback chain: profile.name -> lead.name -> "Unknown"
  const name = profile.name || lead.name || "Unknown";
  const title = profile.title || lead.title || "";
  const company = profile.company || lead.company || "";
  const location = profile.location || lead.location || "";
  const email = profile.email || lead.email || "";
  const phone = profile.phone || lead.phone || "";
  const photoUrl = profile.photoUrl || lead.photo_url || "";
  const message = lead.message || "";
  const profileUrl = profile.linkedinUrl || profile.profileUrl || lead.profile_url || "";

  const initial = name && name !== "Unknown" ? name[0].toUpperCase() : "?";

  return `
    <div class="lead-card" data-lead-id="${lead._id || lead.id}">
      <div class="lead-card-header">
        <div class="profile-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #0a66c2, #7c3aed); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 14px; flex-shrink: 0; overflow: hidden;">
          ${photoUrl ? `<img src="${photoUrl}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;" />` : initial}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(name)}</div>
          ${title ? `<div style="font-size: 11px; color: #00000099; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(title)}</div>` : ""}
          ${company ? `<div style="font-size: 11px; color: #00000099; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(company)}</div>` : ""}
          ${!title && !company && location ? `<div style="font-size: 11px; color: #00000099; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(location)}</div>` : ""}
        </div>
      </div>
      <div class="lead-card-body">
        ${email || phone ? `
          <div style="padding: 6px 10px; background: #f3f6f8; border-radius: 6px; margin: 0 10px 6px; font-size: 11px; line-height: 1.5; color: #00000099;">
            ${email ? `<div>📧 ${escapeHtml(email)}</div>` : ""}
            ${phone ? `<div>📞 ${escapeHtml(phone)}</div>` : ""}
          </div>
        ` : ""}
        ${message ? `
          <div style="padding: 8px 10px; background: #f3f6f8; border-radius: 6px; margin: 0 10px 8px; font-size: 12px; line-height: 1.5;">
            ${escapeHtml(message)}
          </div>
        ` : ""}
        ${profileUrl ? `<a href="${profileUrl}" target="_blank" style="font-size: 11px; color: var(--primary); text-decoration: none; margin: 0 10px 8px; display: inline-block;">View Profile</a>` : ""}
      </div>
      <div class="lead-actions">
        ${message ? `
          <button class="btn btn-secondary btn-insert-message" style="flex: 1; padding: 5px 8px; font-size: 11px;">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
            Insert
          </button>
        ` : ""}
        <button class="btn-icon btn-delete-lead" style="color: #cc1016; width: 24px; height: 24px;">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

async function deleteLead(leadId) {
  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });

    const response = await fetch(`${API_BASE_URL}/api/leads?id=${leadId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      await loadLeads();
      showToast("Lead deleted", "success");
    }
  } catch (error) {
    console.error("Error deleting lead:", error);
    showToast("Failed to delete lead", "error");
  }
}

// ---- Notes ----
async function loadNotes(page, append) {
  console.log("🔄 Loading notes... page:", page, "append:", append);
  const notesList = $("notes-list");
  if (!notesList) return;

  const pageToLoad = (page !== undefined) ? page : 1;
  const isAppend = !!(append);

  if (!isAppend) {
    state.notes = [];
    state.notesPage = 1;
    state.notesTotalPages = 1;
    state.notesLoadingMore = false;
  }

  if (state.notesLoadingMore) return;
  state.notesLoadingMore = true;

  if (isAppend) {
    let sentinel = $("notes-scroll-sentinel");
    if (sentinel) sentinel.before('<div class="notes-loading-more">Loading more...</div>');
  }

  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });

    if (!token) {
      notesList.innerHTML = `
        <div class="text-center text-muted" style="padding: 32px 20px;">
          <p style="font-size: 13px;">Please sign in to view notes</p>
        </div>
      `;
      state.notesLoadingMore = false;
      return;
    }

    const searchValue = $("notes-search")?.value?.trim() || "";
    const params = new URLSearchParams();
    params.set("page", String(pageToLoad));
    params.set("limit", "10");
    if (searchValue) params.set("search", searchValue);
    if (selectedNoteTag) params.set("tag", selectedNoteTag);
    if (stickyFilterActive) params.set("tag", "sticky");

    const response = await fetch(`${API_BASE_URL}/api/notes?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      const detailMsg = errorData.details || errorData.error || `HTTP ${response.status}`;
      throw new Error(detailMsg);
    }

    const data = await response.json();
    const newNotes = data.user_notes || data.notes || [];

    if (isAppend) {
      state.notes = [...state.notes, ...newNotes];
    } else {
      state.notes = newNotes;
    }

    state.notesPage = pageToLoad;
    state.notesTotalPages = data.pagination?.totalPages || 1;

    renderNotes();
    renderNoteTagFilters();

  } catch (error) {
    console.error("Error loading notes:", error);
    const errMsg = error?.message || "Failed to load notes";
    const isSetupError = errMsg.includes("table not set up") || errMsg.includes("does not exist");
    if (notesList) {
      notesList.innerHTML = `
        <div class="text-center text-muted" style="padding: 32px 20px;">
          <p style="font-size: 13px; margin-bottom: 8px; color: ${isSetupError ? 'var(--danger)' : 'inherit'};">${escapeHtml(errMsg)}</p>
          ${isSetupError ? `<p style="font-size: 11px; margin-bottom: 8px;">Run the SQL in your Supabase dashboard, then restart the server.</p>` : ""}
          <button class="btn btn-secondary" id="retry-notes-btn" style="padding: 4px 10px; font-size: 11px; margin-top: 8px;">Retry</button>
        </div>
      `;
      $("retry-notes-btn")?.addEventListener("click", loadNotes);
    }
  } finally {
    state.notesLoadingMore = false;
  }
}

async function loadNextNotesPage() {
  if (state.notesLoadingMore) return;
  if (state.notesPage >= state.notesTotalPages) return;
  await loadNotes(state.notesPage + 1, true);
}

function renderNotes() {
  const notesList = $("notes-list");
  if (!notesList) return;

  if (state.notes.length === 0) {
    notesList.innerHTML = `
      <div class="text-center text-muted" style="padding: 32px 20px;">
        <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin-bottom: 8px;">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <div style="font-weight: 600; margin-bottom: 2px; font-size: 13px;">No notes yet</div>
        <div style="font-size: 11px;">Create your first note!</div>
      </div>
      <div id="notes-scroll-sentinel" style="height:1px"></div>
    `;
    return;
  }

  // Sort: sticky notes first
  const sorted = [...state.notes].sort((a, b) => {
    const aSticky = (a.tags || []).includes("sticky");
    const bSticky = (b.tags || []).includes("sticky");
    if (aSticky && !bSticky) return -1;
    if (!aSticky && bSticky) return 1;
    return 0;
  });

  notesList.innerHTML = sorted.map(note => createNoteCard(note)).join("");
  notesList.innerHTML += '<div id="notes-scroll-sentinel" style="height:1px"></div>';

  // Card click opens view mode
  notesList.querySelectorAll(".note-card").forEach(card => {
    const noteId = card.dataset.noteId;
    card.addEventListener("click", () => {
      const note = state.notes.find(n => String(n.id) === noteId);
      if (note) openNoteModal(note, true);
    });
  });

  // Add event listeners for view, edit, delete, copy, sticky-toggle buttons
  notesList.querySelectorAll(".note-view-btn").forEach(btn => {
    const noteId = btn.dataset.noteId;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const note = state.notes.find(n => String(n.id) === noteId);
      if (note) openNoteModal(note, true);
    });
  });

  notesList.querySelectorAll(".note-edit-btn").forEach(btn => {
    const noteId = btn.dataset.noteId;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const note = state.notes.find(n => String(n.id) === noteId);
      if (note) openNoteModal(note, false);
    });
  });

  notesList.querySelectorAll(".note-delete-btn").forEach(btn => {
    const noteId = btn.dataset.noteId;
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Delete this note?")) {
        const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });
        try {
          const response = await fetch(`${API_BASE_URL}/api/notes?id=${noteId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.ok) {
            showToast("Note deleted", "success");
            state.notesPage = 1;
            await loadNotes();
          } else {
            showToast("Failed to delete note", "error");
          }
        } catch (error) {
          showToast("Failed to delete note", "error");
        }
      }
    });
  });

  // Copy button
  notesList.querySelectorAll(".note-copy-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.noteId;
      const note = state.notes.find(n => String(n.id) === noteId);
      if (note?.content) {
        navigator.clipboard.writeText(note.content).then(() => {
          showToast("Copied!", "success");
        }).catch(() => {
          showToast("Copy failed", "error");
        });
      } else {
        showToast("No content to copy", "error");
      }
    });
  });

  // Sticky toggle button
  notesList.querySelectorAll(".note-sticky-toggle").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.noteId;
      handleNoteStickyToggle(noteId);
    });
  });

  // IntersectionObserver for infinite scroll
  setupNotesInfiniteScroll();
}

function setupNotesInfiniteScroll() {
  const sentinel = document.getElementById("notes-scroll-sentinel");
  if (!sentinel) return;
  if (window._notesObserver) window._notesObserver.disconnect();

  // Remove any existing "Loading more..." text from previous renders
  document.querySelectorAll(".notes-loading-more").forEach(el => el.remove());

  window._notesObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (state.notesLoadingMore) return;
      if (state.notesPage >= state.notesTotalPages) return;
      loadNextNotesPage();
    }
  }, { root: document.querySelector(".notes-list") || null, rootMargin: "100px" });

  window._notesObserver.observe(sentinel);
}

function createNoteCard(note) {
  const title = note.title || "Untitled";
  const content = note.content || "";
  const header = note.header || "";
  const tags = note.tags || [];
  const updatedAt = new Date(note.updatedAt).toLocaleDateString();
  const isSticky = tags.includes("sticky");

  return `
    <div class="note-card ${isSticky ? 'note-card-sticky' : ''}" data-note-id="${escapeHtml(String(note.id))}">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <div style="flex: 1; min-width: 0;">
          ${header ? `<div style="font-size: 10px; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 2px;">${escapeHtml(header)}</div>` : ""}
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px;">${escapeHtml(title)}</div>
          ${content ? `<div class="note-content">${renderNoteCardContent(content)}</div>` : ""}
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0;">
          <button class="note-copy-btn" data-note-id="${escapeHtml(String(note.id))}" title="Copy content" style="background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button class="note-view-btn" data-note-id="${escapeHtml(String(note.id))}" title="View" style="background: var(--bg-tertiary); border: 1px solid var(--border); color: var(--primary); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button class="note-edit-btn" data-note-id="${escapeHtml(String(note.id))}" title="Edit" style="background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M4 20h4l10-10-4-4L4 16v4z"/>
              <path d="M13.5 6.5l4 4"/>
            </svg>
          </button>
          <button class="note-sticky-toggle ${isSticky ? 'active' : ''}" data-note-id="${escapeHtml(String(note.id))}" title="${isSticky ? 'Remove sticky' : 'Mark sticky'}" style="background: ${isSticky ? '#FFF9C4' : 'transparent'}; border: 1px solid ${isSticky ? '#FCE83A' : 'var(--border)'}; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px;">
            📌
          </button>
          <button class="note-delete-btn" data-note-id="${escapeHtml(String(note.id))}" title="Delete" style="background: var(--danger-light); border: 1px solid var(--danger); color: var(--danger); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      ${tags.length > 0 ? `
        <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px;">
          ${tags.map(tag => `<span style="font-size: 10px; padding: 2px 6px; background: ${tag === 'sticky' ? '#FCE83A' : 'var(--primary-light)'}; color: ${tag === 'sticky' ? '#92400E' : 'var(--primary)'}; border-radius: 10px;">${escapeHtml(tag)}</span>`).join("")}
        </div>
      ` : ""}
      <div style="font-size: 11px; color: #00000066;">${updatedAt}</div>
    </div>
  `;
}

function renderNoteTagFilters() {
  const tagsContainer = $("notes-tags-filter");
  if (!tagsContainer) return;

  const allTags = new Set();
  state.notes.forEach(note => {
    (note.tags || []).forEach((tag) => allTags.add(tag));
  });

  const tags = Array.from(allTags).sort();

  if (tags.length === 0) {
    tagsContainer.innerHTML = `
      <button class="btn btn-secondary notes-filter-btn" data-tag="" style="padding: 6px 12px; font-size: 12px; white-space: nowrap;">All</button>
    `;
    return;
  }

  tagsContainer.innerHTML = `
    <button class="btn ${!selectedNoteTag ? 'btn-primary' : 'btn-secondary'} notes-filter-btn" data-tag="" style="padding: 6px 12px; font-size: 12px; white-space: nowrap;">All</button>
    ${tags.map(tag => `
      <button class="btn ${selectedNoteTag === tag ? 'btn-primary' : 'btn-secondary'} notes-filter-btn" data-tag="${escapeHtml(tag)}" style="padding: 6px 12px; font-size: 12px; white-space: nowrap;">${escapeHtml(tag)}</button>
    `).join("")}
  `;

  tagsContainer.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedNoteTag = btn.dataset.tag || "";
      loadNotes();
    });
  });
}

let currentEditingNoteId = null;

function renderNoteCardContent(content) {
  const trimmed = (content || "").trim();
  const url = parseNoteUrl(trimmed);
  if (url) {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener" class="note-content-link" onclick="event.stopPropagation()">${escapeHtml(trimmed)}</a>`;
  }
  return escapeHtml(content);
}

function parseNoteUrl(text) {
  if (!text) return null;
  const urlMatch = text.match(/^(https?:\/\/[^\s]+|[^\s]+\.[^\s]{2,})$/i);
  if (!urlMatch) return null;
  let url = urlMatch[1];
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

function openNoteModal(note = null, readOnly = false) {
  const modal = $("note-modal");
  const titleInput = $("note-title");
  const headerInput = $("note-header");
  const contentInput = $("note-content");
  const tagsInput = $("note-tags-input");
  const deleteBtn = $("delete-note-btn");
  const saveBtn = $("save-note-btn");
  const modalTitle = $("note-modal-title");

  if (!modal) return;

  if (note) {
    currentEditingNoteId = note.id;
    modalTitle.textContent = readOnly ? "View Note" : "Edit Note";
    if (titleInput) titleInput.value = note.title || "";
    if (headerInput) headerInput.value = note.header || "";
    if (contentInput) contentInput.value = note.content || "";
    if (tagsInput) tagsInput.value = (note.tags || []).join(", ");
    if (deleteBtn) deleteBtn.style.display = readOnly ? "none" : "inline-flex";
    if (saveBtn) saveBtn.style.display = readOnly ? "none" : "inline-flex";
  } else {
    currentEditingNoteId = null;
    modalTitle.textContent = "New Note";
    if (titleInput) titleInput.value = "";
    if (headerInput) headerInput.value = "";
    if (contentInput) contentInput.value = "";
    if (tagsInput) tagsInput.value = "";
    if (deleteBtn) deleteBtn.style.display = "none";
    if (saveBtn) saveBtn.style.display = "inline-flex";
  }

  if (titleInput) {
    titleInput.readOnly = readOnly;
    titleInput.disabled = false;
  }
  if (headerInput) {
    headerInput.readOnly = readOnly;
    headerInput.disabled = false;
  }
  if (contentInput) {
    contentInput.readOnly = readOnly;
    contentInput.disabled = false;
  }
  if (tagsInput) {
    tagsInput.readOnly = readOnly;
    tagsInput.disabled = false;
  }

  modal.classList.remove("hidden");
  modal.style.display = "flex";
  if (titleInput && !readOnly) {
    titleInput.focus();
  }
}

function closeNoteModal() {
  const modal = $("note-modal");
  const titleInput = $("note-title");
  const headerInput = $("note-header");
  const contentInput = $("note-content");
  const tagsInput = $("note-tags-input");
  const saveBtn = $("save-note-btn");
  const deleteBtn = $("delete-note-btn");

  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }

  if (titleInput) {
    titleInput.readOnly = false;
    titleInput.disabled = false;
  }
  if (headerInput) {
    headerInput.readOnly = false;
    headerInput.disabled = false;
  }
  if (contentInput) {
    contentInput.readOnly = false;
    contentInput.disabled = false;
  }
  if (tagsInput) {
    tagsInput.readOnly = false;
    tagsInput.disabled = false;
  }
  if (saveBtn) saveBtn.style.display = "inline-flex";
  if (deleteBtn) deleteBtn.style.display = "none";

  currentEditingNoteId = null;
}

async function handleSaveNote() {
  const title = $("note-title")?.value?.trim();
  const header = $("note-header")?.value?.trim();
  const content = $("note-content")?.value?.trim();
  const tagsStr = $("note-tags-input")?.value?.trim();
  const tags = tagsStr ? tagsStr.split(",").map(t => t.trim()).filter(Boolean) : [];

  if (!title) {
    showToast("Title is required", "error");
    return;
  }

  const saveBtn = $("save-note-btn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="button-spinner"></span>';
  }

  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });

    const url = currentEditingNoteId
      ? `${API_BASE_URL}/api/notes`
      : `${API_BASE_URL}/api/notes`;
    const method = currentEditingNoteId ? "PATCH" : "POST";
    const body = currentEditingNoteId
      ? { id: currentEditingNoteId, title, header, content, tags }
      : { title, header, content, tags };

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      showToast(currentEditingNoteId ? "Note updated!" : "Note created!", "success");
      closeNoteModal();
      await loadNotes();
    } else {
      const data = await response.json().catch(() => ({}));
      showToast(data.error || "Failed to save note", "error");
    }
  } catch (error) {
    showToast("Failed to save note", "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = "Save";
    }
  }
}

async function handleDeleteNote() {
  if (!currentEditingNoteId) return;
  if (!confirm("Delete this note?")) return;

  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });
    const response = await fetch(`${API_BASE_URL}/api/notes?id=${currentEditingNoteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      showToast("Note deleted", "success");
      closeNoteModal();
      await loadNotes();
    } else {
      showToast("Failed to delete note", "error");
    }
  } catch (error) {
    showToast("Failed to delete note", "error");
  }
}

async function handleNoteStickyToggle(noteId) {
  const note = state.notes.find(n => String(n.id) === noteId);
  if (!note) return;

  const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });
  if (!token) return;

  let tags = [...(note.tags || [])];
  const hadSticky = tags.includes("sticky");
  if (hadSticky) {
    tags = tags.filter(t => t !== "sticky");
  } else {
    tags.push("sticky");
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/notes`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: noteId, tags }),
    });

    if (response.ok) {
      showToast(hadSticky ? "Unmarked sticky" : "Marked as sticky", "success");
      note.tags = tags;
      renderNotes();
    } else {
      showToast("Failed to update note", "error");
    }
  } catch {
    showToast("Failed to update note", "error");
  }
}

async function handleCreateNote() {
  openNoteModal();
}

// ---- Upgrade ----
async function handleUpgrade() {
  const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });

  if (!token) {
    showToast("Please sign in first", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/stripe/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (data.url) {
      chrome.tabs.create({ url: data.url });
    } else {
      showToast(data.error || "Failed to start checkout", "error");
    }
  } catch (error) {
    showToast("Connection error", "error");
  }
}

// ---- Helpers ----
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function setStatus(type, text) {
  const statusDot = $("status-dot");
  const statusText = $("status-text");
  if (!statusDot || !statusText) return;

  statusDot.className = "status-dot";
  if (type === "loading") statusDot.classList.add("loading");
  else if (type === "error") statusDot.classList.add("error");
  statusText.textContent = text;
}

function updateUsageCounter() {
  const usageCounter = $("usage-counter");
  if (!usageCounter) return;

  if (!state.isLoggedIn) {
    usageCounter.style.display = "none";
    return;
  }

  usageCounter.style.display = "inline";
  const remaining = state.usageLimit - state.usageCount;
  usageCounter.textContent = `${remaining} left`;
}

function showToast(message, type = "success") {
  const toastEl = $("toast");
  if (!toastEl) return;

  toastEl.textContent = message;
  toastEl.className = `toast ${type}`;

  setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sendBg(message, retries = 3) {
  return new Promise((resolve) => {
    function attempt(n) {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const lastError = chrome.runtime.lastError;
          if (response && !lastError) {
            resolve(response);
          } else if (n > 0) {
            console.log(`⏳ sendBg retry ${3 - n + 1}/${3} for ${message.type}${lastError ? ': ' + lastError.message : ''}`);
            setTimeout(() => attempt(n - 1), 200);
          } else {
            resolve({ success: false, error: lastError ? lastError.message : "No response from background" });
          }
        });
      } catch (e) {
        if (n > 0) {
          setTimeout(() => attempt(n - 1), 200);
        } else {
          resolve({ success: false, error: e.message });
        }
      }
    }
    attempt(retries);
  });
}
