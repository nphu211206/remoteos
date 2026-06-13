/**
 * File Manager
 *
 * Handles file operations: download, list, info, search, read, edit, delete.
 */

import { createWriteStream } from 'node:fs';
import { stat, readdir, readFile, writeFile, unlink, rm } from 'node:fs/promises';
import { join, resolve, extname, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import axios from 'axios';
import type { FileDownloadOutput, FileListOutput, FileDeleteOutput, FileSearchOutput, FileInfoOutput, FileReadOutput, FileEditOutput } from '@remoteos/shared';
import { isSafeDownloadUrl, sanitizePath, formatBytes } from '@remoteos/shared/utils';
import { MAX_FILE_DOWNLOAD_BYTES } from '@remoteos/shared/constants';
import { logger } from '../config/logger.js';

export class FileManager {
  /**
   * Download a file from URL to the local machine
   */
  async downloadFile(params: Record<string, unknown>): Promise<FileDownloadOutput> {
    const url = params.url as string;
    const savePath = (params.savePath as string) ?? './downloads';

    if (!url) throw new Error('Missing required parameter: url');
    if (!isSafeDownloadUrl(url)) throw new Error('URL is not safe (blocked localhost/private IPs)');

    // Ensure download directory exists
    const { mkdirSync, existsSync } = await import('node:fs');
    if (!existsSync(savePath)) {
      mkdirSync(savePath, { recursive: true });
    }

    // Get filename from URL or Content-Disposition
    const response = await axios.get(url, {
      responseType: 'stream',
      maxContentLength: MAX_FILE_DOWNLOAD_BYTES,
      timeout: 300_000, // 5 minutes
    });

    const contentLength = parseInt(String(response.headers['content-length'] ?? '0'), 10);
    if (contentLength > MAX_FILE_DOWNLOAD_BYTES) {
      throw new Error(`File too large: ${formatBytes(contentLength)} (max: ${formatBytes(MAX_FILE_DOWNLOAD_BYTES)})`);
    }

    // Extract filename
    const disposition = response.headers['content-disposition'] as string | undefined;
    let fileName = 'downloaded_file';
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match?.[1]) fileName = match[1].replace(/['"]/g, '');
    } else {
      const urlPath = new URL(url).pathname;
      const segments = urlPath.split('/');
      if (segments.length > 0 && segments[segments.length - 1]) {
        fileName = segments[segments.length - 1]!;
      }
    }

    const filePath = join(savePath, sanitizePath(fileName));
    const startTime = Date.now();

    // Stream to file
    const writer = createWriteStream(filePath);
    await pipeline(response.data, writer);

    const durationMs = Date.now() - startTime;

    logger.info({ fileName, filePath, sizeBytes: contentLength, durationMs }, 'File downloaded');

    return {
      commandType: 'file_download',
      url,
      fileName,
      filePath,
      sizeBytes: contentLength,
      durationMs,
    };
  }

  /**
   * List files in a directory
   */
  async listFiles(params: Record<string, unknown>): Promise<FileListOutput> {
    const rawPath = (params.path as string) ?? '.';
    const path = sanitizePath(rawPath);

    const entries = await readdir(path, { withFileTypes: true });
    const fileEntries = await Promise.all(
      entries.slice(0, 100).map(async (entry) => {
        const fullPath = join(path, entry.name);
        try {
          const stats = await stat(fullPath);
          return {
            name: entry.name,
            type: (entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file') as 'file' | 'directory' | 'symlink',
            sizeBytes: stats.size,
            modifiedAt: stats.mtime.toISOString(),
            permissions: '0' + (stats.mode & 0o777).toString(8),
          };
        } catch {
          return {
            name: entry.name,
            type: 'file' as const,
            sizeBytes: 0,
            modifiedAt: new Date().toISOString(),
            permissions: 'unknown',
          };
        }
      }),
    );

    return {
      commandType: 'file_list',
      path,
      entries: fileEntries,
      total: entries.length,
    };
  }

  /**
   * Delete a file or directory
   */
  async deleteFile(params: Record<string, unknown>): Promise<FileDeleteOutput> {
    const rawPath = params.path as string;
    if (!rawPath) throw new Error('Missing required parameter: path');

    const filePath = resolve(rawPath);
    const recursive = params.recursive === true;

    // Safety: block deletion of critical system directories
    const protectedPaths = [
      'C:\\', 'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
      '/usr', '/bin', '/etc', '/var', '/root', '/',
    ];
    if (protectedPaths.some(p => filePath.toLowerCase() === p.toLowerCase())) {
      throw new Error('Cannot delete protected system directory');
    }

    const stats = await stat(filePath);
    if (stats.isDirectory()) {
      await rm(filePath, { recursive, force: false });
    } else {
      await unlink(filePath);
    }

    logger.info({ path: filePath, recursive }, 'File deleted');

    return {
      commandType: 'file_delete',
      path: filePath,
      success: true,
      message: `Đã xóa: ${filePath}`,
    };
  }

  /**
   * Search for files by pattern
   */
  async searchFiles(params: Record<string, unknown>): Promise<FileSearchOutput> {
    const pattern = (params.pattern as string) || '**/*';

    const rootPath = (params.rootPath as string) || process.env.USERPROFILE || process.env.HOME || '.';
    const maxResults = (params.maxResults as number) || 50;

    // Use dynamic import for glob
    const { glob } = await import('glob');

    const files = await glob(pattern, {
      cwd: rootPath,
      absolute: true,
      nodir: false,
      maxDepth: 10,
    });

    const results = [];
    for (const filePath of files.slice(0, maxResults)) {
      try {
        const stats = await stat(filePath);
        results.push({
          path: filePath,
          name: basename(filePath),
          size: stats.size,
          isDirectory: stats.isDirectory(),
          modified: stats.mtime.toISOString(),
        });
      } catch {
        // Skip inaccessible files
      }
    }

    logger.info({ pattern, rootPath, totalFound: files.length }, 'File search completed');

    return {
      commandType: 'file_search',
      pattern,
      rootPath,
      results,
      totalFound: files.length,
    };
  }

  /**
   * Get file metadata
   */
  async getFileInfo(params: Record<string, unknown>): Promise<FileInfoOutput> {
    const rawPath = params.path as string;
    if (!rawPath) throw new Error('Missing required parameter: path');

    const filePath = resolve(rawPath);
    const stats = await stat(filePath);

    return {
      commandType: 'file_info',
      path: filePath,
      name: basename(filePath),
      extension: extname(filePath),
      size: stats.size,
      isDirectory: stats.isDirectory(),
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      permissions: '0' + (stats.mode & 0o777).toString(8),
    };
  }

  /**
   * Read file content
   */
  async readFile(params: Record<string, unknown>): Promise<FileReadOutput> {
    const rawPath = params.path as string;
    if (!rawPath) throw new Error('Missing required parameter: path');

    const filePath = resolve(rawPath);
    const encoding = (params.encoding as BufferEncoding) || 'utf-8';
    const maxLines = (params.maxLines as number) || 1000;

    const content = await readFile(filePath, encoding);
    const lines = content.split('\n');
    const truncated = lines.length > maxLines;
    const truncatedContent = lines.slice(0, maxLines).join('\n');

    logger.info({ path: filePath, totalLines: lines.length, truncated }, 'File read');

    return {
      commandType: 'file_read',
      path: filePath,
      content: truncatedContent,
      encoding,
      totalLines: lines.length,
      truncated,
    };
  }

  /**
   * Edit file content (find/replace or full rewrite)
   */
  async editFile(params: Record<string, unknown>): Promise<FileEditOutput> {
    const rawPath = params.path as string;
    if (!rawPath) throw new Error('Missing required parameter: path');

    const filePath = resolve(rawPath);
    let content = await readFile(filePath, 'utf-8');
    let changesCount = 0;

    if (params.newContent) {
      // Full rewrite
      content = params.newContent as string;
      changesCount = 1;
    } else if (params.findText && params.replaceText !== undefined) {
      // Find and replace
      const findText = params.findText as string;
      const replaceText = params.replaceText as string;
      const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = content.match(regex);
      changesCount = matches ? matches.length : 0;
      content = content.replace(regex, replaceText);
    } else {
      throw new Error('Must provide either newContent or findText+replaceText');
    }

    await writeFile(filePath, content, 'utf-8');

    logger.info({ path: filePath, changesCount }, 'File edited');

    return {
      commandType: 'file_edit',
      path: filePath,
      success: true,
      message: `Đã sửa ${changesCount} chỗ trong ${filePath}`,
      changesCount,
    };
  }
}
