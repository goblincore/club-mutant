#!/bin/bash

# WebP Conversion Script for Club Mutant Assets
# Converts all PNG files to WebP format with 90% quality

set -e

# Check if cwebp is installed
if ! command -v cwebp &> /dev/null; then
    echo "Error: cwebp is not installed"
    echo "Install it with: brew install webp"
    exit 1
fi

# Navigate to assets directory
cd "$(dirname "$0")/../client/public/assets"

echo "Converting PNG files to WebP..."

# Find and convert all PNG files
find . -name "*.png" -type f | while read -r png_file; do
    webp_file="${png_file%.png}.webp"
    
    # Skip if WebP already exists and is newer
    if [ -f "$webp_file" ] && [ "$webp_file" -nt "$png_file" ]; then
        echo "Skipping $png_file (WebP is up to date)"
        continue
    fi
    
    echo "Converting: $png_file -> $webp_file"
    cwebp -q 90 "$png_file" -o "$webp_file"
done

echo ""
echo "Conversion complete!"
echo ""
echo "Next steps:"
echo "1. Update atlas JSON files to reference .webp instead of .png"
echo "2. Test loading in browser"
echo "3. Remove original .png files after verification (optional)"
