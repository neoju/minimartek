.PHONY: start dev build test lint migrate seed

migrate:
	yarn workspace backend run migrate:latest

seed:
	yarn workspace backend seed:run

start:
	@[ -f .env ] || (echo "▶  No .env found — copying .env.example to .env ..." && cp .env.example .env)
	@echo "▶  Starting db and redis..."
	docker compose up db redis -d --wait
	@echo "✔  db and redis are healthy"
	@echo "▶  Running migrations..."
	$(MAKE) migrate
	@echo "▶  Seeding database..."
	$(MAKE) seed
	@echo ""
	@echo "▶  Building and starting full stack..."
	docker compose up --build --wait -d
	@echo "   ┌──────────────────────────────────────────────┐"
	@echo "   │  Frontend  →  http://localhost:8080          │"
	@echo "   └──────────────────────────────────────────────┘"
	@echo ""

dev:
	docker compose up db redis -d
	yarn dev

build:
	yarn build

test:
	yarn test

lint:
	yarn lint
