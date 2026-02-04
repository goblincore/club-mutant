#!/usr/bin/env node

/**
 * Updates Phaser atlas JSON files to reference .webp images instead of .png
 */

const fs = require('fs');
const path = require('path');

const atlasFiles = [
  'client/public/assets/character/mutant_ripped.json',
  'client/public/assets/character/mutant.json',
  'client/public/assets/character/MutantWalk.json',
  'client/public/assets/background/cloud_day.json',
  'client/public/assets/background/cloud_night.json',
];

const rootDir = path.join(__dirname, '..');

console.log('Updating atlas JSON files to use WebP...\n');

atlasFiles.forEach((atlasPath) => {
  const fullPath = path.join(rootDir, atlasPath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Skipping ${atlasPath} (not found)`);
    return;
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const data = JSON.parse(content);

    let modified = false;

    // Handle multi-atlas format (array of textures)
    if (Array.isArray(data.textures)) {
      data.textures.forEach((texture) => {
        if (texture.image && texture.image.endsWith('.png')) {
          texture.image = texture.image.replace(/\.png$/, '.webp');
          modified = true;
        }
      });
    }

    // Handle single atlas format
    if (data.meta && data.meta.image && data.meta.image.endsWith('.png')) {
      data.meta.image = data.meta.image.replace(/\.png$/, '.webp');
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`✅ Updated ${atlasPath}`);
    } else {
      console.log(`ℹ️  No changes needed for ${atlasPath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${atlasPath}:`, error.message);
  }
});

console.log('\nAtlas JSON files updated!');
console.log('\nNext: Run the WebP conversion script:');
console.log('  ./scripts/convert-to-webp.sh');
