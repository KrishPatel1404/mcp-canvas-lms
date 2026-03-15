# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note** — Starting at v2.4.0 this fork ([KrishPatel1404/mcp-canvas-lms](https://github.com/KrishPatel1404/mcp-canvas-lms)) diverges from the upstream [DMontgomery40/mcp-canvas-lms](https://github.com/DMontgomery40/mcp-canvas-lms). Entries below v2.4.0 are from the original project.

## [2.4.1] - 2026-03-16

### Added
- In-memory TTL response cache with LRU eviction and request deduplication in `CanvasClient` (3 tiers: 10 min / 5 min / 1 min based on endpoint volatility)
- `include_raw` parameter on every tool — when `true`, returns the full raw Canvas API payload instead of the default summary
- Streamable-HTTP transport (`MCP_TRANSPORT=streamable-http`) alongside the default stdio transport
- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`) on all 26 tools
- MCP resource URIs for courses, assignments, modules, announcements, quizzes, pages, files, calendar, and user profile

### Changed
- **Read-only server**: Removed all 12 state-mutating tools — the server is now entirely read-only and safe to connect to any Canvas student account
- Scoped npm package as `@krishpkreame/canvas-mcp-server` with a `canvas-mcp` bin alias
- Announcements endpoint switched to the global `/api/v1/announcements` route with `context_codes` for cross-instance reliability
- Improved pagination handling in `CanvasClient` (follows `Link: rel="next"` headers automatically)
- All debug logging writes to stderr; stdout is reserved for MCP JSON messages
- Bumped `@modelcontextprotocol/sdk` to ^1.27, `axios` to ^1.13, `dotenv` to ^17, and all dev-dependencies to latest

### Removed
- `canvas_submit_assignment` — assignment submission
- `canvas_get_dashboard` — dashboard info (unreliable across Canvas instances)
- `canvas_get_user_grades` — replaced by `canvas_get_course_grades`
- `canvas_update_user_profile` — profile mutation
- `canvas_mark_module_item_complete` — module item completion mutation
- `canvas_list_discussion_topics` / `canvas_get_discussion_topic` — discussion topics
- `canvas_start_quiz_attempt` — quiz attempt mutation
- `canvas_list_rubrics` / `canvas_get_rubric` — instructor-only rubric endpoints
- `canvas_list_conversations` / `canvas_get_conversation` — messaging
- Dockerfile, docker-compose.yml, vitest config, and all test files
- husky, lint-staged, vitest, and @vitest/coverage-v8 dev-dependencies
- `node_modules/` and `dist/` blobs purged from git history (repo size 5.7 MiB → 174 KiB)

### Fixed
- Resolved all 19 ESLint warnings across the codebase
- Fixed course grades API parameter handling

## [2.2.3] - 2025-06-27

### Fixed
- **Course Creation Parameters**: Added missing `restrict_enrollments_to_course_dates` and other Canvas course parameters to tool schemas

## [2.2.2] - 2025-06-27

### Fixed
- **MCP JSON Communication**: Changed `console.log` to `console.error` so debug output no longer pollutes the stdio JSON channel

## [2.2.1] - 2025-06-27

### Fixed
- **JSON Parsing Errors**: Enhanced error-response handling to gracefully process non-JSON (HTML/text) responses from Canvas API

## [2.2.0] - 2025-06-27

### Added
- Initial Canvas LMS MCP server with full student functionality
- Assignments, courses, submissions, calendar, announcements, files, pages, modules, quizzes, grades, user profile
- Retry logic, comprehensive type definitions, and error handling
