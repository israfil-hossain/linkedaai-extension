// content.js - Injected into linkedin.com pages
// Scrapes profile data and communicates with popup via background service worker

(function () {
  "use strict";

  console.log("✅ LinkedIn AI Outreach content script loaded");
  console.log("📍 Current page:", window.location.href);
  console.log("🔍 Is profile page:", /linkedin\.com\/in\//.test(window.location.href));

  /**
   * Extract profile data from the current LinkedIn profile page DOM
   * Updated for 2024 LinkedIn structure with comprehensive fallbacks
   */
  function scrapeProfileData() {
    const profile = {};

    console.log("🔍 Starting to scrape LinkedIn profile...");
    console.log("📍 Current URL:", window.location.href);

    try {
      // Name - Try multiple selector strategies
      const nameSelectors = [
        "h1.text-heading-xlarge",
        "h1",
        ".top-card-layout__title",
        "#profile-content h1",
        ".pv-top-card--list-bullet h1",
        ".text-heading-xlarge"
      ];

      let nameEl = null;
      let foundSelector = "";

      for (const selector of nameSelectors) {
        nameEl = document.querySelector(selector);
        if (nameEl?.innerText?.trim() && nameEl.innerText.trim().length > 1) {
          foundSelector = selector;
          console.log("✅ Found name with selector:", selector);
          break;
        }
      }

      profile.name = nameEl?.innerText?.trim() || "";
      console.log("👤 Name:", profile.name || "NOT FOUND");
      console.log("🔍 Used selector:", foundSelector || "none");

      // Title / Headline - Multiple fallback strategies
      const titleSelectors = [
        ".text-body-medium.break-words",
        ".top-card-layout__headline",
        ".pv-top-card--list-bullet .text-body-medium",
        ".headline-subtitle",
        ".text-body-medium",
        '[data-anonymize="headline"]',
        "div[aria-label='Headline']"
      ];

      let titleEl = null;
      foundSelector = "";

      for (const selector of titleSelectors) {
        titleEl = document.querySelector(selector);
        if (titleEl?.innerText?.trim() && titleEl.innerText.trim().length > 1) {
          foundSelector = selector;
          console.log("✅ Found title with selector:", selector);
          break;
        }
      }

      profile.title = titleEl?.innerText?.trim() || "";
      console.log("💼 Title:", profile.title || "NOT FOUND");
      console.log("🔍 Used selector:", foundSelector || "none");

      // Company - Try to find from experience section or current position
      const companySelectors = [
        ".pv-text-details__right-panel .hoverable-link-text",
        ".top-card-layout__second-subline .inline-show-more-text",
        ".top-card-layout__second-subline",
        ".pv-text-details__right-panel button",
        ".inline-show-more-text",
        '[data-anonymize="company"]",
        ".experience-item .pv-entity__secondary-title"
      ];

      let companyEl = null;
      foundSelector = "";

      for (const selector of companySelectors) {
        companyEl = document.querySelector(selector);
        if (companyEl?.innerText?.trim() && companyEl.innerText.trim().length > 1) {
          foundSelector = selector;
          console.log("✅ Found company with selector:", selector);
          break;
        }
      }

      profile.company = companyEl?.innerText?.trim() || "";
      console.log("🏢 Company:", profile.company || "NOT FOUND");
      console.log("🔍 Used selector:", foundSelector || "none");

      // Location
      const locationSelectors = [
        ".text-body-small.inline.t-black--light.break-words",
        ".top-card-layout__first-subline .text-body-small",
        ".pv-text-details__left-panel .pb2 span",
        ".text-body-small",
        '[data-anonymize="location"]',
        "span[aria-label='Location']"
      ];

      let locationEl = null;
      foundSelector = "";

      for (const selector of locationSelectors) {
        locationEl = document.querySelector(selector);
        if (locationEl?.innerText?.trim() && locationEl.innerText.trim().length > 1) {
          foundSelector = selector;
          console.log("✅ Found location with selector:", selector);
          break;
        }
      }

      profile.location = locationEl?.innerText?.trim() || "";
      console.log("📍 Location:", profile.location || "NOT FOUND");
      console.log("🔍 Used selector:", foundSelector || "none");

      // About section
      const aboutSelectors = [
        "#about ~ .pvs-list__outer-container .visually-hidden",
        ".pv-shared-text-with-see-more span[aria-hidden='true']",
        "section[data-section='summary'] .pv-shared-text-with-see-more",
        ".pv-about__summary-text",
        '[data-anonymize="about"]",
        "#about section span"
      ];

      let aboutEl = null;
      foundSelector = "";

      for (const selector of aboutSelectors) {
        aboutEl = document.querySelector(selector);
        if (aboutEl?.innerText?.trim() && aboutEl.innerText.trim().length > 1) {
          foundSelector = selector;
          console.log("✅ Found about with selector:", selector);
          break;
        }
      }

      profile.about = aboutEl?.innerText?.trim()?.slice(0, 500) || "";
      console.log("📝 About:", profile.about ? "FOUND" : "NOT FOUND");
      console.log("🔍 Used selector:", foundSelector || "none");

      // Profile URL
      profile.profileUrl = window.location.href;

      // Profile picture
      const photoSelectors = [
        ".pv-top-card-profile-picture__image",
        ".profile-photo-edit__preview",
        ".top-card-layout__card img",
        ".pv-top-card__photo img",
        ".profile-photo__profile-photo-container img",
        "img pv-top-card-profile-picture__image"
      ];

      let imgEl = null;
      foundSelector = "";

      for (const selector of photoSelectors) {
        imgEl = document.querySelector(selector);
        if (imgEl?.src) {
          foundSelector = selector;
          console.log("✅ Found photo with selector:", selector);
          break;
        }
      }

      profile.photoUrl = imgEl?.src || "";
      console.log("📸 Photo:", profile.photoUrl ? "FOUND" : "NOT FOUND");
      console.log("🔍 Used selector:", foundSelector || "none");

      console.log("✅ Profile scraping complete:", profile);
      return profile;

    } catch (error) {
      console.error("❌ Error scraping profile:", error);

      // Fallback: Try to get basic info from page title and meta
      console.log("🔄 Trying fallback method...");
      const fallbackProfile = {
        name: document.title?.split(" - ")[0]?.trim() || "",
        title: "",
        company: "",
        location: "",
        about: "",
        profileUrl: window.location.href,
        photoUrl: ""
      };

      console.log("📊 Fallback profile:", fallbackProfile);
      return fallbackProfile;
    }
  }

  /**
   * Alternative method: Get profile from meta tags and page structure
   */
  function scrapeProfileFromMeta() {
    console.log("🔄 Using meta tag fallback...");

    const profile = {
      name: document.title?.split(" - ")[0]?.trim() || "",
      title: "",
      company: "",
      location: "",
      about: "",
      profileUrl: window.location.href,
      photoUrl: ""
    };

    // Try og:title meta tag
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle?.content) {
      profile.name = ogTitle.content;
    }

    // Try to extract name from URL
    const urlMatch = window.location.href.match(/linkedin\.com\/in\/([^\/]+)/);
    if (urlMatch && urlMatch[1]) {
      // If we couldn't get name from title, use the URL slug as fallback
      if (!profile.name || profile.name === urlMatch[1]) {
        profile.name = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
    }

    console.log("📊 Meta-based profile:", profile);
    return profile;
  }

  /**
   * Last resort method: Try to find ANY h1 or main heading on the page
   */
  function scrapeProfileLastResort() {
    console.log("🚨 Using last resort scraping method...");

    const profile = {
      name: "",
      title: "",
      company: "",
      location: "",
      about: "",
      profileUrl: window.location.href,
      photoUrl: ""
    };

    // Try to find ANY h1 element with substantial text
    const allH1s = Array.from(document.querySelectorAll("h1"));
    for (const h1 of allH1s) {
      const text = h1.innerText?.trim();
      if (text && text.length > 2 && text.length < 100) {
        profile.name = text;
        console.log("✅ Found h1 text:", text);
        break;
      }
    }

    // Try to get name from page title
    if (!profile.name) {
      const titleText = document.title?.split(" - ")[0]?.trim();
      if (titleText && titleText.length > 2) {
        profile.name = titleText;
        console.log("✅ Using page title:", titleText);
      }
    }

    // Try to extract from URL as absolute last resort
    if (!profile.name) {
      const urlMatch = window.location.href.match(/linkedin\.com\/in\/([^\/]+)/);
      if (urlMatch && urlMatch[1]) {
        profile.name = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        console.log("✅ Using URL slug:", profile.name);
      }
    }

    console.log("📊 Last resort profile:", profile);
    return profile;
  }

  /**
   * Check if we're on a LinkedIn profile page
   */
  function isProfilePage() {
    const isProfile = /linkedin\.com\/in\//.test(window.location.href);
    console.log("🔍 isProfilePage check:", isProfile, "URL:", window.location.href);
    return isProfile;
  }

  /**
   * Simple ping/pong to test if content script is alive
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📨 Content script received message:", message.type);

    // Respond to ping messages immediately
    if (message.type === "PING") {
      console.log("🏓 PING received, sending PONG");
      sendResponse({ type: "PONG", status: "alive" });
      return true;
    }

    // Always send a response to prevent connection errors
    try {
      if (message.type === "GET_PROFILE") {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📨 Content script received message:", message.type);

    // Always send a response to prevent connection errors
    try {
      if (message.type === "GET_PROFILE") {
        console.log("🔍 GET_PROFILE request received");
        console.log("Current URL:", window.location.href);
        console.log("Is profile page:", isProfilePage());

        if (!isProfilePage()) {
          const error = "Not a LinkedIn profile page. Navigate to a profile first.";
          console.error("❌", error);
          sendResponse({
            success: false,
            error: error,
          });
          return true;
        }

        console.log("🔄 Starting to scrape profile data...");
        let profileData = scrapeProfileData();
        console.log("📊 Scraped data:", profileData);

        // If main scraping failed, try fallback method
        if (!profileData.name || profileData.name.length < 2) {
          console.log("⚠️ Main scraping failed, trying fallback...");
          profileData = scrapeProfileFromMeta();
          console.log("📊 Fallback data:", profileData);
        }

        // If fallback also failed, try last resort
        if (!profileData.name || profileData.name.length < 2) {
          console.log("⚠️ Fallback failed, trying last resort...");
          profileData = scrapeProfileLastResort();
          console.log("📊 Last resort data:", profileData);
        }

        if (!profileData.name || profileData.name.length < 2) {
          const error = "Could not extract profile data. Make sure you're on a LinkedIn profile page.";
          console.error("❌", error);
          console.log("Available DOM elements for debugging:");
          console.log("- All h1 elements:", Array.from(document.querySelectorAll("h1")).map(h => ({
            text: h.innerText?.trim(),
            className: h.className,
            id: h.id
          })));
          console.log("- Page title:", document.title);
          console.log("- URL:", window.location.href);
          sendResponse({
            success: false,
            error: error,
          });
          return true;
        }

        console.log("✅ Successfully scraped profile:", profileData.name);
        sendResponse({ success: true, profile: profileData });
        return true;
      }

      if (message.type === "INSERT_MESSAGE") {
        const messageText = message.text;
        insertMessageIntoLinkedIn(messageText);
        sendResponse({ success: true });
        return true;
      }

      // Respond to unknown messages
      console.log("⚠️ Unknown message type:", message.type);
      sendResponse({ success: false, error: "Unknown message type" });
      return true;

    } catch (error) {
      console.error("❌ Error handling message:", error);
      sendResponse({
        success: false,
        error: "Error processing message: " + error.message
      });
      return true;
    }
  });

    if (message.type === "INSERT_MESSAGE") {
      const messageText = message.text;
      insertMessageIntoLinkedIn(messageText);
      sendResponse({ success: true });
      return true;
    }
  });

  /**
   * Attempt to insert a message into LinkedIn's message input box
   */
  function insertMessageIntoLinkedIn(text) {
    // Try to find the message input area
    const msgInput =
      document.querySelector(".msg-form__contenteditable") ||
      document.querySelector('[data-placeholder="Write a message…"]') ||
      document.querySelector(".msg-form__msg-content-container--is-empty p");

    if (msgInput) {
      msgInput.focus();
      // Use execCommand for compatibility
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);

      // Trigger React synthetic events
      const event = new Event("input", { bubbles: true });
      msgInput.dispatchEvent(event);
    } else {
      // Show notification if can't find input
      showToast("Message copied! Paste it into the LinkedIn message box.");
    }
  }

  /**
   * Show a brief toast notification on the page
   */
  function showToast(message) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0a66c2;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, sans-serif;
      font-size: 14px;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: fadeIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Expose test function to console for debugging
  window.testLinkedInScraper = function() {
    console.log("🧪 Testing LinkedIn scraper...");
    console.log("Current URL:", window.location.href);
    console.log("Is profile page:", isProfilePage());

    if (!isProfilePage()) {
      console.error("❌ Not a LinkedIn profile page");
      return null;
    }

    const profile = scrapeProfileData();
    console.log("📊 Scraped profile data:", profile);

    if (!profile.name) {
      console.error("❌ Failed to extract profile name");
      console.log("Available h1 elements:", document.querySelectorAll("h1"));
      return profile;
    }

    console.log("✅ Successfully extracted profile:", profile.name);
    return profile;
  };

  console.log("💡 Test function available: window.testLinkedInScraper()");
})();
