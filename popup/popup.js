// popup.js - Extension popup logic (Fixed)
// Fixed: Duplicate DOMContentLoaded, malformed checkAuth, event listener leaks

// === CONFIG: Production URL for extension ===
const API_BASE_URL = "https://linkedaai.flowentech.com";

// ---- State ----
let state = {
  profile: null,
  selectedTone: "professional",
  generatedMessage: "",
  isGenerating: false,
  isLoggedIn: false,
  usageCount: 0,
  usageLimit: 10,
  leads: [],
  notes: [],
  bulkLeads: [],
  currentPanel: "main",
  authMode: "login" // 'login' | 'signup'
};

// ---- DOM refs ----
const $ = (id) => document.getElementById(id);

// Panels
const panels = {
  auth: null,
  main: null,
  bulk: null,
  leads: null,
  notes: null,
  settings: null
};

// Auth elements
let authEmail, authPassword, authName, authBtn, authTitle, authSubtitle, authToggle, authToggleText;

// ---- Keepalive: wake service worker on popup open ----
function initKeepalive() {
  try {
    const port = chrome.runtime.connect({ name: "popup-keepalive" });
    port.onDisconnect.addListener(() => {
      // Must access lastError to suppress "Unchecked runtime.lastError"
      if (chrome.runtime.lastError) {
        // Service worker disconnected or not ready — handled silently
      }
    });
  } catch (e) {
    // Connection failed, sendBg retry will handle it
  }
}

// ---- Loading overlay ----
function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.classList.add("hidden");
    setTimeout(() => overlay.remove(), 300);
  }
}

// ---- Wake service worker before init ----
function wakeServiceWorker() {
  return new Promise((resolve) => {
    let attempts = 3;
    function tryWake() {
      try {
        // Access lastError to clear any residual value
        const _ = chrome.runtime.lastError;
        chrome.runtime.sendMessage({ type: "PING" }, () => {
          if (chrome.runtime.lastError) {
            if (--attempts > 0) {
              setTimeout(tryWake, 150);
            } else {
              resolve();
            }
          } else {
            resolve();
          }
        });
      } catch {
        if (--attempts > 0) {
          setTimeout(tryWake, 150);
        } else {
          resolve();
        }
      }
    }
    tryWake();
  });
}

// ---- Init ----
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 LinkedIn AI Outreach initialized");

  try {
    // Wake the service worker before anything else
    await wakeServiceWorker();

    // Cache DOM refs
    panels.auth = $("auth-panel");
    panels.main = $("main-panel");
    panels.bulk = $("bulk-panel");
    panels.leads = $("leads-panel");
    panels.notes = $("notes-panel");
    panels.settings = $("settings-panel");

    // Fallback: Show auth panel if panels exist
    if (panels.auth && !panels.auth.classList.contains("active") &&
        panels.main && !panels.main.classList.contains("active")) {
      console.log("⚠️ No panel active, showing auth panel as fallback");
      panels.auth.style.display = "flex";
    }

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

    // Check auth after setting up listeners
    await checkAuth();
  } catch (error) {
    console.error("❌ Initialization error:", error);
    // Fallback: ensure auth panel is visible
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

  $("bulk-leads-btn")?.addEventListener("click", handleBulkCapture);

  $("leads-back-btn")?.addEventListener("click", () => showPanel("main"));
  $("notes-back-btn")?.addEventListener("click", () => showPanel("main"));
  $("settings-back-btn")?.addEventListener("click", () => showPanel("main"));
  $("bulk-back-btn")?.addEventListener("click", () => showPanel("main"));
  $("bulk-cancel-btn")?.addEventListener("click", () => showPanel("main"));
  $("bulk-select-all-btn")?.addEventListener("click", handleBulkSelectAll);
  $("bulk-save-btn")?.addEventListener("click", handleBulkSave);

  // Profile refresh
  $("refresh-profile-btn")?.addEventListener("click", loadProfile);

  // Google Search
  $("google-search-btn")?.addEventListener("click", handleGoogleSearch);

  // Tone selection
  document.querySelectorAll(".tone-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tone-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.selectedTone = btn.dataset.tone;
    });
  });

  // Generate
  $("generate-btn")?.addEventListener("click", generateMessage);
  $("regen-btn")?.addEventListener("click", generateMessage);

  // Output actions
  $("copy-btn")?.addEventListener("click", async () => {
    if (!state.generatedMessage) return;
    try {
      await navigator.clipboard.writeText(state.generatedMessage);
      showToast("Copied to clipboard!", "success");
    } catch {
      showToast("Copy failed", "error");
    }
  });

  $("insert-btn")?.addEventListener("click", async () => {
    if (!state.generatedMessage) return;
    const result = await sendBg({
      type: "INSERT_MESSAGE_IN_TAB",
      text: state.generatedMessage,
    });
    if (result.success) {
      showToast("Message inserted into LinkedIn!", "success");
    } else {
      showToast("Open LinkedIn messaging first", "error");
    }
  });

  // Save lead
  $("add-details-btn")?.addEventListener("click", () => {
    $("lead-details-section")?.classList.toggle("hidden");
  });
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
  $("leads-search")?.addEventListener("input", handleLeadsSearch);
  $("notes-search")?.addEventListener("input", debounce(() => loadNotes(), 300));

  // Upgrade
  $("upgrade-to-pro-btn")?.addEventListener("click", handleUpgrade);
}

