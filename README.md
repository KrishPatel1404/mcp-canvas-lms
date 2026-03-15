# Canvas MCP Server v2.4.0

> A read-only Model Context Protocol (MCP) server for Canvas LMS — safe for student use with no state-mutating operations

## 🎯 Key Features

### 🎓 For Students
- **Course Management**: Access all courses, syllabi, and course materials
- **Assignment Tracking**: View assignments, check submission status, and track due dates
- **Announcements**: Read course announcements
- **Progress Tracking**: Monitor grades, module completion, and calendar events
- **Quizzes**: View quizzes and quiz details
- **File Access**: Browse and download course files and resources

### 🛠️ Technical Excellence
- **Read-Only by Design**: No mutating operations — safe to connect to any Canvas account
- **Robust API**: Automatic retries, pagination, comprehensive error handling
- **Cloud Ready**: Docker containers, health checks
- **Well Tested**: Unit tests, integration tests, mocking, coverage reports
- **Type Safe**: Full TypeScript implementation with strict types
- **26 Tools**: Focused, read-only coverage of Canvas LMS

## Quick Start

### Option 1: Claude Desktop Integration (Recommended MCP Setup)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "canvas-mcp-server": {
      "command": "npx",
      "args": ["-y", "canvas-mcp-server"],
      "env": {
        "CANVAS_API_TOKEN": "your_token_here",
        "CANVAS_DOMAIN": "your_school.instructure.com"
      }
    }
  }
}
```

### Option 2: NPM Package

```bash
# Install globally
npm install -g canvas-mcp-server

# Configure
export CANVAS_API_TOKEN="your_token_here"
export CANVAS_DOMAIN="your_school.instructure.com"

# Run
canvas-mcp-server
```

### Option 3: Docker

```bash
docker run -d \
  --name canvas-mcp \
  -p 3000:3000 \
  -e CANVAS_API_TOKEN="your_token" \
  -e CANVAS_DOMAIN="school.instructure.com" \
  -e MCP_TRANSPORT="streamable-http" \
  -e MCP_HTTP_HOST="0.0.0.0" \
  -e MCP_HTTP_PORT="3000" \
  -e MCP_HTTP_PATH="/mcp" \
  ghcr.io/dmontgomery40/mcp-canvas-lms:latest
```

## Transport Modes

The server supports two explicit transport modes:

- `stdio` (default): best for Claude Desktop/Codex/Cursor local MCP wiring.
- `streamable-http`: best for local HTTP integrations and containerized workflows.

### Transport environment variables

```bash
# Required Canvas auth
CANVAS_API_TOKEN=your_token
CANVAS_DOMAIN=your_school.instructure.com

# Transport selection
MCP_TRANSPORT=stdio # or streamable-http

# Streamable HTTP settings
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_PORT=3000
MCP_HTTP_PATH=/mcp
MCP_HTTP_STATEFUL=true
MCP_HTTP_JSON_RESPONSE=true
MCP_HTTP_ALLOWED_ORIGINS=
```

## 🎓 Workflow Examples

### Check Today's Assignments
```
"What assignments do I have due this week?"
```
**Lists upcoming assignments with due dates, points, and submission status**

### Check Grades
```
"What's my current grade in Biology?"
```
**Shows current scores, grades, and assignment feedback**

### Read Announcements
```
"Any new announcements in my courses?"
```
**Lists recent course announcements**

### Track Progress
```
"What modules do I need to complete in Math 200?"
```
**Shows module completion status and next items to complete**

## Getting Canvas API Token

1. **Log into Canvas** → Account → Settings
2. **Scroll to "Approved Integrations"**
3. **Click "+ New Access Token"**
4. **Enter description**: "Claude MCP Integration"
5. **Copy the generated token** Save securely!

⚠️ **Account Admin Note**: For account-level operations, ensure your API token has administrative privileges.

## Production Deployment

### Docker Compose
```bash
git clone https://github.com/DMontgomery40/mcp-canvas-lms.git
cd mcp-canvas-lms
cp .env.example .env
# Edit .env with your Canvas credentials
docker-compose up -d
```

### Health Monitoring
```bash
# Check application health (HTTP transport only)
curl http://localhost:3000/health
```

## Development

```bash
# Setup development environment
git clone https://github.com/DMontgomery40/mcp-canvas-lms.git
cd mcp-canvas-lms
npm install

# Start development with hot reload
npm run dev:watch

# Run tests
npm run test
npm run coverage

