#!/usr/bin/env node

// src/index.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { CanvasClient } from './client.js';
import * as dotenv from 'dotenv';
import { CanvasCourse, MCPServerConfig, CanvasAPIError } from './types.js';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import { type Readable, type Writable } from 'node:stream';
import { type AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Student-only tools (instructor/admin tools have been removed)
const RAW_TOOLS: Tool[] = [
  // Health and system tools
  {
    name: 'canvas_health_check',
    description: 'Check the health and connectivity of the Canvas API',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // Course management
  {
    name: 'canvas_list_courses',
    description: 'List all courses for the current user',
    inputSchema: {
      type: 'object',
      properties: {
        include_ended: { type: 'boolean', description: 'Include ended courses' },
      },
      required: [],
    },
  },
  {
    name: 'canvas_get_course',
    description: 'Get detailed information about a specific course',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
      },
      required: ['course_id'],
    },
  },
  // Assignment management
  {
    name: 'canvas_list_assignments',
    description: 'List assignments for a course',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
        include_submissions: { type: 'boolean', description: 'Include submission data' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'canvas_get_assignment',
    description: 'Get detailed information about a specific assignment',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
        assignment_id: { type: 'number', description: 'ID of the assignment' },
        include_submission: { type: 'boolean', description: "Include user's submission data" },
      },
      required: ['course_id', 'assignment_id'],
    },
  },
  // Assignment groups
  {
    name: 'canvas_list_assignment_groups',
    description: 'List assignment groups for a course',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
      },
      required: ['course_id'],
    },
  },

  // Submissions and grading
  {
    name: 'canvas_get_submission',
    description: 'Get submission details for an assignment',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
        assignment_id: { type: 'number', description: 'ID of the assignment' },
        user_id: { type: 'number', description: 'ID of the user (optional, defaults to self)' },
      },
      required: ['course_id', 'assignment_id'],
    },
  },
  // Files and uploads
  {
    name: 'canvas_list_files',
    description: 'List files in a course or folder',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
        folder_id: { type: 'number', description: 'ID of the folder (optional)' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'canvas_get_file',
    description: 'Get information about a specific file',
    inputSchema: {
      type: 'object',
      properties: {
        file_id: { type: 'number', description: 'ID of the file' },
      },
      required: ['file_id'],
    },
  },
  {
    name: 'canvas_list_folders',
    description: 'List folders in a course',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
      },
      required: ['course_id'],
    },
  },

  // Pages
  {
    name: 'canvas_list_pages',
    description: 'List pages in a course',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'canvas_get_page',
    description: 'Get content of a specific page',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
        page_url: { type: 'string', description: 'URL slug of the page' },
      },
      required: ['course_id', 'page_url'],
    },
  },

  // Calendar and due dates
  {
    name: 'canvas_list_calendar_events',
    description: 'List calendar events',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date (ISO format)' },
        end_date: { type: 'string', description: 'End date (ISO format)' },
      },
      required: [],
    },
  },
  {
    name: 'canvas_get_upcoming_assignments',
    description: 'Get upcoming assignment due dates',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of assignments to return' },
      },
      required: [],
    },
  },

  // Dashboard
  {
    name: 'canvas_get_dashboard_cards',
    description: 'Get dashboard course cards',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // Grades
  {
    name: 'canvas_get_course_grades',
    description: 'Get grades for a course',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
      },
      required: ['course_id'],
    },
  },

  // User management
  {
    name: 'canvas_get_user_profile',
    description: "Get current user's profile",
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // Modules
  {
    name: 'canvas_list_modules',
    description: 'List all modules in a course',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'canvas_get_module',
    description: 'Get details of a specific module',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
        module_id: { type: 'number', description: 'ID of the module' },
      },
      required: ['course_id', 'module_id'],
    },
  },
  {
    name: 'canvas_list_module_items',
    description: 'List all items in a module',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
        module_id: { type: 'number', description: 'ID of the module' },
      },
      required: ['course_id', 'module_id'],
    },
  },
  {
    name: 'canvas_get_module_item',
    description: 'Get details of a specific module item',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
        module_id: { type: 'number', description: 'ID of the module' },
        item_id: { type: 'number', description: 'ID of the module item' },
      },
      required: ['course_id', 'module_id', 'item_id'],
    },
  },

  // Announcements
  {
    name: 'canvas_list_announcements',
    description: 'List all announcements in a course',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
      },
      required: ['course_id'],
    },
  },

  // Quizzes
  {
    name: 'canvas_list_quizzes',
    description: 'List all quizzes in a course',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'canvas_get_quiz',
    description: 'Get details of a specific quiz',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
        quiz_id: { type: 'number', description: 'ID of the quiz' },
      },
      required: ['course_id', 'quiz_id'],
    },
  },

  // Notifications
  {
    name: 'canvas_list_notifications',
    description: "List user's notifications",
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // Syllabus
  {
    name: 'canvas_get_syllabus',
    description: 'Get course syllabus',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'ID of the course' },
      },
      required: ['course_id'],
    },
  },
];

