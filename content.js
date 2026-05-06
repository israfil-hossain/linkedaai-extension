// content.js - Injected into linkedin.com/pages
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
        "div[aria-label='Headline']",
        ".text-body-medium.break-words",
        ".pv-text-details__left-panel .text-body-medium",
        "div[data-generated-suggestion-target]",
        ".inline-show-more-text--is-collapsed",
        ".pv-text-details__left-panel h2",
        ".top-card-layout__first-subline",
        "h1 + div div[aria-level='2']",
        ".text-body-medium:first-child",
        ".pv-top-card--list-bullet li:first-child span[aria-hidden='true']"
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
        '[data-anonymize="company"]',
        ".experience-item .pv-entity__secondary-title",
        ".pv-text-details__right-panel",
        ".top-card-layout__second-subline span[aria-hidden='true']",
        ".pv-text-details__right-panel span[aria-hidden='true']",
        "button[aria-label*='Current company']",
        ".pv-text-details__right-panel .inline-show-more-text span",
        ".pv-text-details__right-panel .visually-hidden",
        "div[data-anonymize='company-name']",
        ".pv-text-details__left-panel + .pv-text-details__right-panel span",
        "li[aria-label*='Current company'] span[aria-hidden='true']"
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
        "span[aria-label='Location']",
        ".pv-text-details__left-panel .text-body-small",
        ".top-card-layout__first-subline span[aria-hidden='true']",
        ".mt2.relative .text-body-small",
        "div[aria-label*='Location'] span",
        ".pv-text-details__left-panel .pv-text-details__left-panel span",
        "li[aria-label*='Location'] span[aria-hidden='true']",
        ".inline-show-more-text span:last-child"
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

      // Contact Information - Phone numbers
      const phoneSelectors = [
        ".pv-text-details__right-panel .ci-phone span",
        "[data-control-name='phone']",
        'a[href^="tel:"]',
        ".pv-contact-info__contact-type.ci-phone",
        'button[aria-label*="phone"]'
      ];

      let phoneEl = null;
      foundSelector = "";

      for (const selector of phoneSelectors) {
        phoneEl = document.querySelector(selector);
        if (phoneEl?.innerText?.trim() || phoneEl?.href) {
          foundSelector = selector;
          console.log("✅ Found phone with selector:", selector);
          break;
        }
      }

      profile.phone = phoneEl?.innerText?.trim() || phoneEl?.href?.replace("tel:", "") || "";
      console.log("📞 Phone:", profile.phone || "NOT FOUND");
      console.log("🔍 Used selector:", foundSelector || "none");

      // Contact Information - Email addresses
      const emailSelectors = [
        ".pv-text-details__right-panel .ci-email span",
        "[data-control-name='email']",
        'a[href^="mailto:"]',
        ".pv-contact-info__contact-type.ci-email",
        'button[aria-label*="email"]'
      ];

      let emailEl = null;
      foundSelector = "";

      for (const selector of emailSelectors) {
        emailEl = document.querySelector(selector);
        if (emailEl?.innerText?.trim() || emailEl?.href) {
          foundSelector = selector;
          console.log("✅ Found email with selector:", selector);
          break;
        }
      }

      profile.email = emailEl?.innerText?.trim() || emailEl?.href?.replace("mailto:", "") || "";
      console.log("📧 Email:", profile.email || "NOT FOUND");
      console.log("🔍 Used selector:", foundSelector || "none");

      // LinkedIn URL and connection status
      profile.linkedinUrl = window.location.href;
      profile.profileUrl = window.location.href; // Keep for backwards compatibility

      // Website URL
      const websiteSelectors = [
        ".pv-text-details__right-panel .ci-website span",
        'a[href^="http"]',
        "[data-control-name='website']",
        ".pv-contact-info__contact-type.ci-website"
      ];

      let websiteEl = null;
      foundSelector = "";

      for (const selector of websiteSelectors) {
        websiteEl = document.querySelector(selector);
        if (websiteEl?.href && websiteEl.href.includes("http")) {
          foundSelector = selector;
          console.log("✅ Found website with selector:", selector);
          break;
        }
      }

      profile.website = websiteEl?.href || "";
      console.log("🌐 Website:", profile.website || "NOT FOUND");
      console.log("🔍 Used selector:", foundSelector || "none");

      // About section
      const aboutSelectors = [
        "#about ~ .pvs-list__outer-container .visually-hidden",
        ".pv-shared-text-with-see-more span[aria-hidden='true']",
        "section[data-section='summary'] .pv-shared-text-with-see-more",
        ".pv-about__summary-text",
        '[data-anonymize="about"]',
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
   * Enhanced scraping method using ARIA labels and text content
   */
  function scrapeProfileByARIA() {
    console.log("🔄 Using ARIA-based scraping method...");

    const profile = {
      name: "",
      title: "",
      company: "",
      location: "",
      about: "",
      profileUrl: window.location.href,
      photoUrl: ""
    };

    try {
      // Get name from h1
      const h1 = document.querySelector("h1");
      if (h1?.innerText) {
        profile.name = h1.innerText.trim();
      }

      // Find all elements with aria-label and search for relevant ones
      const allElements = document.querySelectorAll("*[aria-label]");
      const ariaLabels = Array.from(allElements).map(el => ({
        label: el.getAttribute("aria-label"),
        text: el.innerText?.trim(),
        element: el
      }));

      console.log("🔍 Found ARIA labels:", ariaLabels.map(a => a.label));

      // Find headline/title
      const headlineAria = ariaLabels.find(a =>
        a.label?.toLowerCase().includes("headline") ||
        a.label?.toLowerCase().includes("title")
      );
      if (headlineAria?.text) {
        profile.title = headlineAria.text;
      }

      // Find company
      const companyAria = ariaLabels.find(a =>
        a.label?.toLowerCase().includes("company") ||
        a.label?.toLowerCase().includes("current company")
      );
      if (companyAria?.text) {
        profile.company = companyAria.text;
      }

      // Find location
      const locationAria = ariaLabels.find(a =>
        a.label?.toLowerCase().includes("location") ||
        a.label?.toLowerCase().includes("area")
      );
      if (locationAria?.text) {
        profile.location = locationAria.text;
      }

      console.log("📊 ARIA-based profile:", profile);
      return profile;

    } catch (error) {
      console.error("❌ Error in ARIA scraping:", error);
      return profile;
    }
  }

  /**
   * Find elements by text content matching
   */
  function findElementByText(tagName, textPattern) {
    const elements = document.querySelectorAll(tagName);
    for (const el of elements) {
      if (el.textContent && textPattern.test(el.textContent)) {
        return el;
      }
    }
    return null;
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
   * Listen for messages from the popup (via background)
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📨 Content script received message:", message.type);

    // Respond to ping messages immediately
    if (message.type === "PING") {
      console.log("🏓 PING received, sending PONG");
      sendResponse({ type: "PONG", status: "alive", url: window.location.href });
      return true;
    }

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

        // Check if we got enough data (not just name)
        const hasMinimalData = profileData.name && profileData.name.length > 1;
        const hasAdditionalData = profileData.title || profileData.company || profileData.location;

        // If main scraping only got name, try ARIA method
        if (hasMinimalData && !hasAdditionalData) {
          console.log("⚠️ Main scraping only got name, trying ARIA method...");
          const ariaData = scrapeProfileByARIA();
          console.log("📊 ARIA data:", ariaData);

          // Merge the data, prioritizing non-empty values
          profileData = {
            ...profileData,
            title: profileData.title || ariaData.title || "",
            company: profileData.company || ariaData.company || "",
            location: profileData.location || ariaData.location || "",
          };
          console.log("📊 Merged data:", profileData);
        }

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

  /**
   * Attempt to insert a message into LinkedIn's message input box
   * Enhanced with multiple selector strategies and better event handling
   */
  function insertMessageIntoLinkedIn(text) {
    console.log("📝 Attempting to insert message into LinkedIn...");

    // Try multiple selectors for LinkedIn message input
    const msgInputSelectors = [
      ".msg-form__contenteditable",                      // Primary messaging
      '[data-placeholder="Write a message…"]',         // Alternative placeholder
      ".msg-form__msg-content-container--is-empty p",   // Empty state
      ".mentions-inputum__contenteditable",             // Mentions input
      "div[contenteditable='true'][role='textbox']"    // Generic contenteditable
    ];

    let msgInput = null;
    for (const selector of msgInputSelectors) {
      msgInput = document.querySelector(selector);
      if (msgInput) {
        console.log("✅ Found message input with selector:", selector);
        break;
      }
    }

    if (msgInput) {
      try {
        // Focus the input
        msgInput.focus();

        // Clear existing content
        msgInput.innerHTML = '';

        // Use multiple methods to insert text for maximum compatibility
        // Method 1: innerHTML (for most cases)
        msgInput.innerHTML = text.replace(/\n/g, '<br>');

        // Method 2: execCommand (backup)
        try {
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, text);
        } catch (e) {
          console.log("execCommand not supported, using innerHTML");
        }

        // Method 3: Trigger multiple events to ensure React/LinkedIn detects changes
        const events = [
          new Event("input", { bubbles: true }),
          new Event("change", { bubbles: true }),
          new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }),
          new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }),
          new FocusEvent("focus", { bubbles: true }),
          new FocusEvent("blur", { bubbles: true })
        ];

        events.forEach(event => {
          msgInput.dispatchEvent(event);
        });

        console.log("✅ Message inserted successfully");
        showToast("✨ Message inserted! Ready to send.", "success");

      } catch (error) {
        console.error("❌ Error inserting message:", error);
        showToast("Error inserting message. Please paste manually.", "error");
      }

    } else {
      console.log("⚠️ No message input found on current page");

      // Fallback: Copy to clipboard
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          showToast("Message copied! Paste it into LinkedIn messaging.", "success");
        }).catch(() => {
          showToast("Please copy the message and paste it into LinkedIn.", "error");
        });
      } else {
        // Last resort: Show the message in a modal/overlay
        showCopyModal(text);
      }
    }
  }

  /**
   * Show a modal with the message for manual copying
   */
  function showCopyModal(text) {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      color: #333;
    `;

    content.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #0a66c2;">📧 Your Generated Message</h3>
      <div style="
        background: #f3f6f8;
        padding: 16px;
        border-radius: 8px;
        white-space: pre-wrap;
        margin: 16px 0;
        font-size: 14px;
        line-height: 1.6;
      ">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <button id="copy-message-btn" style="
        background: #0a66c2;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        width: 100%;
      ">Copy Message</button>
      <button id="close-modal-btn" style="
        background: transparent;
        color: #666;
        border: 1px solid #ddd;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        width: 100%;
        margin-top: 8px;
      ">Close</button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Copy functionality
    document.getElementById("copy-message-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(text).then(() => {
        document.getElementById("copy-message-btn").textContent = "✓ Copied!";
        setTimeout(() => {
          document.getElementById("copy-message-btn").textContent = "Copy Message";
        }, 2000);
      });
    });

    // Close functionality
    document.getElementById("close-modal-btn").addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
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
