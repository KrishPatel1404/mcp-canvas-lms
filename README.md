# Canvas MCP Server v2.0

> A comprehensive Model Context Protocol (MCP) server for Canvas LMS with complete student and instructor functionality


## What's New in v2.0

- **Complete Student Experience**: 40+ tools covering all student workflows
- **Remote Ready**: Docker, Kubernetes, and cloud deployment support
- **Fully Tested**: Comprehensive test suite with 90%+ coverage
- **Production Grade**: Robust error handling, retry logic, health monitoring
- **Modern Stack**: TypeScript, async/await, automatic pagination
- **Real-time**: Dashboard updates, upcoming assignments, calendar integration

## Key Features

### For Students
- **Course Management**: Access all courses, syllabi, and course materials
- **Assignment Workflow**: View, submit (text/URL/files), and track assignments
- **Communication**: Participate in discussions, read announcements, send messages
- **Progress Tracking**: Monitor grades, module completion, and calendar events
- **Quizzes**: Take quizzes, view results and feedback
- **File Access**: Browse and download course files and resources

### For Instructors
- **Course Creation**: Create and manage course structure
- **Grading**: Grade submissions, provide feedback, manage rubrics
- **User Management**: Enroll students, manage permissions
- **Content Management**: Create assignments, quizzes, discussions

### Technical Excellence
- **Robust API**: Automatic retries, pagination, comprehensive error handling
- **Cloud Ready**: Docker containers, Kubernetes manifests, health checks
- **Well Tested**: Unit tests, integration tests, mocking, coverage reports
- **Type Safe**: Full TypeScript implementation with strict types

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
  -e CANVAS_API_TOKEN="your_token" \
  -e CANVAS_DOMAIN="school.instructure.com" \
  ghcr.io/dmontgomery40/mcp-canvas-lms:latest
```

## Student Workflow Examples

### Check Today's Assignments
```
"What assignments do I have due this week?"
```
**Lists upcoming assignments with due dates, points, and submission status**

### Submit an Assignment
```
"Help me submit my essay for English 101 Assignment 3"
```
**Guides through text submission with formatting options**

### Check Grades
```
"What's my current grade in Biology?"
```
**Shows current scores, grades, and assignment feedback**

### Participate in Discussions
```
"Show me the latest discussion posts in my Philosophy class"
```
**Displays recent discussion topics and enables posting responses**

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

## Production Deployment

### Docker Compose
```bash
git clone https://github.com/DMontgomery40/mcp-canvas-lms.git
cd mcp-canvas-lms
cp .env.example .env
# Edit .env with your Canvas credentials
docker-compose up -d
```

### Kubernetes
```bash
kubectl create secret generic canvas-mcp-secrets \
  --from-literal=CANVAS_API_TOKEN="your_token" \
  --from-literal=CANVAS_DOMAIN="school.instructure.com"

kubectl apply -f k8s/
```

### Health Monitoring
```bash
# Check application health
curl http://localhost:3000/health

# Or use the built-in health check
npm run health-check
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

## 📚 Available Tools

<details>
<summary><strong>Core Student Tools (Click to expand)</strong></summary>

- `canvas_health_check` - Check API connectivity
- `canvas_list_courses` - List all your courses
- `canvas_get_course` - Get detailed course info
- `canvas_list_assignments` - List course assignments
- `canvas_get_assignment` - Get assignment details
- `canvas_submit_assignment` - Submit assignment work
- `canvas_get_submission` - Check submission status
- `canvas_list_modules` - List course modules
- `canvas_mark_module_item_complete` - Mark items complete
- `canvas_list_discussions` - List discussion topics
- `canvas_post_to_discussion` - Post to discussions
- `canvas_list_announcements` - List course announcements
- `canvas_get_user_grades` - Get your grades
- `canvas_get_dashboard` - Get dashboard info
- `canvas_get_upcoming_assignments` - Get due dates
- `canvas_list_calendar_events` - List calendar events
- `canvas_list_files` - List course files
- `canvas_list_pages` - List course pages
- `canvas_get_page` - Get page content
- `canvas_list_conversations` - List messages
- `canvas_create_conversation` - Send messages

</details>

<details>
<summary><strong>👨‍🏫 Instructor Tools (Click to expand)</strong></summary>

- `canvas_create_course` - Create new courses
- `canvas_update_course` - Update course settings
- `canvas_create_assignment` - Create assignments
- `canvas_update_assignment` - Update assignments
- `canvas_submit_grade` - Grade submissions
- `canvas_enroll_user` - Enroll students
- `canvas_create_quiz` - Create quizzes
- `canvas_update_quiz` - Update quizzes

</details>

## 🌟 Example Claude Conversations

**Student**: *"I need to check my upcoming assignments and submit my English essay"*

**Claude**: *I'll help you check your upcoming assignments and then assist with submitting your English essay. Let me start by getting your upcoming assignments...*

[Claude uses `canvas_get_upcoming_assignments` then helps with `canvas_submit_assignment`]

---

**Student**: *"What's my current grade in Biology and what assignments am I missing?"*

**Claude**: *I'll check your Biology grades and identify any missing assignments...*

[Claude uses `canvas_get_course_grades` and `canvas_list_assignments` with submission status]

## 🔍 Troubleshooting

**Common Issues:**
- ❌ **401 Unauthorized**: Check your API token and permissions
- ❌ **404 Not Found**: Verify course/assignment IDs and access rights  
- ❌ **Timeout**: Increase `CANVAS_TIMEOUT` or check network connectivity

**Debug Mode:**
```bash
export LOG_LEVEL=debug
npm start
```

**Health Check:**
```bash
npm run health-check
```

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Contribution Setup
```bash
git clone https://github.com/DMontgomery40/mcp-canvas-lms.git
cd mcp-canvas-lms
npm install
npm run dev:watch
# Make changes, add tests, submit PR
```

## 📈 Roadmap

- **v2.1**: Real-time notifications, bulk operations, advanced search
- **v2.2**: Mobile support, offline capability, analytics dashboard  
- **v3.0**: Multi-tenant, GraphQL API, AI-powered insights

## 🙋 Support & Community

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/DMontgomery40/mcp-canvas-lms/issues)
- 💬 **Questions**: [GitHub Discussions](https://github.com/DMontgomery40/mcp-canvas-lms/discussions)
- 📖 **Documentation**: [Wiki](https://github.com/DMontgomery40/mcp-canvas-lms/wiki)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">
  <strong>Canvas MCP Server v2.0</strong><br>
  <em>Empowering students and educators with seamless Canvas integration</em><br><br>
  
  ⭐ **Star this repo if it helps you!** ⭐
</div>