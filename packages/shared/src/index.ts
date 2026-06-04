/**
 * @remoteos/shared — Shared types, constants, validators, and utilities
 *
 * This package is the foundation of the RemoteOS monorepo.
 * All type definitions, constants, validation schemas, and utility
 * functions live here to ensure consistency across server, agent, and bot.
 *
 * @example
 * ```ts
 * import { type Command, API_VERSION, formatBytes } from '@remoteos/shared';
 * import { commandCreateRequestSchema } from '@remoteos/shared/validators';
 * ```
 */

// Re-export everything from sub-modules
export * from './types';
export * from './constants';
export * from './validators';
export * from './utils';
