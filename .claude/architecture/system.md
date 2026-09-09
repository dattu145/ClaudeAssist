# System Overview

See ARCHITECTURE.md for the full component map and data flow. This file is the
one-paragraph orientation for a reader new to the repo:

ClaudeOps is a monorepo with three moving parts: an Expo mobile dashboard
(`apps/mobile`), a Node/TypeScript controller daemon (`apps/controller`) that
is the only thing allowed to talk to the `claude` CLI, and shared packages
(`packages/shared`, `packages/protocol`, `packages/config`, `packages/logging`)
that keep types, validation, and cross-cutting concerns consistent between
them. The controller is a modular monolith, not microservices, and persists to
SQLite behind repository interfaces. Everything the mobile app can do today,
a future voice/WhatsApp/Bordio integration will do through the exact same
REST/WS command surface — see architecture/mobile.md and the CommandRouter
notes in ARCHITECTURE.md.
