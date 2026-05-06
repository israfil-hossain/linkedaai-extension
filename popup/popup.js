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
  currentPanel: "main"
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
let authEmail, authPassword, loginBtn;

// ---- Init ----
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 LinkedIn AI Outreach initialized");

  // Cache DOM refs
  panels.auth = $("auth-panel");
  panels.main = $("main-panel");
  panels.leads = $("leads-panel");
  panels.notes = $("notes-panel");
  panels.settings = $("settings-panel");

  authEmail = $("auth-email");
  authPassword = $("auth-password");
  loginBtn = $("login-btn");

  // Setup event listeners
  setupPasswordToggle();
  setupEventListeners();

  // Check auth after setting up listeners
  await checkAuth();
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
  // Login button
  if (loginBtn) {
    loginBtn.addEventListener("click", handleLogin);
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

  $("leads-back-btn")?.addEventListener("click", () => showPanel("main"));
  $("notes-back-btn")?.addEventListener("click", () => showPanel("main"));
  $("settings-back-btn")?.addEventListener("click", () => showPanel("main"));

  // Profile refresh
  $("refresh-profile-btn")?.addEventListener("click", loadProfile);

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

  // Notes
  $("create-note-btn")?.addEventListener("click", handleCreateNote);

  // Search
  $("leads-search")?.addEventListener("input", handleLeadsSearch);
  $("notes-search")?.addEventListener("input", () => loadNotes());

  // Upgrade
  $("upgrade-to-pro-btn")?.addEventListener("click", handleUpgrade);
}

// ---- Auth ----
async function handleLogin() {
  const email = authEmail?.value.trim();
  const password = authPassword?.value.trim();

  if (!email || !password) {
    showToast("Please fill in all fields", "error");
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

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
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
      return;
    }

    await sendBg({ type: "SET_AUTH_TOKEN", token: data.token });
    await checkAuth();
    showToast("Welcome back! 👋", "success");

  } catch (error) {
    console.error("Login error:", error);
    showToast("Network error", "error");
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
}

