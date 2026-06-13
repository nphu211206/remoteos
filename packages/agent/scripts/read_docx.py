#!/usr/bin/env python3
"""Read the first .docx file from Desktop"""
import os, glob, sys
sys.stdout.reconfigure(encoding='utf-8')

files = glob.glob(os.path.expanduser('~/Desktop/*.docx'))
if not files:
    print('No .docx files found on Desktop')
    sys.exit(0)

f = files[0]
print(f'=== FILE: {os.path.basename(f)} ===')
print(f'Path: {f}')
print(f'Size: {os.path.getsize(f)//1024} KB')
print()

try:
    from docx import Document
    doc = Document(f)
    for p in doc.paragraphs:
        if p.text.strip():
            print(p.text)
except Exception as e:
    print(f'Error reading docx: {e}')
    # Fallback: try reading as text
    try:
        with open(f, 'rb') as fh:
            content = fh.read()
            # Extract text from binary
            text = ''.join(chr(b) if 32 <= b < 127 else ' ' for b in content)
            print('Raw text extract:')
            print(text[:2000])
    except:
        print('Cannot read file')
