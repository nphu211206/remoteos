/**
 * Create File Route — Server-side file creation
 *
 * POST /api/v1/create-file
 * Body: { filename: string, content: string, run?: boolean }
 *
 * Creates a file on the user's Desktop directly from the server,
 * bypassing shell escaping issues entirely.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { exec } from 'node:child_process';
import { logger } from '../config/logger.js';

export function registerCreateFileRoutes(server: FastifyInstance): void {
  server.post('/create-file', async (req: FastifyRequest, reply: FastifyReply) => {
    const { filename, content, run } = req.body as {
      filename?: string;
      content?: string;
      run?: boolean;
    };

    if (!filename || !content) {
      return reply.status(400).send({
        success: false,
        error: 'Missing filename or content',
      });
    }

    try {
      const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
      const filepath = join(desktop, filename);

      // Write file with UTF-8 encoding
      writeFileSync(filepath, content, 'utf-8');
      logger.info({ filepath, size: content.length }, 'File created');

      // Optionally run the file
      let runResult = null;
      if (run) {
        const ext = extname(filename).toLowerCase();
        let cmd = '';

        if (ext === '.py') {
          cmd = `python "${filepath}"`;
        } else if (ext === '.js') {
          cmd = `node "${filepath}"`;
        } else if (ext === '.html') {
          cmd = `start "" "${filepath}"`;
        }

        if (cmd) {
          try {
            const { execSync } = await import('node:child_process');
            const output = execSync(cmd, { timeout: 30000, encoding: 'utf-8' });
            runResult = { success: true, output };
          } catch (err: any) {
            runResult = { success: false, error: err.message };
          }
        }
      }

      return reply.send({
        success: true,
        filepath,
        size: content.length,
        run: runResult,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to create file');
      return reply.status(500).send({
        success: false,
        error: 'Failed to create file',
      });
    }
  });
}