async function checkAuth() {
  console.log("🔐 Checking authentication...");

  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });

    if (!token) {
      showPanel("auth");
      return;
    }

    // Verify token with server
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      await sendBg({ type: "CLEAR_AUTH_TOKEN" });
      showPanel("auth");
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
      panels[key].classList.toggle("active", key === name);
    }
  });

  // Toggle header buttons based on login state
  const headerButtons = document.querySelectorAll(".header-action-btn");
  headerButtons.forEach(btn => {
    btn.style.display = state.isLoggedIn ? "flex" : "none";
  });
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
  const profileAvatar = $("profile-avatar");

  if (profileName) profileName.textContent = profile.name || "Unknown";
  if (profileTitle) profileTitle.textContent = profile.title || "";
  if (profileCompany) profileCompany.textContent = profile.company || "Not specified";
  if (profileLocation) profileLocation.textContent = profile.location || "Not specified";

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

  if ($("output-box")) {
    $("output-box").innerHTML = '<span class="cursor-blink"></span>';
    $("output-box").classList.add("streaming");
  }

  const generateBtn = $("generate-btn");
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="spin">⟳</span> Generating...';
  }
  setStatus("loading", "Generating message...");

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
    setStatus("ready", "Message generated ✓");
    showToast("Message ready!", "success");

  } catch (error) {
    chrome.runtime.onMessage.removeListener(streamListener);
    showToast("Generation failed", "error");
    setStatus("error", "Failed");
  } finally {
    state.isGenerating = false;
    if (generateBtn) {
      generateBtn.disabled = !state.profile;
      generateBtn.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
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
    saveLeadBtn.innerHTML = '<span class="spin">⟳</span> Saving...';
  }

  const extraFields = {
    email: $("lead-email")?.value?.trim() || "",
    phone: $("lead-phone")?.value?.trim() || "",
    linkedinUrl: $("lead-linkedin")?.value?.trim() || "",
    tags: $("lead-tags")?.value?.trim() ? $("lead-tags").value.split(",").map(t => t.trim()).filter(Boolean) : [],
  };

  try {
    const result = await sendBg({
      type: "SAVE_LEAD",
      payload: {
        profile: {
          ...state.profile,
          ...extraFields,
        },
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
        saveLeadBtn.innerHTML = `
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
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
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
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
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save Lead
      `;
    }
  }
}

// ---- Load Leads ----
let selectedLeadTag = "";

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

function renderTagFilters() {
  const tagsContainer = $("leads-tags-filter");
  if (!tagsContainer) return;

  const allTags = new Set<string>();
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
  const name = profile.name || "Unknown";
  const title = profile.title || "";
  const company = profile.company || "";
  const photoUrl = profile.photoUrl || "";
  const message = lead.message || "";

  return `
    <div class="lead-card" data-lead-id="${lead._id}">
      <div class="lead-card-header">
        <div class="profile-avatar" style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #0a66c2, #7c3aed); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 18px; flex-shrink: 0; overflow: hidden;">
          ${photoUrl ? `<img src="${photoUrl}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;" />` : name[0]?.toUpperCase() || "?"}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 15px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(name)}</div>
          ${title ? `<div style="font-size: 12px; color: #00000099; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(title)}</div>` : ""}
          ${company ? `<div style="font-size: 12px; color: #00000099; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(company)}</div>` : ""}
        </div>
      </div>
      <div class="lead-card-body">
        ${message ? `
          <div style="padding: 12px 16px; background: #f3f6f8; border-radius: 8px; margin: 0 16px 12px; font-size: 13px; line-height: 1.6;">
            ${escapeHtml(message)}
          </div>
        ` : ""}
      </div>
      <div class="lead-actions">
        ${message ? `
          <button class="btn btn-secondary btn-insert-message" style="flex: 1; padding: 8px 12px; font-size: 12px;">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
            Insert
          </button>
        ` : ""}
        <button class="btn-icon btn-delete-lead" style="color: #cc1016;">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
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
        <div class="text-center text-muted" style="padding: 48px 24px;">
          <p>Please sign in to view notes</p>
        </div>
      `;
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/notes`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error("Failed to load notes");
    }

    const data = await response.json();
    state.notes = data.notes || [];

    renderNotes();

  } catch (error) {
    console.error("Error loading notes:", error);
    if (notesList) {
      notesList.innerHTML = `
        <div class="text-center text-muted" style="padding: 48px 24px;">
          <p>Failed to load notes</p>
        </div>
      `;
    }
  }
}

function renderNotes() {
  const notesList = $("notes-list");
  if (!notesList) return;

  if (state.notes.length === 0) {
    notesList.innerHTML = `
      <div class="text-center text-muted" style="padding: 48px 24px;">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin-bottom: 12px;">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <div style="font-weight: 600; margin-bottom: 4px;">No notes yet</div>
        <div style="font-size: 12px;">Create your first note!</div>
      </div>
    `;
    return;
  }

  notesList.innerHTML = state.notes.map(note => createNoteCard(note)).join("");

  notesList.querySelectorAll(".note-card").forEach(card => {
    const noteId = card.dataset.noteId;
    card.addEventListener("click", () => {
      showToast("Note: " + (state.notes.find(n => n.id === noteId)?.title || ""), "success");
    });
  });
}

function createNoteCard(note) {
  const title = note.title || "Untitled";
  const content = note.content || "";
  const updatedAt = new Date(note.updatedAt).toLocaleDateString();

  return `
    <div class="note-card" data-note-id="${note.id}">
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px;">${escapeHtml(title)}</div>
      ${content ? `<div style="font-size: 12px; color: #00000099; line-height: 1.5; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(content)}</div>` : ""}
      <div style="font-size: 11px; color: #00000066;">${updatedAt}</div>
    </div>
  `;
}

async function handleCreateNote() {
  const title = prompt("Note title:");
  if (!title) return;

  const content = prompt("Note content (optional):") || "";

  try {
    const { token } = await sendBg({ type: "GET_AUTH_TOKEN" });

    const response = await fetch(`${API_BASE_URL}/api/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, content }),
    });

    if (response.ok) {
      showToast("Note created!", "success");
      await loadNotes();
    } else {
      showToast("Failed to create note", "error");
    }
  } catch (error) {
    showToast("Failed to create note", "error");
  }
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

function sendBg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { success: false, error: "No response from background" });
    });
  });
}