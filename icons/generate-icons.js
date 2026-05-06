#!/usr/bin/env node

/**
 * Generate PNG icons from SVG files
 * Run: node generate-icons.js
 * Requires: npm install sharp
 */

const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const iconsDir = __dirname;

async function generatePNGs() {
  console.log('🎨 Generating PNG icons from SVG...\n');

  for (const size of sizes) {
    const svgPath = path.join(iconsDir, `icon${size}.svg`);
    const pngPath = path.join(iconsDir, `icon${size}.png`);

    try {
      // Check if SVG exists
      if (!fs.existsSync(svgPath)) {
        console.log(`❌ SVG file not found: icon${size}.svg`);
        continue;
      }

      // Read SVG content
      const svgContent = fs.readFileSync(svgPath, 'utf-8');

      // Try to use sharp if available
      let sharp;
      try {
        sharp = require('sharp');
      } catch (err) {
        console.log('⚠️  Sharp not installed. Install it with: npm install sharp');
        console.log('📝 Alternatively, open generate-icons.html in your browser to manually download PNGs');
        return;
      }

      // Convert SVG to PNG
      const buffer = Buffer.from(svgContent);
      await sharp(buffer, { density: 72 })
        .resize(size, size)
        .png()
        .toFile(pngPath);

      console.log(`✅ Generated icon${size}.png`);
    } catch (error) {
      console.log(`❌ Error generating icon${size}.png:`, error.message);
    }
  }

  console.log('\n✨ Done! Your extension icons are ready.');
  console.log('📁 Reload your extension in Chrome to see the new icons.');
}

generatePNGs().catch(console.error);
