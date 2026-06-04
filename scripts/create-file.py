#!/usr/bin/env python3
"""
RemoteOS File Creator — Wrapper script for creating files with proper encoding.
Usage: python create-file.py <filename> <content>
Or: python create-file.py <filename> (reads content from stdin)
"""
import sys
import os

def main():
    if len(sys.argv) < 2:
        print("Usage: python create-file.py <filename> [content]")
        print("  Or: echo 'content' | python create-file.py <filename>")
        sys.exit(1)

    filename = sys.argv[1]
    desktop = os.path.join(os.path.expanduser('~'), 'Desktop')
    filepath = os.path.join(desktop, filename)

    if len(sys.argv) >= 3:
        # Content from argument
        content = ' '.join(sys.argv[2:])
    else:
        # Content from stdin
        content = sys.stdin.read()

    # Write file with UTF-8 encoding
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"✅ File created: {filepath}")
    print(f"📦 Size: {os.path.getsize(filepath)} bytes")

if __name__ == '__main__':
    main()
