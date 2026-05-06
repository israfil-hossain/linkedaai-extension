// content.js - Injected into linkedin.com/pages
// Scrapes profile data and communicates with popup via background service worker

(function () {
  "use strict";

  console.log("✅ LinkedIn AI Outreach content script loaded");
  console.log("📍 Current page:", window.location.href);
  console.log("🔍 Is profile page:", /linkedin\.com\/in\//.test(window.location.href));

  /**
   * Extract profile data from the current LinkedIn profile page DOM
   * Improved for 2024-2025 LinkedIn structure
   */
  function scrapeProfileData() {
    const profile = {
      name: "",
      title: "",
      company: "",
      location: "",
      about: "",
      profileUrl: window.location.href,
      linkedinUrl: window.location.href,
      photoUrl: "",
      email: "",
      phone: "",
      website: ""
    };

    console.log("🔍 Scraping LinkedIn profile...");

    try {
      // === NAME ===
      // LinkedIn 2024-2025: name is usually the first <h1> on the page
      const h1 = document.querySelector("h1");
      if (h1) {
        profile.name = h1.innerText?.trim() || "";
      }
      // Fallback: look for specific name classes
      if (!profile.name) {
        const nameEl = document.querySelector(".text-heading-xlarge, .inline.t-24.t-black.t-bold.break-words, [data-anonymize='person-name']");
        if (nameEl) profile.name = nameEl.innerText?.trim() || "";
      }

      // === TOP CARD AREA ===
      // Find the main profile top card to scope our searches
      const topCard = document.querySelector(
        ".pv-top-card, .top-card-layout, .profile-topcard, [data-test-id='profile-topcard']"
      );
      const scope = topCard || document.body;

      // === TITLE / HEADLINE ===
      // The headline is usually a div with class containing "text-body-medium" right after the name
      // Try to find it relative to the name element
      if (h1) {
        // Look at siblings and nearby elements
        let sibling = h1.parentElement?.nextElementSibling || h1.nextElementSibling;
        for (let i = 0; i < 3 && sibling; i++) {
          const text = sibling.innerText?.trim();
          if (text && text.length > 2 && text.length < 200 && !text.includes("Connection")) {
            profile.title = text;
            break;
          }
          sibling = sibling.nextElementSibling;
        }
      }
      // Fallback: search within top card for headline patterns
      if (!profile.title) {
        const headlineEls = scope.querySelectorAll(".text-body-medium, [data-anonymize='headline'], div[class*='headline']");
        for (const el of headlineEls) {
          const text = el.innerText?.trim();
          if (text && text.length > 2 && text.length < 200 && text !== profile.name) {
            profile.title = text;
            break;
          }
        }
      }

      // === COMPANY ===
      // Look for "Current company" aria-label or experience section
      const companyBtn = scope.querySelector("button[aria-label*='Current company'], a[aria-label*='Current company']");
      if (companyBtn) {
        profile.company = companyBtn.innerText?.trim() || companyBtn.getAttribute("aria-label")?.replace(/Current company\s*/, "") || "";
      }
      // Fallback: search for company in experience section
      if (!profile.company) {
        const expSection = document.querySelector("#experience, section[data-section='experience']");
        if (expSection) {
          const firstExp = expSection.querySelector("li, .experience-item, [data-test-id='experience-item']");
          if (firstExp) {
            const companyEl = firstExp.querySelector(".t-14.t-normal, .pv-entity__secondary-title, span[class*='company'], [data-anonymize='company-name']");
            if (companyEl) profile.company = companyEl.innerText?.trim() || "";
          }
        }
      }
      // Another fallback: look for text near the title that looks like a company
      if (!profile.company && profile.title) {
        const allSpans = scope.querySelectorAll("span, div");
        for (const el of allSpans) {
          const text = el.innerText?.trim();
          if (text && text !== profile.name && text !== profile.title && text.length > 2 && text.length < 80) {
            // Check if parent has company-related classes
            const parentClass = el.parentElement?.className || "";
            if (parentClass.includes("company") || parentClass.includes("experience") || el.closest("[data-test-id='experience-item']")) {
              profile.company = text;
              break;
            }
          }
        }
      }

      // === LOCATION ===
      const locationEl = scope.querySelector(
        ".text-body-small.inline.t-black--light.break-words, [data-anonymize='location'], span[class*='location'], .pv-top-card__distance-badge + *"
      );
      if (locationEl) {
        profile.location = locationEl.innerText?.trim() || "";
      }
      // Fallback: search for location pattern (City, State or City, Country)
      if (!profile.location) {
        const allText = scope.querySelectorAll("span, div");
        for (const el of allText) {
          const text = el.innerText?.trim();
          if (text && /^[A-Za-z\s]+,\s*[A-Za-z\s]+$/.test(text) && text.length < 60) {
            profile.location = text;
            break;
          }
        }
      }

      // === ABOUT / SUMMARY ===
      const aboutSection = document.querySelector("#about, section[data-section='summary']");
      if (aboutSection) {
        const aboutText = aboutSection.querySelector(".inline-show-more-text, .pv-shared-text-with-see-more, span[aria-hidden='true'], .visually-hidden");
        if (aboutText) {
          profile.about = aboutText.innerText?.trim()?.slice(0, 500) || "";
        }
      }

      // === PHOTO ===
      // LinkedIn 2024 uses specific image classes
      const photoEl = scope.querySelector(
        ".pv-top-card-profile-picture__image, img[class*='profile-photo'], img[class*='top-card__photo'], .profile-photo-edit__preview"
      );
      if (photoEl?.src) {
        profile.photoUrl = photoEl.src;
      }
      // Fallback: any image inside the top card that's square/circular and reasonably sized
      if (!profile.photoUrl) {
        const images = scope.querySelectorAll("img");
        for (const img of images) {
          const rect = img.getBoundingClientRect();
          if (rect.width >= 100 && rect.width <= 400 && rect.height >= 100 && rect.height <= 400 && img.src) {
            profile.photoUrl = img.src;
            break;
          }
        }
      }

      // === CONTACT INFO (email, phone, website) ===
      // These require clicking "Contact info" button, so we usually can't get them
      // But check if they're already in the DOM
      const contactSection = document.querySelector(".pv-contact-info, [data-test-id='contact-info']");
      if (contactSection) {
        const emailLink = contactSection.querySelector('a[href^="mailto:"]');
        if (emailLink) profile.email = emailLink.href.replace("mailto:", "");
        const phoneLink = contactSection.querySelector('a[href^="tel:"]');
        if (phoneLink) profile.phone = phoneLink.href.replace("tel:", "");
      }

      console.log("✅ Scraped profile:", profile);
      return profile;

    } catch (error) {
      console.error("❌ Error scraping profile:", error);
      // Return whatever we have, even if incomplete
      return profile;
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
