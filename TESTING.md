# Outlye - Testing & Troubleshooting Guide

## 🔧 How to Install Updated Extension

### Step 1: Remove Old Extension
1. Go to `chrome://extensions/`
2. Find "Outlye"
3. Click **"Remove"**
4. Confirm removal

### Step 2: Install Updated Extension
1. Click **"Load unpacked"**
2. Navigate to: `/Users/israfil/Downloads/linkedin-outreach/extension`
3. Click **"Select Folder"**
4. Verify extension appears in your list

---

## 🧪 Testing Steps

### Test 1: Check Content Script Loading
1. Navigate to: https://www.linkedin.com/in/mohamedessam/
2. Open **Chrome DevTools** (Press F12)
3. Go to **Console** tab
4. You should see:
   ```
   ✅ Outlye content script loaded
   📍 Current page: https://www.linkedin.com/in/mohamedessam/
   🔍 Is profile page: true
   💡 Test function available: window.testLinkedInScraper()
   ```

### Test 2: Manual Profile Scraping Test
In the browser console, type:
```javascript
window.testLinkedInScraper()
```

**Expected Output:**
```javascript
🧪 Testing LinkedIn scraper...
📍 Current page: https://www.linkedin.com/in/mohamedessam/
🔍 Is profile page: true
✅ Found name with selector: h1.text-heading-xlarge
👤 Name: Mohamed Essam
💼 Title: [Job Title]
🏢 Company: [Company Name]
📍 Location: [Location]
✅ Successfully extracted profile: Mohamed Essam
```

### Test 3: Extension Popup Test
1. Click the extension icon in Chrome toolbar
2. **Expected:** Side panel opens on the right
3. **Expected:** You should see profile info loaded (not empty state)
4. **Expected:** "Generate Message" button should be **enabled**

### Test 4: Popup Console Debugging
1. Open extension popup/side panel
2. Right-click inside popup → **Inspect**
3. Go to **Console** tab
4. You should see:
   ```
   🚀 Popup initialized
   🔍 Checking authentication status...
   📝 Token from storage: exists (or none)
   🔄 Loading profile from active tab...
   📊 Profile load result: {success: true, profile: {...}}
   ```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Generate Message" Button Disabled
**Symptoms:** Button is greyed out, no profile data shown

**Diagnosis:**
1. Check browser console (F12) for content script messages
2. Check popup console for errors
3. Run `window.testLinkedInScraper()` in browser console

**Solutions:**
- **If content script not loaded:** Refresh the LinkedIn page
- **If scraping fails:** Check console logs for selector issues
- **If communication fails:** Check background script console

### Issue 2: Profile Shows Empty State
**Symptoms:** "Navigate to a LinkedIn profile to get started" message

**Solutions:**
1. Make sure you're on `linkedin.com/in/*` URL
2. Refresh the LinkedIn page completely
3. Check if content script is loaded (F12 console)
4. Try manual test: `window.testLinkedInScraper()`

### Issue 3: Authentication Issues
**Symptoms:** Keep getting asked to login

**Solutions:**
1. Check popup console for auth errors
2. Try clearing extension data:
   - Go to `chrome://extensions/`
   - Find extension → Click "Details"
   - Click "Extension options" → Clear storage
   - Login again

### Issue 4: Content Script Not Injecting
**Symptoms:** No console messages when visiting LinkedIn

**Solutions:**
1. Completely remove and reinstall extension
2. Check permissions in extension details
3. Make sure you're on https://www.linkedin.com (not http://)
4. Try a different LinkedIn profile

---

## 🔍 Debug Console Commands

### Check Content Script
```javascript
// In browser console on LinkedIn page
window.testLinkedInScraper()

// Check if content script is loaded
console.log("Content script loaded:", typeof window.testLinkedInScraper !== 'undefined')

// Check page URL
console.log("Current URL:", window.location.href)

// Check if it's a profile page
console.log("Is profile page:", /linkedin\.com\/in\//.test(window.location.href))
```

### Check Extension State
```javascript
// In popup console
chrome.storage.local.get(['authToken'], (result) => {
  console.log("Stored token:", result.authToken ? "exists" : "none")
})

// Check current panel mode
console.log("Panel mode:", window.innerWidth > 600 ? "Side Panel" : "Popup")
```

---

## ✅ Success Indicators

When everything works correctly, you should see:

1. **Browser Console (on LinkedIn page):**
   - ✅ Content script loaded messages
   - ✅ Profile scraping successful
   - ✅ Test function returns valid profile data

2. **Popup Console:**
   - ✅ Authentication successful
   - ✅ Profile loaded successfully
   - ✅ No errors in red

3. **Visual Interface:**
   - ✅ Profile name and photo displayed
   - ✅ Job title and company shown
   - ✅ "Generate Message" button enabled (blue)
   - ✅ Status shows "Ready" or "Profile loaded ✓"

---

## 🚨 If Still Not Working

1. **Provide Console Logs:**
   - Browser console output from LinkedIn page
   - Popup console output
   - Any error messages in red

2. **Try Different Profile:**
   - Test with a different LinkedIn profile
   - Some profiles may have different layouts

3. **Check Extension Permissions:**
   - Go to `chrome://extensions/`
   - Find extension → Click "Details"
   - Verify permissions include:
     - `https://www.linkedin.com/*`
      - `https://outlye.flowtim.com/*`

4. **Background Script Console:**
   - Go to `chrome://extensions/`
   - Find extension → Click "service worker" link
   - Check for errors in background script

---

## 📱 Mobile/Tablet Note

LinkedIn may have different layouts for different devices. This extension is optimized for desktop LinkedIn profiles.

---

## 🎯 Quick Test Checklist

- [ ] Extension installed without errors
- [ ] Content script loads on LinkedIn (check F12 console)
- [ ] Manual test works: `window.testLinkedInScraper()`
- [ ] Popup opens and shows profile data
- [ ] Generate button is enabled
- [ ] Can generate messages successfully

Check all items above - if any fail, follow the troubleshooting steps!
