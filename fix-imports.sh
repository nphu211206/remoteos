#!/bin/bash
# Fix shared package imports for ESM compatibility
cd /c/Users/Admin/remoteos/packages/shared/dist

# Fix all relative imports to include .js extension
find . -name "*.js" -type f -exec sed -i "s|from '\\.\\.\/\\([^']*\\)'|from '../\\1.js'|g" {} \;
find . -name "*.js" -type f -exec sed -i "s|from '\\.\/\\([^']*\\)'|from './\\1.js'|g" {} \;
# Remove double .js
find . -name "*.js" -type f -exec sed -i "s|\\.js\\.js|.js|g" {} \;

echo "Fixed shared package imports"
