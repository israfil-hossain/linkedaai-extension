# Extension Icons

This directory contains the icons for the Chrome extension.

## Current Status
- ✅ SVG icons exist (icon16.svg, icon48.svg, icon128.svg)
- ⚠️ PNG icons need to be generated for best Chrome compatibility

## How to Generate PNG Icons

### Option 1: Using Node.js (Recommended)
1. Install sharp: `npm install sharp`
2. Run: `node generate-icons.js`
3. Reload your extension in Chrome

### Option 2: Manual (Browser-based)
1. Open `generate-icons.html` in Chrome
2. Click the download buttons for each size
3. Place the downloaded PNG files in this directory
4. Reload your extension in Chrome

### Option 3: Online Converters
Use any online SVG to PNG converter:
- https://cloudconvert.com/svg-to-png
- https://convertio.co/svg-png/

Convert these files:
- icon16.svg → icon16.png (16x16 pixels)
- icon48.svg → icon48.png (48x48 pixels)
- icon128.svg → icon128.png (128x128 pixels)

## Icon Design
- Background: Blue (#4f8ef7)
- Symbol: White lightning bolt with purple accent
- Style: Rounded, modern, clean

## After Generating Icons
1. Make sure these files exist:
   - icon16.png
   - icon48.png
   - icon128.png
2. Reload your extension in Chrome:
   - Go to chrome://extensions/
   - Click "Reload" on your extension
3. The icons should now appear in the browser toolbar and extension list
