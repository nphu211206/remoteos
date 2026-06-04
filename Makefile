.PHONY: help install build dev clean test lint format

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Setup ──────────────────────────────────────────────────

install: ## Install all dependencies
	pnpm install

setup: install ## Full setup (install + build shared)
	pnpm build:shared

# ─── Development ────────────────────────────────────────────

dev: ## Start all services in development mode
	pnpm dev

dev-server: ## Start only the server
	pnpm dev:server

dev-agent: ## Start only the agent
	pnpm dev:agent

dev-bot: ## Start only the bot
	pnpm dev:bot

dev-discord: ## Start Discord bot
	pnpm --filter @remoteos/discord-bot dev

dev-dashboard: ## Start web dashboard
	pnpm --filter @remoteos/web-dashboard dev

# ─── Build ──────────────────────────────────────────────────

build: ## Build all packages
	pnpm build

build-shared: ## Build shared package only
	pnpm build:shared

# ─── Quality ────────────────────────────────────────────────

test: ## Run all tests
	pnpm test

lint: ## Run linter
	pnpm lint

format: ## Format code
	pnpm format

format-check: ## Check formatting
	pnpm format:check

typecheck: ## Type-check all packages
	pnpm typecheck

# ─── Cleanup ────────────────────────────────────────────────

clean: ## Clean all build artifacts and node_modules
	pnpm clean

# ─── Database ───────────────────────────────────────────────

db-generate: ## Generate database migrations
	pnpm db:generate

db-migrate: ## Run database migrations
	pnpm db:migrate

# ─── Docker (future) ───────────────────────────────────────

docker-build: ## Build Docker images
	@echo "Docker support coming soon"

docker-up: ## Start with Docker Compose
	@echo "Docker support coming soon"
