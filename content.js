// content.js - Injected into linkedin.com/pages
// Scrapes profile data and communicates with popup via background service worker
// IMPROVED: Multi-strategy scraping, JSON-LD support, contact info extraction

(function () {
  "use strict";

  console.log("✅ LinkedIn AI Outreach content script loaded (improved v2)");
  console.log("📍 Current page:", window.location.href);

  // ─── Utility: wait for element ───
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // ─── Utility: XPath query ───
  function $x(path) {
    const results = [];
    const query = document.evaluate(path, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < query.snapshotLength; i++) {
      results.push(query.snapshotItem(i));
    }
    return results;
  }

  // ─── Utility: get text from element ───
  function getText(el) {
    return el?.innerText?.trim() || el?.textContent?.trim() || "";
  }

  // ─── Strategy 1: JSON-LD Structured Data ───
  // LinkedIn embeds rich structured data that is very reliable
  function scrapeFromJSONLD() {
    const profile = { name: "", title: "", company: "", location: "", about: "", photoUrl: "", email: "", phone: "" };
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        let data;
        try { data = JSON.parse(script.innerText); } catch { continue; }

        // Handle both single object and @graph arrays
        const graphs = Array.isArray(data["@graph"]) ? data["@graph"] : [data];

        for (const item of graphs) {
          if (item["@type"] === "Person" || (Array.isArray(item["@type"]) && item["@type"].includes("Person"))) {
            profile.name = item.name || "";
            profile.photoUrl = item.image?.contentUrl || item.image?.url || "";

            // Job title / worksFor
            if (item.jobTitle) profile.title = item.jobTitle;
            if (item.worksFor?.name) profile.company = item.worksFor.name;

            // Location
            if (item.address?.addressLocality) {
              profile.location = item.address.addressLocality;
              if (item.address.addressCountry) profile.location += ", " + item.address.addressCountry;
            }

            // Contact info (rarely present in JSON-LD)
            if (item.email) profile.email = item.email;
            if (item.telephone) profile.phone = item.telephone;

            // Description / about
            if (item.description) profile.about = item.description;
          }
        }
      }
    } catch (e) {
      console.log("JSON-LD parsing error:", e);
    }
    return profile;
  }

  // ─── Strategy 2: Meta tags ───
  function scrapeFromMeta() {
    const profile = { name: "", title: "", photoUrl: "" };
    try {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle?.content) profile.name = ogTitle.content.split(" - ")[0].trim();

      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage?.content) profile.photoUrl = ogImage.content;

      const titleTag = document.querySelector('title');
      if (titleTag?.innerText) {
        const parts = titleTag.innerText.split(" - ");
        if (parts[0] && !profile.name) profile.name = parts[0].trim();
        if (parts[1] && !profile.title) profile.title = parts[1].trim();
      }
    } catch (e) {
      console.log("Meta scraping error:", e);
    }
    return profile;
  }

  // ─── Strategy 3: DOM selectors (multi-fallback) ───
  function scrapeFromDOM() {
    const profile = { name: "", title: "", company: "", location: "", about: "", photoUrl: "" };

    try {
      // --- NAME ---
      // Try h1 first (most reliable for name)
      const h1 = document.querySelector("h1");
      if (h1) {
        profile.name = getText(h1);
        console.log("✅ Name from h1:", profile.name);
      }

      // Fallback name selectors
      if (!profile.name) {
        const nameSelectors = [
          "[data-test-id='person-name']",
          ".top-card-layout__title",
          ".profile-topcard__name",
          ".pv-top-card--list .text-heading-xlarge",
          ".text-heading-xlarge",
          "[class*='artdeco-entity-lockup__title']",
          "span[aria-label*='name']",
          // 2024-2025 patterns
          "div[class*='profile-card'] h1",
          "section[class*='top-card'] h1",
        ];
        for (const sel of nameSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = getText(el);
            if (text && text.length > 1 && text.length < 100) {
              profile.name = text;
              console.log("✅ Name from fallback:", profile.name, "selector:", sel);
              break;
            }
          }
        }
      }

      // --- TOP CARD SCOPE ---
      const topCard = document.querySelector(
        ".pv-top-card, .top-card-layout, .profile-topcard, [data-test-id='profile-topcard'], section.top-card-layout, div[class*='top-card']"
      );
      const scope = topCard || document;

      // --- TITLE / HEADLINE ---
      const titleSelectors = [
        "[data-test-id='person-headline']",
        ".top-card-layout__headline",
        ".profile-topcard__headline",
        ".text-body-medium.break-words",
        "div[class*='headline']",
        "[class*='artdeco-entity-lockup__subtitle']",
        // XPath: div immediately after h1 inside same parent
      ];
      for (const sel of titleSelectors) {
        const el = scope.querySelector(sel);
        if (el) {
          const text = getText(el);
          if (text && text.length > 2 && text.length < 300 && text !== profile.name) {
            profile.title = text;
            console.log("✅ Title from selector:", profile.title, "selector:", sel);
            break;
          }
        }
      }

      // Try sibling-of-h1 approach
      if (!profile.title && h1) {
        const parent = h1.parentElement;
        if (parent) {
          const siblings = parent.querySelectorAll("div, span");
          for (const sib of siblings) {
            if (sib === h1) continue;
            const text = getText(sib);
            if (text && text.length > 5 && text.length < 300 && text !== profile.name && !text.includes("Connection")) {
              profile.title = text;
              console.log("✅ Title from sibling:", profile.title);
              break;
            }
          }
        }
      }

      // --- COMPANY ---
      const companySelectors = [
        "button[aria-label*='Current company']",
        "a[aria-label*='Current company']",
        "[data-test-id='current-company']",
        ".top-card-layout__first-subline",
        "span[class*='company-name']",
        "[class*='artdeco-entity-lockup__subtitle']",
      ];
      for (const sel of companySelectors) {
        const el = scope.querySelector(sel);
        if (el) {
          const text = getText(el);
          const aria = el.getAttribute("aria-label") || "";
          const match = aria.match(/Current company[\s:]*(.+)/i);
          if (match) {
            profile.company = match[1].trim();
            console.log("✅ Company from aria-label:", profile.company);
            break;
          }
          if (text && text.length > 1 && text.length < 150 && text !== profile.name && text !== profile.title) {
            profile.company = text;
            console.log("✅ Company from text:", profile.company, "selector:", sel);
            break;
          }
        }
      }

      // Fallback: first experience item
      if (!profile.company) {
        const expSection = document.querySelector("#experience, section[data-section='experience'], div[id*='experience']");
        if (expSection) {
          const firstItem = expSection.querySelector("li, .experience-item, [data-test-id='experience-item'], div[class*='experience']");
          if (firstItem) {
            const companyEl = firstItem.querySelector(
              ".t-14.t-normal, .pv-entity__secondary-title, span[class*='company'], [data-anonymize='company-name'], span[class*='subtitle']"
            );
            if (companyEl) {
              const text = getText(companyEl);
              if (text && text.length < 150) {
                profile.company = text;
                console.log("✅ Company from experience:", profile.company);
              }
            }
          }
        }
      }

      // --- LOCATION ---
      const locationSelectors = [
        "[data-test-id='person-location']",
        ".top-card-layout__first-subline",
        ".profile-topcard__location",
        ".text-body-small.inline.t-black--light.break-words",
        "[data-anonymize='location']",
        "span[class*='location']",
      ];
      for (const sel of locationSelectors) {
        const el = scope.querySelector(sel);
        if (el) {
          const text = getText(el);
          if (text && /^[A-Za-z0-9\s,\.()-]+$/.test(text) && text.length < 100) {
            profile.location = text;
            break;
          }
        }
      }

      // --- ABOUT ---
      const aboutSection = document.querySelector("#about, section[data-section='summary'], div[id*='about']");
      if (aboutSection) {
        const aboutSelectors = [
          ".inline-show-more-text",
          ".pv-shared-text-with-see-more",
          "span[aria-hidden='true']",
          ".visually-hidden",
          "div[class*='about'] p",
          "div[class*='summary'] p",
        ];
        for (const sel of aboutSelectors) {
          const el = aboutSection.querySelector(sel);
          if (el) {
            const text = getText(el);
            if (text && text.length > 10) {
              profile.about = text.slice(0, 800);
              break;
            }
          }
        }
      }

      // --- PHOTO ---
      const photoSelectors = [
        ".pv-top-card-profile-picture__image",
        "img[class*='profile-photo']",
        "img[class*='top-card__photo']",
        ".profile-photo-edit__preview",
        "[data-test-id='profile-photo'] img",
        ".top-card-layout__entity-image",
      ];
      for (const sel of photoSelectors) {
        const el = scope.querySelector(sel);
        if (el?.src) {
          profile.photoUrl = el.src;
          break;
        }
      }
      // Fallback: any reasonably-sized image in top card
      if (!profile.photoUrl && topCard) {
        const imgs = topCard.querySelectorAll("img");
        for (const img of imgs) {
          const rect = img.getBoundingClientRect();
          if (rect.width >= 80 && rect.width <= 400 && rect.height >= 80 && rect.height <= 400 && img.src) {
            profile.photoUrl = img.src;
            break;
          }
        }
      }

    } catch (e) {
      console.error("DOM scraping error:", e);
    }

    return profile;
  }

  // ─── Strategy 3b: Obfuscated / Hashed Class Names (LinkedIn 2024-2025) ───
  // LinkedIn uses CSS Modules with hashed class names like _12a7eae6.
  // We detect fields by text heuristics instead of class names.
  function scrapeFromObfuscated() {
    const profile = { name: "", title: "", company: "", location: "" };
    try {
      const topCard = document.querySelector(
        ".pv-top-card, .top-card-layout, .profile-topcard, [data-test-id='profile-topcard'], section.top-card-layout, div[class*='top-card']"
      );
      const scope = topCard || document.body;

      // Gather all <p> tags inside the top card (LinkedIn often uses <p> for text blocks)
      const allP = Array.from(scope.querySelectorAll("p"));
      const texts = allP.map(el => ({
        el,
        text: getText(el),
        len: getText(el).length,
      })).filter(t => t.len > 2 && t.len < 400);

      // --- NAME ---
      const h1 = document.querySelector("h1");
      if (h1) profile.name = getText(h1);

      // --- COMPANY: text containing "·" (middle dot / separator) ---
      const companyCandidate = texts.find(t => t.text.includes("·") || t.text.includes("|"));
      if (companyCandidate) {
        profile.company = companyCandidate.text;
      }

      // --- TITLE: the longest <p> that is NOT the name and NOT the company ---
      const titleCandidates = texts
        .filter(t => t.text !== profile.name && t.text !== profile.company && t.len > 15 && t.len < 350)
        .sort((a, b) => b.len - a.len);
      if (titleCandidates.length > 0) {
        profile.title = titleCandidates[0].text;
      }

      // --- LOCATION: look for City, Country / City, State patterns ---
      const locationCandidate = texts.find(t => {
        const txt = t.text;
        return /^[A-Za-z\s]+,\s*[A-Za-z\s]+$/.test(txt) && txt.length < 80 && txt !== profile.name;
      });
      if (locationCandidate) {
        profile.location = locationCandidate.text;
      }

      console.log("📊 Obfuscated-class profile:", profile);
    } catch (e) {
      console.log("Obfuscated scraping error:", e);
    }
    return profile;
  }

  // ─── Strategy 4: ARIA labels ───
  function scrapeFromARIA() {
    const profile = { title: "", company: "", location: "" };
    try {
      const all = Array.from(document.querySelectorAll("*[aria-label]"));
      const labels = all.map(el => ({
        label: (el.getAttribute("aria-label") || "").toLowerCase(),
        text: getText(el),
      }));

      const headline = labels.find(l => l.label.includes("headline") || l.label.includes("title") || l.label.includes("current position"));
      if (headline?.text) profile.title = headline.text;

      const company = labels.find(l => l.label.includes("current company") || l.label.includes("company"));
      if (company?.text) profile.company = company.text;

      const location = labels.find(l => l.label.includes("location") || l.label.includes("area") || l.label.includes("region"));
      if (location?.text) profile.location = location.text;
    } catch (e) {
      console.log("ARIA scraping error:", e);
    }
    return profile;
  }

  // ─── Strategy 5: LinkedIn embedded `window.__data` or inline scripts ───
  function scrapeFromInlineData() {
    const profile = { name: "", title: "", company: "", location: "", photoUrl: "" };
    try {
      // Some LinkedIn pages embed initial data in script tags
      const scripts = document.querySelectorAll("script:not([src])");
      for (const script of scripts) {
        const text = script.innerText;
        if (text.includes("firstName") && text.includes("lastName")) {
          const firstMatch = text.match(/"firstName"\s*:\s*"([^"]+)"/);
          const lastMatch = text.match(/"lastName"\s*:\s*"([^"]+)"/);
          if (firstMatch && lastMatch) {
            profile.name = `${firstMatch[1]} ${lastMatch[1]}`.trim();
          }
          const titleMatch = text.match(/"headline"\s*:\s*"([^"]+)"/);
          if (titleMatch) profile.title = titleMatch[1];
          const locMatch = text.match(/"locationName"\s*:\s*"([^"]+)"/);
          if (locMatch) profile.location = locMatch[1];
          const imgMatch = text.match(/"profilePicture"[^}]*"displayImage"\s*:\s*"([^"]+)"/);
          if (imgMatch) profile.photoUrl = imgMatch[1];
          break;
        }
      }
    } catch (e) {
      console.log("Inline data scraping error:", e);
    }
    return profile;
  }

  // ─── Contact Info Extraction ───
  // LinkedIn hides email/phone behind a "Contact info" modal.
  async function extractContactInfo() {
    const result = { email: "", phone: "", website: "" };
    try {
      // Check if contact info section is already open/visible
      const contactSection = document.querySelector(".pv-contact-info, [data-test-id='contact-info'], div[class*='contact-info']");
      if (contactSection) {
        const emailLink = contactSection.querySelector('a[href^="mailto:"]');
        if (emailLink) result.email = emailLink.href.replace("mailto:", "");
        const phoneLink = contactSection.querySelector('a[href^="tel:"]');
        if (phoneLink) result.phone = phoneLink.href.replace("tel:", "");
        const webLink = contactSection.querySelector('a[href^="http"]');
        if (webLink) result.website = webLink.href;
        return result;
      }

      // Try to find and click "Contact info" button
      const contactBtnSelectors = [
        "button[aria-label*='Contact info']",
        "a[aria-label*='Contact info']",
        "button[aria-label*='contact information']",
        "a[href*='overlay/contact-info']",
        "button[id*='contact-info']",
      ];

      let contactBtn = null;
      for (const sel of contactBtnSelectors) {
        contactBtn = document.querySelector(sel);
        if (contactBtn) break;
      }

      // Try finding by text content
      if (!contactBtn) {
        const allBtns = document.querySelectorAll("button, a");
        for (const btn of allBtns) {
          const text = getText(btn).toLowerCase();
          if (text === "contact info" || text.includes("contact information")) {
            contactBtn = btn;
            break;
          }
        }
      }

      if (contactBtn) {
        console.log("📇 Clicking Contact info button...");
        contactBtn.click();
        // Wait for modal to appear
        await new Promise(r => setTimeout(r, 1200));

        const modal = document.querySelector(
          ".pv-contact-info, [data-test-id='contact-info'], div[role='dialog'] div[class*='contact'], .artdeco-modal__content"
        );
        if (modal) {
          // Email
          const emailEl = modal.querySelector('a[href^="mailto:"]');
          if (emailEl) result.email = emailEl.href.replace("mailto:", "");

          // Phone
          const phoneEl = modal.querySelector('a[href^="tel:"]');
          if (phoneEl) result.phone = phoneEl.href.replace("tel:", "");

          // Website
          const webEl = modal.querySelector('a[href^="http"]:not([href*="linkedin.com"])');
          if (webEl) result.website = webEl.href;

          // Also try text-based extraction
          const sections = modal.querySelectorAll('section, div[class*="contact-info__"]');
          for (const sec of sections) {
            const header = sec.querySelector("h3, .pv-contact-info__header");
            const valueEl = sec.querySelector("a, span, .pv-contact-info__ci-container");
            if (header && valueEl) {
              const headerText = getText(header).toLowerCase();
              const value = getText(valueEl);
              if (headerText.includes("email") && !result.email) result.email = value;
              if (headerText.includes("phone") && !result.phone) result.phone = value;
              if (headerText.includes("website") && !result.website) result.website = value;
            }
          }

          // Close modal
          const closeBtn = document.querySelector("button[aria-label='Dismiss'], .artdeco-modal__dismiss, button[class*='dismiss']");
          if (closeBtn) closeBtn.click();
        }
      }
    } catch (e) {
      console.error("Contact info extraction error:", e);
    }
    return result;
  }

  // ─── Merge profiles (non-empty values win) ───
  function mergeProfiles(...profiles) {
    const merged = {
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
      website: "",
    };
    for (const p of profiles) {
      if (!p) continue;
      for (const key of Object.keys(merged)) {
        if (p[key] && String(p[key]).trim().length > 0) {
          merged[key] = String(p[key]).trim();
        }
      }
    }
    return merged;
  }

  // ─── Main scrape function ───
  async function scrapeProfileData() {
    console.log("🔍 Starting improved profile scrape...");

    // Run all strategies in parallel
    const [jsonld, meta, dom, obf, aria, inline] = await Promise.all([
      Promise.resolve(scrapeFromJSONLD()),
      Promise.resolve(scrapeFromMeta()),
      Promise.resolve(scrapeFromDOM()),
      Promise.resolve(scrapeFromObfuscated()),
      Promise.resolve(scrapeFromARIA()),
      Promise.resolve(scrapeFromInlineData()),
    ]);

    console.log("📊 JSON-LD:", jsonld);
    console.log("📊 Meta:", meta);
    console.log("📊 DOM:", dom);
    console.log("📊 Obfuscated:", obf);
    console.log("📊 ARIA:", aria);
    console.log("📊 Inline:", inline);

    let profile = mergeProfiles(jsonld, inline, dom, obf, aria, meta);

    // Try to extract contact info (email/phone)
    console.log("📇 Attempting contact info extraction...");
    const contact = await extractContactInfo();
    console.log("📊 Contact info:", contact);
    profile = mergeProfiles(profile, contact);

    // Clean up name if it contains pipe or dash separators
    if (profile.name) {
      profile.name = profile.name.split("|")[0].split(" - ")[0].trim();
    }

    // Ensure URL is clean
    try {
      const url = new URL(window.location.href);
      profile.profileUrl = url.origin + url.pathname;
      profile.linkedinUrl = profile.profileUrl;
    } catch {}

    console.log("✅ Final scraped profile:", profile);
    return profile;
  }

  // ─── Check if profile page ───
  function isProfilePage() {
    return /linkedin\.com\/in\//.test(window.location.href);
  }

  // ─── Message listener ───
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📨 Content script received:", message.type);

    if (message.type === "PING") {
      sendResponse({ type: "PONG", status: "alive", url: window.location.href });
      return true;
    }

    (async () => {
      try {
        if (message.type === "GET_PROFILE") {
          if (!isProfilePage()) {
            sendResponse({
              success: false,
              error: "Not a LinkedIn profile page. Navigate to a profile first.",
            });
            return;
          }

          const profileData = await scrapeProfileData();

          if (!profileData.name || profileData.name.length < 2) {
            sendResponse({
              success: false,
              error: "Could not extract profile name. Please refresh the page and try again.",
              debug: {
                url: window.location.href,
                h1: Array.from(document.querySelectorAll("h1")).map(h => getText(h)),
                title: document.title,
              }
            });
            return;
          }

          sendResponse({ success: true, profile: profileData });
        } else if (message.type === "INSERT_MESSAGE") {
          insertMessageIntoLinkedIn(message.text);
          sendResponse({ success: true });
        } else if (message.type === "INIT_BULK_CAPTURE") {
          await handleBulkCaptureMsg(sendResponse);
        } else {
          console.log("Ignoring unknown message type:", message.type);
        }
      } catch (error) {
        console.error("❌ Error handling message:", error);
        sendResponse({ success: false, error: error.message || "Unknown error" });
      }
    })();

    return true;
  });

  // ─── Insert message into LinkedIn ───
  function insertMessageIntoLinkedIn(text) {
    console.log("📝 Inserting message...");
    const selectors = [
      ".msg-form__contenteditable",
      '[data-placeholder="Write a message…"]',
      ".msg-form__msg-content-container--is-empty p",
      ".mentions-inputum__contenteditable",
      "div[contenteditable='true'][role='textbox']",
    ];

    let msgInput = null;
    for (const sel of selectors) {
      msgInput = document.querySelector(sel);
      if (msgInput) break;
    }

    if (msgInput) {
      try {
        msgInput.focus();
        msgInput.innerHTML = text.replace(/\n/g, "<br>");
        try {
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, text);
        } catch {}
        const events = [
          new Event("input", { bubbles: true }),
          new Event("change", { bubbles: true }),
          new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
          new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }),
        ];
        events.forEach(e => msgInput.dispatchEvent(e));
        showToast("✨ Message inserted!");
      } catch (error) {
        console.error("Insert error:", error);
        showToast("Error inserting message.");
      }
    } else {
      navigator.clipboard?.writeText(text).then(() => {
        showToast("Message copied! Paste it into LinkedIn.");
      }).catch(() => showCopyModal(text));
    }
  }

  // ─── Copy modal ───
  function showCopyModal(text) {
    const modal = document.createElement("div");
    modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:999999;`;
    modal.innerHTML = `
      <div style="background:white;border-radius:12px;padding:24px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;color:#333;">
        <h3 style="margin:0 0 16px 0;color:#0a66c2;">📧 Your Generated Message</h3>
        <div style="background:#f3f6f8;padding:16px;border-radius:8px;white-space:pre-wrap;margin:16px 0;font-size:14px;line-height:1.6;">${text.replace(/</g, "&lt;")}</div>
        <button id="copy-msg-btn" style="background:#0a66c2;color:white;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:100%;">Copy Message</button>
        <button id="close-msg-btn" style="background:transparent;color:#666;border:1px solid #ddd;padding:12px 24px;border-radius:8px;font-size:14px;cursor:pointer;width:100%;margin-top:8px;">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector("#copy-msg-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(text).then(() => {
        modal.querySelector("#copy-msg-btn").textContent = "✓ Copied!";
      });
    });
    modal.querySelector("#close-msg-btn").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  }

  // ─── Toast ───
  function showToast(message) {
    const toast = document.createElement("div");
    toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:#0a66c2;color:white;padding:12px 20px;border-radius:8px;font-family:-apple-system,sans-serif;font-size:14px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ─── Debug helper ───
  window.testLinkedInScraper = async function () {
    console.log("🧪 Testing LinkedIn scraper...");
    if (!isProfilePage()) {
      console.error("❌ Not a LinkedIn profile page");
      return null;
    }
    const profile = await scrapeProfileData();
    console.log("📊 Result:", profile);
    return profile;
  };

  // ═══════════════════════════════════════════════════════════════
  // BULK LEADS CAPTURE — Scrape search results for popup display
  // ═══════════════════════════════════════════════════════════════

  const SEARCH_CARD_SELECTOR = [
    ".reusable-search__result-container",
    'li[data-occludable-job-id]',
    '[data-view-name="search-entity-result"]',
    ".entity-result",
    "li.search-result",
    ".search-result__wrapper",
    ".search-results__list-item",
    "div[class*='search-entity']",
  ].join(",");

  function isSearchResultsPage() {
    const path = window.location.pathname || "";
    const host = window.location.hostname || "";
    return (
      (host === "linkedin.com" || host.endsWith(".linkedin.com")) &&
      (
        path.includes("/search/results/people") ||
        path.includes("/search/results/people/") ||
        path.includes("/sales/search/people") ||
        path.includes("/recruiter/search") ||
        path.includes("/search/results/all")
      )
    );
  }

  function waitForSearchResults(timeout) {
    timeout = timeout || 8000;
    return new Promise(function (resolve) {
      var existing = document.querySelector(
        ".reusable-search__result-container, .entity-result, [data-view-name='search-entity-result'], .search-result__wrapper, .search-results__list-item"
      );
      if (existing) return resolve(true);
      var observer = new MutationObserver(function () {
        var el = document.querySelector(
          ".reusable-search__result-container, .entity-result, [data-view-name='search-entity-result'], .search-result__wrapper, .search-results__list-item"
        );
        if (el) {
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () {
        observer.disconnect();
        resolve(false);
      }, timeout);
    });
  }

  function extractLeadFromCard(card) {
    try {
      var name = "";
      var title = "";
      var company = "";
      var location = "";
      var profileUrl = "";
      var photoUrl = "";

      var nameSelectors = [
        ".entity-result__title-text a span[aria-hidden='true']",
        ".entity-result__title-text a span",
        ".app-aware-link span[aria-hidden='true']",
        "a[href*='/in/'] span:first-child",
        ".actor-name",
        '[data-anonymize="person-name"]',
        ".search-result__result-link span",
      ];
      for (var i = 0; i < nameSelectors.length; i++) {
        var el = card.querySelector(nameSelectors[i]);
        if (el && el.textContent.trim()) {
          name = el.textContent.trim();
          break;
        }
      }
      if (!name) {
        var link = card.querySelector('a[href*="/in/"]');
        if (link) name = link.textContent.trim();
      }

      var titleSelectors = [
        ".entity-result__primary-subtitle",
        '[data-anonymize="headline"]',
        ".search-result__info .subline-level-1",
        ".entity-result__summary",
      ];
      for (var i = 0; i < titleSelectors.length; i++) {
        var el = card.querySelector(titleSelectors[i]);
        if (el) {
          var txt = el.textContent.trim();
          if (txt && txt.length < 300) { title = txt; break; }
        }
      }

      var companySelectors = [
        ".entity-result__secondary-subtitle",
        ".entity-result__subtitle",
        '[data-anonymize="company-name"]',
        ".entity-result__summary-item",
      ];
      for (var i = 0; i < companySelectors.length; i++) {
        var el = card.querySelector(companySelectors[i]);
        if (el) {
          var txt = el.textContent.trim();
          if (txt && txt.length < 150) { company = txt; break; }
        }
      }

      var locationSelectors = [
        ".entity-result__tertiary-subtitle",
        '[data-anonymize="location"]',
        ".entity-result__caption",
      ];
      for (var i = 0; i < locationSelectors.length; i++) {
        var el = card.querySelector(locationSelectors[i]);
        if (el) {
          var txt = el.textContent.trim();
          if (txt && /^[A-Za-z0-9\s,.\-()]+$/.test(txt) && txt.length < 100) { location = txt; break; }
        }
      }

      var linkEl = card.querySelector('a[href*="/in/"], a[href*="/sales/people/"], a[href*="/pub/"], a[href*="/profile/"]');
      if (linkEl) {
        var href = linkEl.getAttribute("href");
        if (href) {
          var url = href.startsWith("http") ? href : "https://www.linkedin.com" + href;
          profileUrl = url.split("?")[0].split("#")[0];
        }
      }
      if (!profileUrl) {
        var anyLink = card.querySelector('a[href*="/in/"], a[href*="/sales/people/"], a[href*="/pub/"], a[href*="/profile/"]');
        if (anyLink) {
          var href = anyLink.getAttribute("href");
          if (href) {
            var url = href.startsWith("http") ? href : "https://www.linkedin.com" + href;
            profileUrl = url.split("?")[0].split("#")[0];
          }
        }
      }

      var imgSelectors = [
        "img[src*='licdn.com']",
        "img.EntityPhoto",
        "img[class*='EntityPhoto']",
        "li.reusable-search__result-container img",
      ];
      for (var i = 0; i < imgSelectors.length; i++) {
        var el = card.querySelector(imgSelectors[i]);
        if (el && el.src) { photoUrl = el.src; break; }
      }

      if (!name || !profileUrl) return null;

      if (!company && title) {
        var atMatch = title.match(/\s+at\s+(.+)/i);
        if (atMatch) {
          company = atMatch[1].trim();
          title = title.replace(/\s+at\s+.+$/i, "").trim();
        }
      }

      return { name: name, title: title, company: company, location: location, profileUrl: profileUrl, photoUrl: photoUrl };
    } catch (e) {
      return null;
    }
  }

  function scrapeAllSearchResults() {
    var leads = [];
    var cards = document.querySelectorAll(SEARCH_CARD_SELECTOR);
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.closest(".artdeco-pagination")) continue;
      if (card.querySelector(".artdeco-pagination")) continue;
      if (card.innerText.includes("Show more results")) continue;
      var lead = extractLeadFromCard(card);
      if (lead) leads.push(lead);
    }
    return leads;
  }

  async function handleBulkCaptureMsg(sendResponse) {
    try {
      console.log("[BulkCapture] url=", window.location.href);
      console.log("[BulkCapture] search page=", isSearchResultsPage());

      if (!isSearchResultsPage()) {
        sendResponse({
          success: false,
          error: "Not on a LinkedIn search results page. Current URL: " + window.location.href,
        });
        return;
      }

      var loaded = await waitForSearchResults(8000);
      console.log("[BulkCapture] results loaded=", loaded);
      if (!loaded) {
        sendResponse({ success: false, error: "Could not find search results on this page." });
        return;
      }

      var leads = scrapeAllSearchResults();
      console.log("[BulkCapture] found leads=", leads.length);
      sendResponse({ success: true, leads: leads, count: leads.length });
    } catch (e) {
      console.error("[BulkCapture] error", e);
      sendResponse({ success: false, error: e.message || "Unknown error" });
    }
  }
})();
