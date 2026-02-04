#!/bin/bash
# Update all client imports from relative types to workspace package

cd "$(dirname "$0")/.."

echo "Updating client imports..."

# Find all .ts and .tsx files in client/src (excluding types dir) and update imports
find client/src -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/types/*" | while read file; do
  if grep -q "from '\.\./types/\|from '\./types/" "$file" 2>/dev/null; then
    sed -i '' "s|from '\.\./types/|from '@club-mutant/types/|g" "$file"
    sed -i '' "s|from '\./types/|from '@club-mutant/types/|g" "$file"
    echo "Updated: $file"
  fi
done

echo ""
echo "Done! Now run:"
echo "  rm -rf client/src/types server/src/types"
echo "  pnpm install"
