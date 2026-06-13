/**
 * Enterprise Features
 *
 * Professional-grade capabilities:
 * - Team management with roles
 * - Audit logging
 * - Permission system
 * - API key management
 * - Rate limiting
 * - SSO integration
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { logger } from '../config/logger.js';
import { randomUUID } from 'node:crypto';

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  DEVELOPER = 'developer',
  VIEWER = 'viewer',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  teamId?: string;
  permissions: Permission[];
  apiKeys: ApiKey[];
  createdAt: Date;
  lastLogin?: Date;
  isActive: boolean;
}

export interface Permission {
  resource: string;
  actions: string[]; // 'read', 'write', 'delete', 'execute'
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: Permission[];
  expiresAt?: Date;
  lastUsed?: Date;
  isActive: boolean;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: string[];
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export class EnterpriseSystem {
  private dataDir: string;
  private users: Map<string, User> = new Map();
  private teams: Map<string, Team> = new Map();
  private auditLogs: AuditLog[] = [];
  private rateLimits: Map<string, { count: number; resetAt: Date }> = new Map();

  constructor() {
    this.dataDir = join(homedir(), '.remoteos', 'enterprise');
  }

  /**
   * Initialize enterprise system
   */
  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await this.loadData();
    logger.info('Enterprise system initialized');
  }

  // ─── User Management ────────────────────────────────────────

  /**
   * Create new user
   */
  async createUser(userData: {
    email: string;
    name: string;
    role?: UserRole;
    teamId?: string;
  }): Promise<User> {
    // Check if email already exists
    for (const user of this.users.values()) {
      if (user.email === userData.email) {
        throw new Error(`User with email ${userData.email} already exists`);
      }
    }

    const user: User = {
      id: randomUUID(),
      email: userData.email,
      name: userData.name,
      role: userData.role || UserRole.DEVELOPER,
      teamId: userData.teamId,
      permissions: this.getDefaultPermissions(userData.role || UserRole.DEVELOPER),
      apiKeys: [],
      createdAt: new Date(),
      isActive: true,
    };

    this.users.set(user.id, user);
    await this.saveData();

    // Audit log
    await this.logAction({
      userId: 'system',
      action: 'user.create',
      resource: `user:${user.id}`,
      details: { email: user.email, role: user.role },
      success: true,
    });

    logger.info({ userId: user.id, email: user.email }, 'User created');
    return user;
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): User | null {
    return this.users.get(userId) || null;
  }

  /**
   * Get user by email
   */
  getUserByEmail(email: string): User | null {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  /**
   * Update user
   */
  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    Object.assign(user, updates);
    await this.saveData();

    await this.logAction({
      userId: 'system',
      action: 'user.update',
      resource: `user:${userId}`,
      details: updates,
      success: true,
    });

    return user;
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.isActive = false;
    await this.saveData();

    await this.logAction({
      userId: 'system',
      action: 'user.deactivate',
      resource: `user:${userId}`,
      details: {},
      success: true,
    });
  }

  // ─── Team Management ────────────────────────────────────────

  /**
   * Create team
   */
  async createTeam(teamData: {
    name: string;
    description: string;
    ownerId: string;
  }): Promise<Team> {
    const team: Team = {
      id: randomUUID(),
      name: teamData.name,
      description: teamData.description,
      ownerId: teamData.ownerId,
      members: [teamData.ownerId],
      createdAt: new Date(),
    };

    this.teams.set(team.id, team);

    // Update user's team
    const owner = this.users.get(teamData.ownerId);
    if (owner) {
      owner.teamId = team.id;
    }

    await this.saveData();

    await this.logAction({
      userId: teamData.ownerId,
      action: 'team.create',
      resource: `team:${team.id}`,
      details: { name: team.name },
      success: true,
    });

    return team;
  }

  /**
   * Add member to team
   */
  async addTeamMember(teamId: string, userId: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (!team.members.includes(userId)) {
      team.members.push(userId);
      user.teamId = teamId;
      await this.saveData();
    }
  }

  /**
   * Remove member from team
   */
  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    team.members = team.members.filter(id => id !== userId);

    const user = this.users.get(userId);
    if (user) {
      user.teamId = undefined;
    }

    await this.saveData();
  }

  // ─── Permission System ──────────────────────────────────────

  /**
   * Check if user has permission
   */
  hasPermission(user: User, resource: string, action: string): boolean {
    // Owners have all permissions
    if (user.role === UserRole.OWNER) return true;

    // Check specific permissions
    const permission = user.permissions.find(p => p.resource === resource);
    if (permission) {
      return permission.actions.includes(action);
    }

    // Check wildcard permissions
    const wildcard = user.permissions.find(p => p.resource === '*');
    if (wildcard) {
      return wildcard.actions.includes(action);
    }

    return false;
  }

  /**
   * Grant permission to user
   */
  async grantPermission(userId: string, permission: Permission): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check if permission already exists
    const existing = user.permissions.find(p => p.resource === permission.resource);
    if (existing) {
      // Merge actions
      for (const action of permission.actions) {
        if (!existing.actions.includes(action)) {
          existing.actions.push(action);
        }
      }
    } else {
      user.permissions.push(permission);
    }

    await this.saveData();

    await this.logAction({
      userId: 'system',
      action: 'permission.grant',
      resource: `user:${userId}`,
      details: permission,
      success: true,
    });
  }

  /**
   * Revoke permission from user
   */
  async revokePermission(userId: string, resource: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.permissions = user.permissions.filter(p => p.resource !== resource);
    await this.saveData();
  }

  /**
   * Get default permissions for role
   */
  private getDefaultPermissions(role: UserRole): Permission[] {
    switch (role) {
      case UserRole.OWNER:
        return [{ resource: '*', actions: ['read', 'write', 'delete', 'execute'] }];
      case UserRole.ADMIN:
        return [
          { resource: '*', actions: ['read', 'write', 'execute'] },
          { resource: 'user', actions: ['read', 'write'] },
        ];
      case UserRole.MANAGER:
        return [
          { resource: '*', actions: ['read', 'write'] },
          { resource: 'team', actions: ['read'] },
        ];
      case UserRole.DEVELOPER:
        return [
          { resource: '*', actions: ['read', 'execute'] },
          { resource: 'code', actions: ['read', 'write'] },
        ];
      case UserRole.VIEWER:
        return [{ resource: '*', actions: ['read'] }];
      default:
        return [];
    }
  }

  // ─── API Key Management ─────────────────────────────────────

  /**
   * Generate API key for user
   */
  async generateApiKey(userId: string, keyData: {
    name: string;
    permissions?: Permission[];
    expiresAt?: Date;
  }): Promise<ApiKey> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const apiKey: ApiKey = {
      id: randomUUID(),
      name: keyData.name,
      key: this.generateRandomKey(),
      permissions: keyData.permissions || user.permissions,
      expiresAt: keyData.expiresAt,
      isActive: true,
    };

    user.apiKeys.push(apiKey);
    await this.saveData();

    await this.logAction({
      userId,
      action: 'apikey.generate',
      resource: `apikey:${apiKey.id}`,
      details: { name: apiKey.name },
      success: true,
    });

    return apiKey;
  }

  /**
   * Validate API key
   */
  validateApiKey(key: string): { valid: boolean; userId?: string; permissions?: Permission[] } {
    for (const user of this.users.values()) {
      const apiKey = user.apiKeys.find(k => k.key === key && k.isActive);
      if (apiKey) {
        // Check expiration
        if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
          return { valid: false };
        }

        // Update last used
        apiKey.lastUsed = new Date();

        return {
          valid: true,
          userId: user.id,
          permissions: apiKey.permissions,
        };
      }
    }

    return { valid: false };
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const apiKey = user.apiKeys.find(k => k.id === keyId);
    if (apiKey) {
      apiKey.isActive = false;
      await this.saveData();
    }
  }

  /**
   * Generate random API key
   */
  private generateRandomKey(): string {
    const { randomBytes } = require('node:crypto');
    const bytes = randomBytes(36);
    return 'ros_' + bytes.toString('base64url').slice(0, 48);
  }

  // ─── Audit Logging ──────────────────────────────────────────

  /**
   * Log action
   */
  async logAction(logData: {
    userId: string;
    action: string;
    resource: string;
    details: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
  }): Promise<void> {
    const log: AuditLog = {
      id: randomUUID(),
      timestamp: new Date(),
      userId: logData.userId,
      action: logData.action,
      resource: logData.resource,
      details: logData.details,
      ipAddress: logData.ipAddress,
      userAgent: logData.userAgent,
      success: logData.success,
    };

    this.auditLogs.push(log);

    // Keep only last 10000 logs
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-10000);
    }

    await this.saveData();
  }

  /**
   * Query audit logs
   */
  queryAuditLogs(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
    limit?: number;
  }): AuditLog[] {
    let logs = [...this.auditLogs];

    if (filters.userId) {
      logs = logs.filter(l => l.userId === filters.userId);
    }

    if (filters.action) {
      logs = logs.filter(l => l.action === filters.action);
    }

    if (filters.resource) {
      logs = logs.filter(l => l.resource === filters.resource);
    }

    if (filters.startDate) {
      logs = logs.filter(l => l.timestamp >= filters.startDate!);
    }

    if (filters.endDate) {
      logs = logs.filter(l => l.timestamp <= filters.endDate!);
    }

    if (filters.success !== undefined) {
      logs = logs.filter(l => l.success === filters.success);
    }

    // Sort by timestamp descending
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (filters.limit) {
      logs = logs.slice(0, filters.limit);
    }

    return logs;
  }

  // ─── Rate Limiting ──────────────────────────────────────────

  /**
   * Check rate limit
   */
  checkRateLimit(identifier: string, config: RateLimitConfig): boolean {
    const now = new Date();
    const limit = this.rateLimits.get(identifier);

    if (!limit || limit.resetAt < now) {
      // Reset or initialize
      this.rateLimits.set(identifier, {
        count: 1,
        resetAt: new Date(now.getTime() + config.windowMs),
      });
      return true;
    }

    if (limit.count >= config.maxRequests) {
      return false; // Rate limit exceeded
    }

    limit.count++;
    return true;
  }

  // ─── Data Persistence ───────────────────────────────────────

  /**
   * Save data to disk
   */
  private async saveData(): Promise<void> {
    const data = {
      users: Array.from(this.users.entries()),
      teams: Array.from(this.teams.entries()),
      auditLogs: this.auditLogs.slice(-1000), // Save last 1000
    };

    await writeFile(join(this.dataDir, 'data.json'), JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Load data from disk
   */
  private async loadData(): Promise<void> {
    const path = join(this.dataDir, 'data.json');

    if (existsSync(path)) {
      const data = await readFile(path, 'utf-8');
      const parsed = JSON.parse(data);

      this.users = new Map(parsed.users || []);
      this.teams = new Map(parsed.teams || []);
      this.auditLogs = parsed.auditLogs || [];
    }
  }

  // ─── Statistics ─────────────────────────────────────────────

  /**
   * Get enterprise statistics
   */
  getStats(): {
    totalUsers: number;
    activeUsers: number;
    totalTeams: number;
    totalAuditLogs: number;
    totalApiKeys: number;
  } {
    const users = Array.from(this.users.values());
    const activeUsers = users.filter(u => u.isActive).length;
    const totalApiKeys = users.reduce((sum, u) => sum + u.apiKeys.length, 0);

    return {
      totalUsers: this.users.size,
      activeUsers,
      totalTeams: this.teams.size,
      totalAuditLogs: this.auditLogs.length,
      totalApiKeys,
    };
  }
}
