// background.js - MV3 Service Worker
// Handles auth token storage and proxies API calls to Next.js backend
// Fixed: Proper error handling, API communication, leads sync

// === CONFIG: Production URL for extension ===
const API_BASE_URL = "https://linkedaai.flowentech.com"; // Extension communicates with the Next.js dashboard

// Clear popup so onClicked always fires (must run at top level on SW start)
chrome.action.setPopup({ popup: '' });

chrome.runtime.onInstalled.addListener(() => {
  console.log("LinkedIn AI Outreach extension installed/updated");
});

// Auto-open side panel when clicking extension icon
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    // Fallback: open popup in a new tab if side panel fails
    chrome.tabs.create({ url: "popup/popup.html" });
  }
});

/**
 * Listen for messages from popup or content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 Background received message:", message.type, message);

  switch (message.type) {
    case "PING":
      sendResponse({ type: "PONG", status: "alive" });
      return true;

    case "GET_PROFILE_FROM_TAB":
      getProfileFromActiveTab(sendResponse);
      return true;

    case "GENERATE_MESSAGE":
      generateMessage(message.payload, sendResponse);
      return true;

    case "SAVE_LEAD":
      saveLead(message.payload, sendResponse);
      return true;

    case "GET_AUTH_TOKEN":
      getAuthToken(sendResponse);
      return true;

    case "SET_AUTH_TOKEN":
      setAuthToken(message.token, sendResponse);
      return true;

    case "CLEAR_AUTH_TOKEN":
      clearAuthToken(sendResponse);
      return true;

    case "INSERT_MESSAGE_IN_TAB":
      insertMessageInTab(message.text, sendResponse);
      return true;


  }
});

/**
 * Get profile by querying LinkedIn tabs
 */
async function getProfileFromActiveTab(sendResponse) {
  try {
    console.log("🔍 Getting profile from LinkedIn tabs...");

    // First try to find the active tab in the current window
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    console.log("📱 Active tab:", activeTab?.url);

    // Check if active tab is a LinkedIn page (profile, feed, or home)
    if (activeTab?.url?.includes("linkedin.com")) {
      console.log("✅ Active tab is LinkedIn, scraping from it");
      return await scrapeProfileFromTab(activeTab.id, sendResponse);
    }

    // If active tab is not LinkedIn, search for LinkedIn tabs in all windows
    console.log("⚠️ Active tab is not LinkedIn, searching all tabs...");
    const allTabs = await chrome.tabs.query({});
    const linkedinTabs = allTabs.filter(tab =>
      tab.url?.includes("linkedin.com") &&
      !tab.url?.includes("linkedin.com/in/#")
    );

    console.log("🔍 Found", linkedinTabs.length, "LinkedIn tabs");

    if (linkedinTabs.length === 0) {
      sendResponse({
        success: false,
        error: "Please navigate to a LinkedIn page first."
      });
      return;
    }

    // Use the most recent LinkedIn tab
    const linkedinTab = linkedinTabs[0];
    console.log("✅ Using LinkedIn tab:", linkedinTab.url);

    return await scrapeProfileFromTab(linkedinTab.id, sendResponse);

  } catch (err) {
    console.error("❌ Error getting profile:", err);
    sendResponse({
      success: false,
      error: "Failed to read profile. Make sure you're on a LinkedIn profile page."
    });
  }
}

/**
 * Helper function to scrape profile from a specific tab
 */
async function scrapeProfileFromTab(tabId, sendResponse) {
  try {
    console.log("📨 Testing content script on tab", tabId, "...");

    // First, send a PING to test if content script is alive
    try {
      const pingResponse = await chrome.tabs.sendMessage(tabId, {
        type: "PING",
      });
      console.log("🏓 PING successful:", pingResponse);
    } catch (pingErr) {
      console.log("⚠️ PING failed, content script not loaded:", pingErr.message);
      console.log("🔄 Attempting to inject content script...");

      // Content script not loaded, inject it
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });

      console.log("✅ Content script injected, waiting for initialization...");
      // Wait for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("📨 Sending GET_PROFILE message to tab", tabId, "...");
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "GET_PROFILE",
    });

    console.log("📨 Received response:", response);
    sendResponse(response);
  } catch (err) {
    console.error("❌ Could not communicate with content script:", err.message);
    sendResponse({
      success: false,
      error: "Could not connect to LinkedIn page. Please refresh the page and try again."
    });
  }
}

/**
 * Call the Next.js /api/generate endpoint
 */
