#!/usr/bin/env python3
"""
RemoteOS Write & Run — Creates a file and optionally runs it.
Usage: python write-and-run.py <filename> [--run]
Content is read from stdin.
"""
import sys
import os
import subprocess

def main():
    if len(sys.argv) < 2:
        print("Usage: python write-and-run.py <filename> [--run]")
        sys.exit(1)

    filename = sys.argv[1]
    should_run = '--run' in sys.argv

    desktop = os.path.join(os.path.expanduser('~'), 'Desktop')
    filepath = os.path.join(desktop, filename)

    # Read content from stdin
    content = sys.stdin.read()

    # Write file
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"✅ Created: {filepath}")
    print(f"📦 Size: {os.path.getsize(filepath)} bytes")

    # Run if requested
    if should_run:
        ext = os.path.splitext(filename)[1].lower()
        if ext == '.py':
            print(f"\n🐍 Running Python...")
            result = subprocess.run(['python', filepath], capture_output=True, text=True)
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(f"❌ Error: {result.stderr}")
            print(f"Exit code: {result.returncode}")
        elif ext == '.js':
            print(f"\n🟢 Running Node.js...")
            result = subprocess.run(['node', filepath], capture_output=True, text=True)
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(f"❌ Error: {result.stderr}")
            print(f"Exit code: {result.returncode}")

if __name__ == '__main__':
    main()