function openManualLeadModal() {
  const modal = $("manual-lead-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  setTimeout(() => $("manual-lead-name")?.focus(), 0);
}

function closeManualLeadModal() {
  const modal = $("manual-lead-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.style.display = "none";
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

    // Verify token with server
    let res;
    try {
      res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (networkErr) {
      console.warn("🌐 Network error verifying token, using cached token:", networkErr);
      // Offline or server down — don't clear token, show main panel
      state.isLoggedIn = true;
      showPanel("main");
      await loadProfile();
      return;
    }

    // Only clear token on 401/403 (actually invalid). Keep it on 5xx or other errors.
    if (res.status === 401 || res.status === 403) {
      console.warn("🚫 Token rejected by server (", res.status, "), clearing...");
      await sendBg({ type: "CLEAR_AUTH_TOKEN" });
      showPanel("auth");
      return;
    }

    if (!res.ok) {
      console.warn("⚠️ /api/auth/me returned", res.status, "— keeping token, showing main panel");
      state.isLoggedIn = true;
      showPanel("main");
      await loadProfile();
      return;
    }

    const data = await res.json();
    state.isLoggedIn = true;
    state.usageCount = data.usageToday || 0;
    state.usageLimit = data.usageLimit || 10;

    // Update UI
    if ($("settings-email")) $("settings-email").textContent = data.email || "—";
    if ($("settings-plan")) {
      $("settings-plan").textContent = data.plan === "pro" ? "Pro" : "Free";
    }
    updateUsageCounter();

    showPanel("main");
    await loadProfile();

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

  try {
    const result = await sendBg({ type: "GET_PROFILE_FROM_TAB" });

    if (!result.success || !result.profile) {
      $("profile-loaded")?.classList.add("hidden");
      $("profile-empty")?.classList.remove("hidden");
      $("generate-btn") && ($("generate-btn").disabled = true);
      $("save-lead-btn") && ($("save-lead-btn").disabled = true);
      setStatus("error", "No profile detected");
      return;
    }

    state.profile = result.profile;
    renderProfile(result.profile);
    setStatus("ready", "Profile loaded ✓");

  } catch (error) {
    console.error("Profile load error:", error);
    setStatus("error", "Failed to load profile");
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
  const profileAvatar = $("profile-avatar");

  if (profileName) profileName.textContent = profile.name || "Unknown";
  if (profileTitle) profileTitle.textContent = profile.title || "";
  if (profileCompany) profileCompany.textContent = profile.company || "Not specified";
  if (profileLocation) profileLocation.textContent = profile.location || "Not specified";
  if (profileEmail) profileEmail.textContent = profile.email || "";
  if (profilePhone) profilePhone.textContent = profile.phone || "";

  // Auto-fill lead detail inputs if scraped data exists
  const leadEmailInput = $("lead-email");
  const leadPhoneInput = $("lead-phone");
  const leadLinkedinInput = $("lead-linkedin");
  if (leadEmailInput && profile.email && !leadEmailInput.value) leadEmailInput.value = profile.email;
  if (leadPhoneInput && profile.phone && !leadPhoneInput.value) leadPhoneInput.value = profile.phone;
  if (leadLinkedinInput && profile.linkedinUrl && !leadLinkedinInput.value) leadLinkedinInput.value = profile.linkedinUrl;

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

  if ($("generate-btn")) $("generate-btn").disabled = false;
  if ($("save-lead-btn")) $("save-lead-btn").disabled = false;
}

// ---- Generate Message ----
async function generateMessage() {
  if (!state.profile) {
    showToast("No profile loaded", "error");
    return;
  }

  if (state.isGenerating) return;

  if (state.usageCount >= state.usageLimit) {
    showToast(`Daily limit of ${state.usageLimit} reached`, "error");
    return;
  }

  state.isGenerating = true;
  state.generatedMessage = "";
  $("output-actions")?.classList.add("hidden");
  const placeholder = $("output-placeholder");
  if (placeholder) placeholder.style.display = "none";

  if ($("output-box")) {
    $("output-box").innerHTML = '<span style="color: var(--text-tertiary);">Thinking</span><span class="cursor-blink"></span>';
    $("output-box").classList.add("streaming");
  }

  const generateBtn = $("generate-btn");
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="spin">⟳</span> Generating...';
  }
  setStatus("loading", "Generating...");

  // Listen for stream updates
  const streamListener = (message) => {
    if (message.type === "STREAM_UPDATE") {
      state.generatedMessage = message.fullMessage;
      if ($("output-box")) {
        $("output-box").innerHTML = escapeHtml(message.fullMessage) + '<span class="cursor-blink"></span>';
        $("output-box").scrollTop = $("output-box").scrollHeight;
      }
    }
  };

  chrome.runtime.onMessage.addListener(streamListener);

  try {
    const result = await sendBg({
      type: "GENERATE_MESSAGE",
      payload: {
        profile: state.profile,
        tone: state.selectedTone,
      },
    });

    chrome.runtime.onMessage.removeListener(streamListener);

    if (!result.success) {
      showToast(result.error || "Generation failed", "error");
      setStatus("error", result.error || "Failed");
      if ($("output-box")) {
        $("output-box").classList.remove("streaming");
        $("output-box").innerHTML = `<span style="color: #cc1016;">${escapeHtml(result.error || "An error occurred")}</span>`;
      }
      return;
    }

    state.generatedMessage = result.message;
    state.usageCount++;
    updateUsageCounter();

    if ($("output-box")) {
      $("output-box").innerHTML = escapeHtml(result.message);
      $("output-box").classList.remove("streaming");
    }
    $("output-actions")?.classList.remove("hidden");
    setStatus("ready", "Ready");
    showToast("Message ready!", "success");

  } catch (error) {
    chrome.runtime.onMessage.removeListener(streamListener);
    showToast("Generation failed", "error");
    setStatus("error", "Failed");
    if ($("output-box")) {
      $("output-box").classList.remove("streaming");
      $("output-box").innerHTML = '<span class="output-placeholder" id="output-placeholder">Your AI-generated message will appear here...</span>';
    }
  } finally {
    state.isGenerating = false;
    if (generateBtn) {
      generateBtn.disabled = !state.profile;
      generateBtn.innerHTML = `
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Generate Message
      `;
    }
  }
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
    saveLeadBtn.innerHTML = '<span class="spin">⟳</span> Save';
  }

  const extraFields = {
    email: $("lead-email")?.value?.trim() || "",
    phone: $("lead-phone")?.value?.trim() || "",
    linkedinUrl: $("lead-linkedin")?.value?.trim() || "",
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
        message: state.generatedMessage || "",
        tone: state.selectedTone,
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
    saveBtn.textContent = "Saving...";
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
      saveBtn.textContent = "Save Lead";
    }
  }
}

// ---- Load Leads ----
let selectedLeadTag = "";
let googleResults = [];

// ---- Load Notes ----
let selectedNoteTag = "";

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
  
  const company = state.profile.company;
  const resultsDiv = $("google-search-results");
  resultsDiv.style.display = "block";
  resultsDiv.innerHTML = "Searching...";
  
  showToast(`Searching for ${company}...`, "info");
  
  // In a real extension, you would use a search API here
  // For now, show mock results
  setTimeout(() => {
    resultsDiv.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: #666;">Results for: ${company}</div>
      <div style="font-size: 11px; color: #333;">
        <a href="https://www.google.com/search?q=${encodeURIComponent(company)}" target="_blank" style="color: #3B82F6; text-decoration: none; display: block; margin: 4px 0;" onclick="event.stopPropagation()">
          🔍 Google Search
        </a>
        <a href="https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}" target="_blank" style="color: #0077b5; text-decoration: none; display: block; margin: 4px 0;" onclick="event.stopPropagation()">
          💼 LinkedIn Search
        </a>
      </div>
    `;
    showToast("Search results ready!", "success");
  }, 500);
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
async function loadNotes() {
  console.log("🔄 Loading notes...");
  const notesList = $("notes-list");

  if (!notesList) return;

  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });

    if (!token) {
      notesList.innerHTML = `
        <div class="text-center text-muted" style="padding: 32px 20px;">
          <p style="font-size: 13px;">Please sign in to view notes</p>
        </div>
      `;
      return;
    }

    console.log("📡 Fetching notes from API...");

    // Get search value
    const searchValue = $("notes-search")?.value?.trim() || "";
    const params = new URLSearchParams();
    if (searchValue) params.set("search", searchValue);
    if (selectedNoteTag) params.set("tag", selectedNoteTag);

    const response = await fetch(`${API_BASE_URL}/api/notes?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log("📡 Notes response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error("❌ Notes API error:", response.status, errorData);
      const detailMsg = errorData.details || errorData.error || `HTTP ${response.status}`;
      throw new Error(detailMsg);
    }

    const data = await response.json();
    console.log("📡 Notes data:", data);
    state.notes = data.user_notes || data.notes || [];

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
  }
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
    `;
    return;
  }

  notesList.innerHTML = state.notes.map(note => createNoteCard(note)).join("");

  // Card click opens view mode
  notesList.querySelectorAll(".note-card").forEach(card => {
    const noteId = card.dataset.noteId;
    card.addEventListener("click", () => {
      const note = state.notes.find(n => String(n.id) === noteId);
      if (note) openNoteModal(note, true);
    });
  });

  // Add event listeners for view, edit, and delete buttons
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
}

function createNoteCard(note) {
  const title = note.title || "Untitled";
  const content = note.content || "";
  const header = note.header || "";
  const tags = note.tags || [];
  const updatedAt = new Date(note.updatedAt).toLocaleDateString();

  return `
    <div class="note-card" data-note-id="${escapeHtml(String(note.id))}">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <div style="flex: 1; min-width: 0;">
          ${header ? `<div style="font-size: 10px; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 2px;">${escapeHtml(header)}</div>` : ""}
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px;">${escapeHtml(title)}</div>
          ${content ? `<div class="note-content">${renderNoteCardContent(content)}</div>` : ""}
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0;">
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
          ${tags.map(tag => `<span style="font-size: 10px; padding: 2px 6px; background: var(--primary-light); color: var(--primary); border-radius: 10px;">${escapeHtml(tag)}</span>`).join("")}
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
    saveBtn.textContent = "Saving...";
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
      saveBtn.textContent = "Save";
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

// ---- Bulk Capture ----
async function handleBulkCapture() {
  const btn = $("bulk-leads-btn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">⟳</span>';
  }

  showToast("Scanning search results...", "info");

  try {
    const result = await sendBg({ type: "INIT_BULK_CAPTURE" });
    console.log("Bulk capture result:", result);

    if (!result || !result.success) {
      showToast(result?.error || "Failed to scan results", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = BULK_BTN_SVG;
      }
      return;
    }

    if (!result.leads || result.leads.length === 0) {
      showToast("No leads found in search results", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = BULK_BTN_SVG;
      }
      return;
    }

    state.bulkLeads = result.leads;
    renderBulkLeads();
    showPanel("bulk");
    showToast("✅ " + result.count + " leads loaded", "success");
  } catch (error) {
    console.error("Bulk capture error:", error);
    showToast("Connection error", "error");
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = BULK_BTN_SVG;
  }
}

const BULK_BTN_SVG = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

function renderBulkLeads() {
  const list = $("bulk-list");
  if (!list) return;

  if (!state.bulkLeads || state.bulkLeads.length === 0) {
    list.innerHTML = `
      <div class="text-center text-muted" style="padding: 32px 20px;">
        <div style="font-size: 13px;">No leads found</div>
        <div style="font-size: 11px; margin-top: 4px;">Try a different search query</div>
      </div>
    `;
    return;
  }

  list.innerHTML = state.bulkLeads.map(function(lead, index) {
    const initial = (lead.name || "?")[0].toUpperCase();
    return `
      <div class="bulk-lead-item" data-index="${index}">
        <input type="checkbox" class="bulk-checkbox" data-index="${index}" />
        <div class="bulk-lead-avatar">
          ${lead.photoUrl ? `<img src="${escapeHtml(lead.photoUrl)}" alt="${escapeHtml(lead.name)}" />` : initial}
        </div>
        <div class="bulk-lead-info">
          <div class="bulk-lead-name">${escapeHtml(lead.name || "Unknown")}</div>
          ${lead.title ? `<div class="bulk-lead-detail">${escapeHtml(lead.title)}</div>` : ""}
          ${lead.company ? `<div class="bulk-lead-detail">${escapeHtml(lead.company)}</div>` : ""}
          ${lead.location ? `<div class="bulk-lead-detail">${escapeHtml(lead.location)}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");

  // Add change listeners to checkboxes
  list.querySelectorAll(".bulk-checkbox").forEach(function(cb) {
    cb.addEventListener("change", function() {
      const item = this.closest(".bulk-lead-item");
      if (item) {
        item.classList.toggle("selected", this.checked);
      }
      updateBulkStats();
    });
  });

  updateBulkStats();

  if ($("bulk-source-label")) {
    $("bulk-source-label").textContent = state.bulkLeads.length + " leads";
  }
}

function updateBulkStats() {
  const checked = document.querySelectorAll("#bulk-list .bulk-checkbox:checked");
  const selected = checked.length;
  const total = state.bulkLeads.length;

  if ($("bulk-total-count")) $("bulk-total-count").textContent = total;
  if ($("bulk-selected-count")) $("bulk-selected-count").textContent = selected;

  const saveBtn = $("bulk-save-btn");
  if (saveBtn) {
    saveBtn.disabled = selected === 0;
    saveBtn.textContent = "Save Selected (" + selected + ")";
  }

  const selectAllBtn = $("bulk-select-all-btn");
  if (selectAllBtn) {
    selectAllBtn.textContent = selected === total && total > 0 ? "Deselect All" : "Select All";
  }
}

function handleBulkSelectAll() {
  const checkboxes = document.querySelectorAll("#bulk-list .bulk-checkbox");
  const checked = document.querySelectorAll("#bulk-list .bulk-checkbox:checked");
  const allChecked = checked.length === checkboxes.length && checkboxes.length > 0;
  const newState = !allChecked;

  checkboxes.forEach(function(cb) {
    cb.checked = newState;
    const item = cb.closest(".bulk-lead-item");
    if (item) item.classList.toggle("selected", newState);
  });

  updateBulkStats();
}

async function handleBulkSave() {
  const checkboxes = document.querySelectorAll("#bulk-list .bulk-checkbox:checked");
  if (checkboxes.length === 0) {
    showToast("No leads selected", "error");
    return;
  }

  const selectedLeads = [];
  checkboxes.forEach(function(cb) {
    const index = parseInt(cb.getAttribute("data-index"));
    const lead = state.bulkLeads[index];
    if (lead) {
      selectedLeads.push({
        name: lead.name,
        title: lead.title || "",
        company: lead.company || "",
        location: lead.location || "",
        profileUrl: lead.profileUrl,
        photoUrl: lead.photoUrl || "",
      });
    }
  });

  const saveBtn = $("bulk-save-btn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
  }

  try {
    const result = await sendBg({
      type: "BULK_SAVE_LEADS",
      leads: selectedLeads,
    });

    if (result && result.success) {
      showToast("✅ Saved " + result.saved + " of " + selectedLeads.length + " leads", "success");

      // Remove saved leads from the list
      const indicesToRemove = new Set();
      checkboxes.forEach(function(cb) {
        indicesToRemove.add(parseInt(cb.getAttribute("data-index")));
      });
      state.bulkLeads = state.bulkLeads.filter(function(_, i) {
        return !indicesToRemove.has(i);
      });
      renderBulkLeads();
    } else {
      showToast("❌ " + ((result && result.error) || "Save failed"), "error");
    }
  } catch (error) {
    console.error("Bulk save error:", error);
    showToast("Connection error", "error");
  } finally {
    if (saveBtn) {
      updateBulkStats();
    }
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