async function generateMessage(payload, sendResponse) {
  try {
    const token = await getStoredToken();

    const response = await fetch(`${API_BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      sendResponse({
        success: false,
        error: err.error || `Server error: ${response.status}`,
        statusCode: response.status,
      });
      return;
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      const data = await response.json();
      sendResponse({ success: true, message: data.message });
      return;
    }

    let fullMessage = "";
    let streamError = null;
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              streamError = parsed.error;
              continue;
            }
            if (parsed.delta) {
              fullMessage += parsed.delta;
              // Send streaming update to popup
              chrome.runtime
                .sendMessage({
                  type: "STREAM_UPDATE",
                  delta: parsed.delta,
                  fullMessage,
                })
                .catch(() => {}); // Popup may be closed
            }
          } catch {}
        }
      }
    }

    if (streamError) {
      sendResponse({ success: false, error: streamError });
      return;
    }

    sendResponse({ success: true, message: fullMessage });
  } catch (err) {
    console.error("Generation error:", err);
    sendResponse({
      success: false,
      error: "Network error. Check your connection."
    });
  }
}

/**
 * Call the Next.js /api/leads endpoint to save a lead
 * FIXED: Properly handles profile data and API response
 */
async function saveLead(payload, sendResponse) {
  try {
    const token = await getStoredToken();

    if (!token) {
      sendResponse({ success: false, error: "Please sign in first" });
      return;
    }

    const { profile, message, tone, tags, roleTag, leadStatus } = payload;

    if (!profile || !profile.name) {
      sendResponse({ success: false, error: "Invalid profile data" });
      return;
    }

    console.log("💾 Saving lead:", profile.name);

    const finalTags = Array.isArray(tags) ? tags : (Array.isArray(profile.tags) ? profile.tags : []);

    const response = await fetch(`${API_BASE_URL}/api/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        profile: {
          name: profile.name,
          title: profile.title || "",
          company: profile.company || "",
          location: profile.location || "",
          about: profile.about || "",
          profileUrl: profile.profileUrl || profile.linkedinUrl || "",
          photoUrl: profile.photoUrl || "",
          email: profile.email || "",
          phone: profile.phone || "",
          website: profile.website || "",
        },
        tags: finalTags,
        roleTag: roleTag || "",
        leadStatus: leadStatus || "",
        message: message || "",
        tone: tone || "professional",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Save lead error:", data);
      sendResponse({ success: false, error: data.error || "Failed to save lead" });
      return;
    }

    console.log("✅ Lead saved successfully:", data);
    sendResponse({ success: true, lead: data.lead });
  } catch (err) {
    console.error("Save lead exception:", err);
    sendResponse({ success: false, error: "Failed to save lead." });
  }
}

/**
 * Insert a message into the LinkedIn tab
 */
async function insertMessageInTab(text, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      sendResponse({ success: false, error: "No active tab" });
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "INSERT_MESSAGE",
      text,
    });

    sendResponse(response || { success: false, error: "No response from content script" });
  } catch (err) {
    console.error("Insert message error:", err);
    sendResponse({ success: false, error: "Could not insert message." });
  }
}

// ---- Auth Token Helpers ----

async function getStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["authToken"], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Storage read error:", chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve(result.authToken || null);
    });
  });
}

function getAuthToken(sendResponse) {
  chrome.storage.local.get(["authToken", "userEmail"], (result) => {
    if (chrome.runtime.lastError) {
      console.error("GET_AUTH_TOKEN storage error:", chrome.runtime.lastError);
      sendResponse({ token: null, email: null, error: chrome.runtime.lastError.message });
      return;
    }
    console.log("GET_AUTH_TOKEN:", result.authToken ? "token exists" : "no token");
    sendResponse({
      token: result.authToken || null,
      email: result.userEmail || null,
    });
  });
}

function setAuthToken(token, sendResponse) {
  chrome.storage.local.set({ authToken: token }, () => {
    if (chrome.runtime.lastError) {
      console.error("SET_AUTH_TOKEN storage error:", chrome.runtime.lastError);
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    console.log("SET_AUTH_TOKEN: token saved");
    sendResponse({ success: true });
  });
}

function clearAuthToken(sendResponse) {
  chrome.storage.local.remove(["authToken", "userEmail"], () => {
    if (chrome.runtime.lastError) {
      console.error("CLEAR_AUTH_TOKEN storage error:", chrome.runtime.lastError);
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    console.log("CLEAR_AUTH_TOKEN: token removed");
    sendResponse({ success: true });
  });
}
