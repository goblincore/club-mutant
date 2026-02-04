#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const clientSrcDir = path.join(__dirname, '..', 'client', 'src')

function updateImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  const original = content

  // Replace various relative type imports with workspace package
  // Match both single and double quotes
  content = content.replace(/from '\.\/types\//g, "from '@club-mutant/types/")
  content = content.replace(/from "\.\/types\//g, "from '@club-mutant/types/")
  content = content.replace(/from '\.\.\/types\//g, "from '@club-mutant/types/")
  content = content.replace(/from "\.\.\/types\//g, "from '@club-mutant/types/")
  content = content.replace(/from '\.\.\/\.\.\/types\//g, "from '@club-mutant/types/")
  content = content.replace(/from "\.\.\/\.\.\/types\//g, "from '@club-mutant/types/")

  if (content !== original) {
    fs.writeFileSync(filePath, content)
    console.log('Updated:', filePath)
    return true
  }
  return false
}

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      // Skip the types directory itself
      if (file !== 'types') {
        walkDir(filePath, callback)
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      callback(filePath)
    }
  }
}

console.log('Starting import updates...')
console.log('Client src dir:', clientSrcDir)

let updatedCount = 0
walkDir(clientSrcDir, (filePath) => {
  if (updateImports(filePath)) {
    updatedCount++
  }
})

console.log('Total files updated:', updatedCount)