type StructuredToolError = {
  status: 'error';
  retryable: boolean;
  suggestion: string;
  message: string;
  code: 'validation_error' | 'canvas_api_error' | 'unknown_tool' | 'internal_error';
  tool: string;
};

type StreamableHttpRuntime = {
  transport: StreamableHTTPServerTransport;
  httpServer: HttpServer;
};

const READ_ONLY_TOOL_PREFIXES = ['canvas_list_', 'canvas_get_', 'canvas_health_check'] as const;
const MUTATING_TOOL_PREFIXES: readonly string[] = [];

function getInputSchema(tool: Tool): Record<string, unknown> {
  return (tool.inputSchema as Record<string, unknown> | undefined) ?? {};
}

function getRequiredFields(tool: Tool): string[] {
  const schema = getInputSchema(tool);
  const required = schema.required;
  return Array.isArray(required)
    ? required.filter((value): value is string => typeof value === 'string')
    : [];
}

function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isMutatingTool(name: string): boolean {
  return MUTATING_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function optimizeToolDescription(tool: Tool): string {
  const required = getRequiredFields(tool);
  const parts = [tool.description ?? 'Canvas LMS tool'];
  if (required.length > 0) {
    parts.push(`Required: ${required.join(', ')}.`);
  }
  return parts.join(' ');
}

function optimizeToolAnnotations(toolName: string): Tool['annotations'] {
  if (isReadOnlyTool(toolName)) {
    return {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    };
  }

  if (isMutatingTool(toolName)) {
    return {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    };
  }

  return {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  };
}

function optimizeToolInputSchema(tool: Tool): Tool['inputSchema'] {
  const schema = getInputSchema(tool);
  const properties = (schema.properties as Record<string, unknown> | undefined) ?? {};
  const required = (schema.required as string[] | undefined) ?? [];

  const optimizedProperties: Record<string, unknown> = {
    ...properties,
  };

  if (!Object.prototype.hasOwnProperty.call(optimizedProperties, 'include_raw')) {
    optimizedProperties.include_raw = {
      type: 'boolean',
      default: false,
      description: 'When true, return full raw Canvas API payload for this tool call.',
    };
  }

  return {
    type: 'object',
    ...schema,
    properties: optimizedProperties,
    required,
    additionalProperties: false,
  } as Tool['inputSchema'];
}

const TOOLS: Tool[] = RAW_TOOLS.map((tool) => ({
  ...tool,
  description: optimizeToolDescription(tool),
  inputSchema: optimizeToolInputSchema(tool),
  annotations: optimizeToolAnnotations(tool.name),
}));

export class CanvasMCPServer {
  private readonly server: Server;
  private readonly client: CanvasClient;
  private readonly config: MCPServerConfig;
  private streamableHttpRuntime: StreamableHttpRuntime | undefined;

  constructor(config: MCPServerConfig, client?: CanvasClient) {
    this.config = config;
    this.client =
      client ??
      new CanvasClient(config.canvas.token, config.canvas.domain, {
        maxRetries: config.canvas.maxRetries,
        retryDelay: config.canvas.retryDelay,
        timeout: config.canvas.timeout,
      });

    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error(`[${this.config.name} Error]`, error);
    };
  }

  private serializeToolOutput(payload: unknown, includeRaw: boolean): string {
    if (includeRaw) {
      return JSON.stringify(payload);
    }

    if (Array.isArray(payload)) {
      return JSON.stringify({
        count: payload.length,
        items: payload.slice(0, 5),
        has_more: payload.length > 5,
      });
    }

    return JSON.stringify(payload);
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof CanvasAPIError && typeof error.statusCode === 'number') {
      return error.statusCode === 429 || error.statusCode >= 500;
    }

    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('temporarily') ||
      message.includes('rate limit')
    );
  }

  private toStructuredToolError(toolName: string, error: unknown): StructuredToolError {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.startsWith('Missing required field') ||
      message.startsWith('Missing required fields')
    ) {
      return {
        status: 'error',
        retryable: false,
        suggestion: 'Provide all required fields shown in tools/list inputSchema and retry.',
        message,
        code: 'validation_error',
        tool: toolName,
      };
    }

    if (message.startsWith('Unknown tool')) {
      return {
        status: 'error',
        retryable: false,
        suggestion: 'Call tools/list and use an exact tool name from that list.',
        message,
        code: 'unknown_tool',
        tool: toolName,
      };
    }

    if (error instanceof CanvasAPIError) {
      return {
        status: 'error',
        retryable: this.isRetryable(error),
        suggestion:
          'Verify Canvas permissions, account/course IDs, and retry for transient Canvas failures.',
        message,
        code: 'canvas_api_error',
        tool: toolName,
      };
    }

    return {
      status: 'error',
      retryable: this.isRetryable(error),
      suggestion: 'Review input values and server logs, then retry.',
      message,
      code: 'internal_error',
      tool: toolName,
    };
  }

  private setupHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const courses = await this.client.listCourses();

        return {
          resources: [
            {
              uri: 'canvas://health',
              name: 'Canvas Health Status',
              description: 'Health check and API connectivity status',
              mimeType: 'application/json',
            },
            {
              uri: 'courses://list',
              name: 'All Courses',
              description: 'List of all available Canvas courses',
              mimeType: 'application/json',
            },
            ...courses.map((course: CanvasCourse) => ({
              uri: `course://${course.id}`,
              name: `Course: ${course.name}`,
              description: `${course.course_code} - ${course.name}`,
              mimeType: 'application/json',
            })),
            ...courses.map((course: CanvasCourse) => ({
              uri: `assignments://${course.id}`,
              name: `Assignments: ${course.name}`,
              description: `Assignments for ${course.name}`,
              mimeType: 'application/json',
            })),
            ...courses.map((course: CanvasCourse) => ({
              uri: `modules://${course.id}`,
              name: `Modules: ${course.name}`,
              description: `Modules for ${course.name}`,
              mimeType: 'application/json',
            })),
            ...courses.map((course: CanvasCourse) => ({
              uri: `announcements://${course.id}`,
              name: `Announcements: ${course.name}`,
              description: `Announcements for ${course.name}`,
              mimeType: 'application/json',
            })),
            ...courses.map((course: CanvasCourse) => ({
              uri: `quizzes://${course.id}`,
              name: `Quizzes: ${course.name}`,
              description: `Quizzes for ${course.name}`,
              mimeType: 'application/json',
            })),
            ...courses.map((course: CanvasCourse) => ({
              uri: `pages://${course.id}`,
              name: `Pages: ${course.name}`,
              description: `Pages for ${course.name}`,
              mimeType: 'application/json',
            })),
            ...courses.map((course: CanvasCourse) => ({
              uri: `files://${course.id}`,
              name: `Files: ${course.name}`,
              description: `Files for ${course.name}`,
              mimeType: 'application/json',
            })),
            {
              uri: 'profile://user',
              name: 'User Profile',
              description: "Current user's profile information",
              mimeType: 'application/json',
            },
            {
              uri: 'calendar://upcoming',
              name: 'Upcoming Events',
              description: 'Upcoming assignments and events',
              mimeType: 'application/json',
            },
          ],
        };
      } catch (error) {
        console.error('Error listing resources:', error);
        return { resources: [] };
      }
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const [type, id] = uri.split('://');

      try {
        let content;

        switch (type) {
          case 'canvas':
            if (id === 'health') {
              content = await this.client.healthCheck();
            }
            break;

          case 'courses':
            content = await this.client.listCourses();
            break;

          case 'course':
            content = await this.client.getCourse(parseInt(id));
            break;

          case 'assignments':
            content = await this.client.listAssignments(parseInt(id), true);
            break;

          case 'modules':
            content = await this.client.listModules(parseInt(id));
            break;

          case 'announcements':
            content = await this.client.listAnnouncements(id);
            break;

          case 'quizzes':
            content = await this.client.listQuizzes(id);
            break;

          case 'pages':
            content = await this.client.listPages(parseInt(id));
            break;

          case 'files':
            content = await this.client.listFiles(parseInt(id));
            break;

          case 'profile':
            if (id === 'user') {
              content = await this.client.getUserProfile();
            }
            break;

          case 'calendar':
            if (id === 'upcoming') {
              content = await this.client.getUpcomingAssignments();
            }
            break;

          default:
            throw new Error(`Unknown resource type: ${type}`);
        }

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'application/json',
              text: JSON.stringify(content),
            },
          ],
        };
      } catch (error) {
        console.error(`Error reading resource ${uri}:`, error);
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // Handle tool calls with comprehensive error handling
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const rawArgs = (request.params.arguments ?? {}) as Record<string, unknown>;
        const includeRaw = rawArgs.include_raw === true;
        const { include_raw: _includeRaw, ...args } = rawArgs;
        const toolName = request.params.name;

        console.error(`[Canvas MCP] Executing tool: ${toolName}`);

        switch (toolName) {
          // Health check
          case 'canvas_health_check': {
            const health = await this.client.healthCheck();
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(health, includeRaw) }],
            };
          }

          // Course management
          case 'canvas_list_courses': {
            const { include_ended = false } = args as { include_ended?: boolean };
            const courses = await this.client.listCourses(include_ended);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(courses, includeRaw) }],
            };
          }

          case 'canvas_get_course': {
            const { course_id } = args as { course_id: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const course = await this.client.getCourse(course_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(course, includeRaw) }],
            };
          }

          // Assignment management
          case 'canvas_list_assignments': {
            const { course_id, include_submissions = false } = args as {
              course_id: number;
              include_submissions?: boolean;
            };
            if (!course_id) throw new Error('Missing required field: course_id');

            const assignments = await this.client.listAssignments(course_id, include_submissions);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(assignments, includeRaw) }],
            };
          }

          case 'canvas_get_assignment': {
            const {
              course_id,
              assignment_id,
              include_submission = false,
            } = args as {
              course_id: number;
              assignment_id: number;
              include_submission?: boolean;
            };
            if (!course_id || !assignment_id) {
              throw new Error('Missing required fields: course_id and assignment_id');
            }

            const assignment = await this.client.getAssignment(
              course_id,
              assignment_id,
              include_submission
            );
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(assignment, includeRaw) }],
            };
          }

          case 'canvas_list_assignment_groups': {
            const { course_id } = args as { course_id: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const groups = await this.client.listAssignmentGroups(course_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(groups, includeRaw) }],
            };
          }

          // Submissions
          case 'canvas_get_submission': {
            const { course_id, assignment_id, user_id } = args as {
              course_id: number;
              assignment_id: number;
              user_id?: number;
            };
            if (!course_id || !assignment_id) {
              throw new Error('Missing required fields: course_id and assignment_id');
            }

            const submission = await this.client.getSubmission(
              course_id,
              assignment_id,
              user_id || 'self'
            );
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(submission, includeRaw) }],
            };
          }

          // Files
          case 'canvas_list_files': {
            const { course_id, folder_id } = args as { course_id: number; folder_id?: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const files = await this.client.listFiles(course_id, folder_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(files, includeRaw) }],
            };
          }

          case 'canvas_get_file': {
            const { file_id } = args as { file_id: number };
            if (!file_id) throw new Error('Missing required field: file_id');

            const file = await this.client.getFile(file_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(file, includeRaw) }],
            };
          }

          case 'canvas_list_folders': {
            const { course_id } = args as { course_id: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const folders = await this.client.listFolders(course_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(folders, includeRaw) }],
            };
          }

          // Pages
          case 'canvas_list_pages': {
            const { course_id } = args as { course_id: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const pages = await this.client.listPages(course_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(pages, includeRaw) }],
            };
          }

          case 'canvas_get_page': {
            const { course_id, page_url } = args as { course_id: number; page_url: string };
            if (!course_id || !page_url) {
              throw new Error('Missing required fields: course_id and page_url');
            }

            const page = await this.client.getPage(course_id, page_url);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(page, includeRaw) }],
            };
          }

          // Calendar
          case 'canvas_list_calendar_events': {
            const { start_date, end_date } = args as { start_date?: string; end_date?: string };
            const events = await this.client.listCalendarEvents(start_date, end_date);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(events, includeRaw) }],
            };
          }

          case 'canvas_get_upcoming_assignments': {
            const { limit = 10 } = args as { limit?: number };
            const assignments = await this.client.getUpcomingAssignments(limit);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(assignments, includeRaw) }],
            };
          }

          // Dashboard
          case 'canvas_get_dashboard_cards': {
            const cards = await this.client.getDashboardCards();
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(cards, includeRaw) }],
            };
          }

          // User management
          case 'canvas_get_user_profile': {
            const profile = await this.client.getUserProfile();
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(profile, includeRaw) }],
            };
          }

          // Grades
          case 'canvas_get_course_grades': {
            const { course_id } = args as { course_id: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const grades = await this.client.getCourseGrades(course_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(grades, includeRaw) }],
            };
          }

          // Modules
          case 'canvas_list_modules': {
            const { course_id } = args as { course_id: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const modules = await this.client.listModules(course_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(modules, includeRaw) }],
            };
          }

          case 'canvas_get_module': {
            const { course_id, module_id } = args as { course_id: number; module_id: number };
            if (!course_id || !module_id) {
              throw new Error('Missing required fields: course_id and module_id');
            }

            const module = await this.client.getModule(course_id, module_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(module, includeRaw) }],
            };
          }

          case 'canvas_list_module_items': {
            const { course_id, module_id } = args as { course_id: number; module_id: number };
            if (!course_id || !module_id) {
              throw new Error('Missing required fields: course_id and module_id');
            }

            const moduleItems = await this.client.listModuleItems(course_id, module_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(moduleItems, includeRaw) }],
            };
          }

          case 'canvas_get_module_item': {
            const { course_id, module_id, item_id } = args as {
              course_id: number;
              module_id: number;
              item_id: number;
            };
            if (!course_id || !module_id || !item_id) {
              throw new Error('Missing required fields: course_id, module_id, and item_id');
            }

            const moduleItem = await this.client.getModuleItem(course_id, module_id, item_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(moduleItem, includeRaw) }],
            };
          }

          // Announcements
          case 'canvas_list_announcements': {
            const { course_id } = args as { course_id: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const announcements = await this.client.listAnnouncements(String(course_id));
            return {
              content: [
                { type: 'text', text: this.serializeToolOutput(announcements, includeRaw) },
              ],
            };
          }

          // Quizzes
          case 'canvas_list_quizzes': {
            const { course_id } = args as { course_id: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const quizzes = await this.client.listQuizzes(String(course_id));
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(quizzes, includeRaw) }],
            };
          }

          case 'canvas_get_quiz': {
            const { course_id, quiz_id } = args as { course_id: number; quiz_id: number };
            if (!course_id || !quiz_id) {
              throw new Error('Missing required fields: course_id and quiz_id');
            }

            const quiz = await this.client.getQuiz(String(course_id), quiz_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(quiz, includeRaw) }],
            };
          }

          // Notifications
          case 'canvas_list_notifications': {
            const notifications = await this.client.listNotifications();
            return {
              content: [
                { type: 'text', text: this.serializeToolOutput(notifications, includeRaw) },
              ],
            };
          }

          case 'canvas_get_syllabus': {
            const { course_id } = args as { course_id: number };
            if (!course_id) throw new Error('Missing required field: course_id');

            const syllabus = await this.client.getSyllabus(course_id);
            return {
              content: [{ type: 'text', text: this.serializeToolOutput(syllabus, includeRaw) }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }
      } catch (error) {
        console.error(`Error executing tool ${request.params.name}:`, error);
        const structuredError = this.toStructuredToolError(request.params.name, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(structuredError),
            },
          ],
          structuredContent: structuredError,
          isError: true,
        };
      }
    });
  }

  private async parseHttpRequestBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
      return undefined;
    }

    const rawBody = Buffer.concat(chunks).toString('utf8').trim();
    if (!rawBody) {
      return undefined;
    }

    return JSON.parse(rawBody);
  }

  private getHttpConfig() {
    return {
      host: this.config.transport?.http?.host ?? '127.0.0.1',
      port: this.config.transport?.http?.port ?? 3000,
      path: this.config.transport?.http?.path ?? '/mcp',
      statefulSession: this.config.transport?.http?.statefulSession ?? true,
      enableJsonResponse: this.config.transport?.http?.enableJsonResponse ?? true,
      allowedOrigins: this.config.transport?.http?.allowedOrigins ?? [],
    };
  }

  private isAllowedOrigin(req: IncomingMessage): boolean {
    const { allowedOrigins } = this.getHttpConfig();
    if (allowedOrigins.length === 0) {
      return true;
    }

    const origin = req.headers.origin;
    if (!origin) {
      return true;
    }

    return allowedOrigins.includes(origin);
  }

  async connectStdio(stdin?: Readable, stdout?: Writable): Promise<void> {
    const transport = new StdioServerTransport(stdin, stdout);
    await this.server.connect(transport);
    console.error(`${this.config.name} running on stdio`);
  }

  async connectStreamableHttp(): Promise<void> {
    if (this.streamableHttpRuntime) {
      return;
    }

    const httpConfig = this.getHttpConfig();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: httpConfig.statefulSession ? () => randomUUID() : undefined,
      enableJsonResponse: httpConfig.enableJsonResponse,
    });
    await this.server.connect(transport);

    const requestHandler = async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        if (url.pathname !== httpConfig.path) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Not Found' }));
          return;
        }

        if (!this.isAllowedOrigin(req)) {
          res.statusCode = 403;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Forbidden origin' }));
          return;
        }

        const method = req.method?.toUpperCase() ?? 'GET';
        if (!['POST', 'GET', 'DELETE'].includes(method)) {
          res.statusCode = 405;
          res.setHeader('allow', 'POST, GET, DELETE');
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let parsedBody: unknown;
        if (method === 'POST') {
          try {
            parsedBody = await this.parseHttpRequestBody(req);
          } catch {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
          }
        }

        await transport.handleRequest(req, res, parsedBody);
      } catch (error) {
        console.error(`Error handling streamable-http request:`, error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal server error',
              },
              id: null,
            })
          );
        }
      }
    };

    const httpServer = createHttpServer((req, res) => {
      void requestHandler(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(httpConfig.port, httpConfig.host, () => resolve());
    });

    this.streamableHttpRuntime = { transport, httpServer };
    console.error(
      `${this.config.name} running on streamable-http at http://${httpConfig.host}:${httpConfig.port}${httpConfig.path}`
    );
  }

  getStreamableHttpUrl(): string | undefined {
    if (!this.streamableHttpRuntime) {
      return undefined;
    }

    const httpConfig = this.getHttpConfig();
    const address = this.streamableHttpRuntime.httpServer.address();
    if (!address || typeof address === 'string') {
      return undefined;
    }

    const info = address as AddressInfo;
    return `http://${httpConfig.host}:${info.port}${httpConfig.path}`;
  }

  async close(): Promise<void> {
    if (this.streamableHttpRuntime) {
      await this.streamableHttpRuntime.transport.close();
      await new Promise<void>((resolve, reject) => {
        this.streamableHttpRuntime?.httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      this.streamableHttpRuntime = undefined;
    }

    await this.server.close();
  }

  async run(): Promise<void> {
    const mode = this.config.transport?.mode ?? 'stdio';
    if (mode === 'streamable-http') {
      await this.connectStreamableHttp();
      return;
    }

    await this.connectStdio();
  }
}

export function loadEnvironmentVariables(): void {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const envPaths = [
    '.env',
    'src/.env',
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env'),
  ];

  let loaded = false;
  for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (result.parsed) {
      console.error(`Loaded environment from: ${envPath}`);
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    console.error('Warning: No .env file found');
  }
}

export function loadConfigFromEnvironment(env = process.env): MCPServerConfig {
  const token = env.CANVAS_API_TOKEN;
  const domain = env.CANVAS_DOMAIN;

  if (!token || !domain) {
    throw new Error(
      'Missing required environment variables: CANVAS_API_TOKEN and CANVAS_DOMAIN are required.'
    );
  }

  const transportMode = env.MCP_TRANSPORT === 'streamable-http' ? 'streamable-http' : 'stdio';
  const allowedOrigins = (env.MCP_HTTP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    name: 'canvas-mcp-server',
    version: '2.4.1',
    canvas: {
      token,
      domain,
      maxRetries: parseInt(env.CANVAS_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(env.CANVAS_RETRY_DELAY || '1000', 10),
      timeout: parseInt(env.CANVAS_TIMEOUT || '30000', 10),
    },
    logging: {
      level: (env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    },
    transport: {
      mode: transportMode,
      http: {
        host: env.MCP_HTTP_HOST || '127.0.0.1',
        port: parseInt(env.MCP_HTTP_PORT || '3000', 10),
        path: env.MCP_HTTP_PATH || '/mcp',
        statefulSession: (env.MCP_HTTP_STATEFUL || 'true') !== 'false',
        enableJsonResponse: (env.MCP_HTTP_JSON_RESPONSE || 'true') !== 'false',
        allowedOrigins,
      },
    },
  };
}

export async function main(): Promise<void> {
  loadEnvironmentVariables();

  let server: CanvasMCPServer | undefined;
  try {
    const config = loadConfigFromEnvironment(process.env);
    server = new CanvasMCPServer(config);

    const shutdown = async (signal: string) => {
      console.error(`Received ${signal}, shutting down...`);
      if (server) {
        await server.close();
      }
      process.exit(0);
    };

    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    await server.run();
  } catch (error) {
    console.error('Fatal error:', error);
    if (server) {
      await server.close().catch((closeError) => {
        console.error('Error while closing server:', closeError);
      });
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
