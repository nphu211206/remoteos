/**
 * File Manager
 *
 * Handles file operations: download, list, info, search.
 */

import { createWriteStream } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import axios from 'axios';
import type { FileDownloadOutput, FileListOutput } from '@remoteos/shared';
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
}
