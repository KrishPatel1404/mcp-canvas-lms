import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SearchResourcesRequestSchema,
  WatchResourcesRequestSchema,
  ResourceUpdateMessage
} from "@modelcontextprotocol/sdk/schema/index.js";
import type { CanvasConfig, WatchedResource } from '../types/canvas.js';
import { CanvasAPI } from '../services/canvasAPI.js';
import { createHandlers } from './handlers.js';

export function createCanvasMCPServer(config: CanvasConfig) {
  return new CanvasMCPServer(config);
}
export function createHandlers  (canvasAPI: CanvasAPI) {
  const createResourceMetadata = (course: CanvasCourse): ResourceMetadata => ({
    endDate: course.end_at,
    students: course.total_students
  });
  
  const parseResourceURI = (uri: string) => {
    const parts = uri.split('/');
    return {
      type: parts[3],
      courseId: parts[4],
      subType: parts[5],
      subId: parts[6]
    };
  };

  return {
    async handleListResources(request: ListResourcesRequest) {
      const courses = await canvasAPI.listCourses(['term', 'total_students']);
      
      return {
        resources: courses.map(course => ({
          uri: `canvas:///courses/${course.id}`,
          name: course.name,
          metadata: createResourceMetadata(course)
        }))
      };
    },

    async handleReadResource(request: ReadResourceRequest) {
      const { type, courseId, subType, subId } = parseResourceURI(request.params.uri);

      if (!courseId) {
        throw new Error('Invalid resource URI: missing course ID');
      }

      let content: unknown;

      switch (type) {
        case 'courses': {
          const [course, modules, assignments] = await Promise.all([
            canvasAPI.getCourse(courseId, ['term', 'teachers', 'total_students']),
            canvasAPI.listModules(courseId),
            canvasAPI.listAssignments(courseId, ['submission'])
          ]);
          content = { course, modules, assignments };
          break;
        }

        case 'assignments': {
          if (subId && subType === 'submissions') {
            content = await canvasAPI.listSubmissions(courseId, subId, ['submission_comments']);
          } else {
            content = await canvasAPI.listAssignments(courseId, ['submission']);
          }
          break;
        }

        default:
          throw new Error(`Unsupported resource type: ${type}`);
      }

      return { contents: content };
    },

    async handleSearchResources(request: SearchResourcesRequest) {
      const courses = await canvasAPI.listCourses(['term', 'total_students']);
      const query = request.params.query.toLowerCase();

      const results = courses.filter(course => course.name.toLowerCase().includes(query));

      return {
        resources: results.map(course => ({
          uri: `canvas:///courses/${course.id}`,
          name: course.name,
          metadata: createResourceMetadata(course)
        }))
      };
    },

export class CanvasMCPServer {
  private canvasAPI: CanvasAPI;
  private server: Server;
  private watchedResources: Map<string, WatchedResource>;
  private readonly pollInterval: number = 30000;
  private handlers: ReturnType<typeof createHandlers>;

  constructor(config: CanvasConfig) {
    this.canvasAPI = new CanvasAPI(config);
    this.watchedResources = new Map();
    this.handlers = createHandlers(this.canvasAPI);
    
    this.server = new Server(
      {
        name: "canvas-lms-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {
            courses: true,
            modules: true,
            assignments: true,
            submissions: true
          },
          search: true,
          watch: true
        }
      }
    );

    this.setupRequestHandlers();
    this.startWatchPolling();
  }

  private setupRequestHandlers(): void {
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      this.handlers.handleListResources
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      this.handlers.handleReadResource
    );

    this.server.setRequestHandler(
      SearchResourcesRequestSchema,
      this.handlers.handleSearchResources
    );

    this.server.setRequestHandler(
      WatchResourcesRequestSchema,
      this.handlers.handleWatchResources
    );
  }

  private async startWatchPolling(): Promise<void> {
    setInterval(async () => {
      for (const [uri, data] of this.watchedResources.entries()) {
        try {
          const newContent = await this.handlers.handleReadResource({
            jsonrpc: "2.0",
            id: "polling",
            method: "readResource",
            params: { uri }
          });

          if (JSON.stringify(newContent) !== JSON.stringify(data.lastContent)) {
            const message = new ResourceUpdateMessage({
              uri,
              contents: newContent.contents
            });

            await this.server.broadcast(message);
            
            this.watchedResources.set(uri, {
              lastCheck: new Date(),
              lastContent: newContent
            });
          }
        } catch (error) {
          console.error(`Error polling resource ${uri}:`, error);
        }
      }
    }, this.pollInterval);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Canvas MCP Server started');
  }

  async stop(): Promise<void> {
    // Cleanup watched resources
    this.watchedResources.clear();
    await this.server.disconnect();
  }
}