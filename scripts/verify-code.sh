#!/bin/bash
# Verify code quality by running generated Python files

DESKTOP="$USERPROFILE/Desktop"
PASS=0
FAIL=0

echo "=== CODE QUALITY VERIFICATION ==="
echo ""

# Find recent Python files
for file in "$DESKTOP"/*.py; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")

    # Try to run the file
    if python "$file" > /dev/null 2>&1; then
      echo "PASS $filename"
      PASS=$((PASS + 1))
    else
      echo "FAIL $filename"
      FAIL=$((FAIL + 1))
    fi
  fi
done

echo ""
echo "RESULTS: $PASS/$((PASS + FAIL)) passed"