# Code quality
npm run lint
npm run type-check
```

## 📚 Available Tools (26 read-only tools)

| Tool | Description |
|------|-------------|
| `canvas_health_check` | Check API connectivity |
| `canvas_list_courses` | List all your courses |
| `canvas_get_course` | Get detailed course info |
| `canvas_list_assignments` | List course assignments |
| `canvas_get_assignment` | Get assignment details |
| `canvas_get_submission` | Check submission status |
| `canvas_list_assignment_groups` | List assignment groups |
| `canvas_list_modules` | List course modules |
| `canvas_get_module` | Get module details |
| `canvas_list_module_items` | List items in a module |
| `canvas_get_module_item` | Get module item details |
| `canvas_list_announcements` | List course announcements |
| `canvas_get_course_grades` | Get course-specific grades |
| `canvas_get_dashboard_cards` | Get dashboard course cards |
| `canvas_get_upcoming_assignments` | Get upcoming due dates |
| `canvas_list_calendar_events` | List calendar events |
| `canvas_list_files` | List course files |
| `canvas_get_file` | Get file details |
| `canvas_list_folders` | List course folders |
| `canvas_list_pages` | List course pages |
| `canvas_get_page` | Get page content |
| `canvas_list_notifications` | List notifications |
| `canvas_get_syllabus` | Get course syllabus |
| `canvas_get_user_profile` | Get user profile |
| `canvas_list_quizzes` | List course quizzes |
| `canvas_get_quiz` | Get quiz details |

## 🌟 Example Claude Conversations

**Student**: *"What assignments do I have due this week?"*

**Claude**: *Let me check your upcoming assignments...*

[Claude uses `canvas_get_upcoming_assignments`]

---

**Student**: *"What's my current grade in Biology?"*

**Claude**: *Let me pull your grades for that course...*

[Claude uses `canvas_get_course_grades`]

---

**Student**: *"Show me the modules I need to complete in Math 200"*

**Claude**: *I'll list the modules and their completion status for you...*

[Claude uses `canvas_list_modules`, then `canvas_list_module_items`]

## 🔍 Troubleshooting

**Common Issues:**
- ❌ **401 Unauthorized**: Check your API token and permissions
- ❌ **404 Not Found**: Verify course/assignment IDs and access rights  
- ❌ **"Page not found" on course creation**: Update to v2.2.0 for account_id fix
- ❌ **Timeout**: Increase `CANVAS_TIMEOUT` or check network connectivity

**Debug Mode:**
```bash
export LOG_LEVEL=debug
npm start
```

## 🤝 Contributing

### Quick Contribution Setup
```bash
git clone https://github.com/DMontgomery40/mcp-canvas-lms.git
cd mcp-canvas-lms
npm install
npm run dev:watch
# Make changes, add tests, submit PR
```

## 🙋 Support & Community

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/DMontgomery40/mcp-canvas-lms/issues)
- 💬 **Questions**: [GitHub Discussions](https://github.com/DMontgomery40/mcp-canvas-lms/discussions)

## Appendix: MCP in Practice (Code Execution, Tool Scale, and Safety)

Last updated: 2026-02-24

### Why This Appendix Exists
MCP is still one of the most useful interoperability layers for agentic tooling. The tradeoff is that large MCP servers can expose dozens of tools, and naive tool-calling can flood context windows with tool schemas, call traces, and low-signal chatter.

In practice, larger tool surfaces only help when orchestration stays token-efficient and execution behavior is constrained.

### The Shift to Code Execution / Code Mode
Recent production workflows move orchestration out of conversational turns and into executable loops. This keeps context overhead lower, improves determinism, and makes runs auditable.

Core reading:
- [Cloudflare: Code Mode](https://blog.cloudflare.com/code-mode/)
- [Cloudflare: Code Execution with MCP](https://blog.cloudflare.com/code-execution-with-mcp/)
- [Anthropic: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)

### Recommended Setup for Power Users
For lower-noise, repeatable MCP usage, start with codemode-oriented routing:
- [codemode-mcp (jx-codes)](https://github.com/jx-codes/codemode-mcp)
- [UTCP](https://www.utcp.io)

Even with strong setup, model behavior can be hit-or-miss across providers and versions. Keep retries and deterministic fallbacks.

### Peter Steinberger Workflow Pattern
A high-leverage pattern is turning broad MCP tool surfaces into narrower CLI/task interfaces:
- [MCPorter](https://github.com/steipete/mcporter)
- [OpenClaw](https://github.com/steipete/openclaw)

### What Works Best With Which MCP Clients
- Claude Code / Codex / Cursor agent workflows: usually strong for direct MCP + code-execution loops.
- Thin hosted chat clients: often safer with wrapped CLIs/gateways instead of full raw tool exposure.
- High-tool-count servers: usually better when split into narrow task gateways.

This ecosystem changes quickly. If you are reading this now, parts of this section may already be out of date.

### Prompt Injection: Risks, Consequences, and Mitigations
Prompt injection remains an open problem for tool-using agents. It is manageable, but not solved.

Primary risks:
- Hidden instructions in retrieved content or tool output.
- Secret/token exfiltration through unintended calls.
- Unauthorized state changes in systems or data.

Mitigation baseline:
- Least-privilege credentials and scoped tokens.
- Destination/action allowlists and strict schema validation.
- Human confirmation for destructive operations.
- Sandboxed execution and resource limits.
- Structured logging and replayable execution traces.

Treat every tool output as untrusted input unless explicitly verified.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">
  <strong>Canvas MCP Server v2.4.0</strong><br>
  <em>A safe, read-only Canvas integration for students</em><br><br>
  
  ⭐ **Star this repo if it helps you!** ⭐
</div>
