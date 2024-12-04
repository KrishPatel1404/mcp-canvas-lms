import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SearchResourcesRequestSchema,
  WatchResourcesRequestSchema,
  ResourceUpdateMessage,
  type ListResourcesRequest,
  type ReadResourceRequest,
  type SearchResourcesRequest,
  type WatchResourcesRequest
} from "@modelcontextprotocol/sdk/schema/index.js";
import axios from "axios";

interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  start_at?: string;
  end_at?: string;
  term?: {
    id: number;
    name: string;
  };
  total_students?: number;
  teachers?: Array<{
    id: number;
    display_name: string;
  }>;
}

interface CanvasModule {
  id: number;
  name: string;
  position: number;
  unlock_at?: string;
  require_sequential_progress: boolean;
  items_count: number;
  items_url: string;
}

interface CanvasAssignment {
  id: number;
  name: string;
  description: string;
  due_at?: string;
  points_possible: number;
  submission_types: string[];
  has_submitted_submissions: boolean;
  published: boolean;
}

interface CanvasSubmission {
  id: number;
  assignment_id: number;
  user_id: number;
  submitted_at?: string;
  score?: number;
  grade?: string;
  submission_comments?: Array<{
    id: number;
    comment: string;
    author_name: string;
    created_at: string;
  }>;
}

interface ResourceMetadata {
  code?: string;
  term?: string;
  startDate?: string;
  endDate?: string;
  students?: number;
}

interface WatchedResource {
  lastCheck: Date;
  lastContent: unknown;
}

class CanvasAPI {
  private api: AxiosInstance;

  constructor(baseURL: string, accessToken: string) {
    this.api = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async listCourses(include: string[] = []): Promise<CanvasCourse[]> {
    try {
      const response = await this.api.get('/api/v1/courses', {
        params: { include: include.join(',') }
      });
      return response.data;
    } catch (error) {
      throw this.handleError('Failed to list courses', error as AxiosError);
    }
  }

  async getCourse(courseId: string | number, include: string[] = []): Promise<CanvasCourse> {
    try {
      const response = await this.api.get(`/api/v1/courses/${courseId}`, {
        params: { include: include.join(',') }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(`Failed to get course ${courseId}`, error as AxiosError);
    }
  }

  async listModules(courseId: string | number): Promise<CanvasModule[]> {
    try {
      const response = await this.api.get(`/api/v1/courses/${courseId}/modules`);
      return response.data;
    } catch (error) {
      throw this.handleError(`Failed to list modules for course ${courseId}`, error as AxiosError);
    }
  }

  async listAssignments(courseId: string | number, include: string[] = []): Promise<CanvasAssignment[]> {
    try {
      const response = await this.api.get(`/api/v1/courses/${courseId}/assignments`, {
        params: { include: include.join(',') }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(`Failed to list assignments for course ${courseId}`, error as AxiosError);
    }
  }

  async listSubmissions(
    courseId: string | number, 
    assignmentId: string | number, 
    include: string[] = []
  ): Promise<CanvasSubmission[]> {
    try {
      const response = await this.api.get(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
        { params: { include: include.join(',') } }
      );
      return response.data;
    } catch (error) {
      throw this.handleError(`Failed to list submissions for assignment ${assignmentId}`, error as AxiosError);
    }
  }

  private handleError(message: string, error: AxiosError): Error {
    console.error(`Canvas API Error: ${message}`, error.response?.data || error);
    return new Error(
      `${message}: ${
        (error.response?.data as any)?.errors?.[0]?.message || error.message
      }`
    );
  }
}

class CanvasMCPServer {
  private canvasAPI: CanvasAPI;
  private server: Server;
  private watchedResources: Map<string, WatchedResource>;
  private readonly pollInterval: number = 30000;

  constructor(canvasURL: string, accessToken: string) {
    this.canvasAPI = new CanvasAPI(canvasURL, accessToken);
    this.watchedResources = new Map();
    
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
      async (request: ListResourcesRequest) => {
        const courses = await this.canvasAPI.listCourses(['term', 'total_students']);
        
        return {
          resources: courses.map(course => ({
            uri: `canvas:///courses/${course.id}`,
            name: course.name,
            metadata: this.createResourceMetadata(course)
          }))
        };
      }
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest) => {
        const uri = request.params.uri;
        const resourceInfo = this.parseResourceURI(uri);
        const content = await this.fetchResourceContent(resourceInfo);
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2)
          }]
        };
      }
    );

    this.server.setRequestHandler(
      SearchResourcesRequestSchema,
      async (request: SearchResourcesRequest) => {
        const query = request.params.query.toLowerCase();
        const courses = await this.canvasAPI.listCourses(['term']);
        
        const matchingCourses = courses.filter(course => 
          course.name.toLowerCase().includes(query) ||
          course.course_code.toLowerCase().includes(query)
        );

        return {
          resources: matchingCourses.map(course => ({
            uri: `canvas:///courses/${course.id}`,
            name: course.name,
            metadata: this.createResourceMetadata(course)
          }))
        };
      }
    );

    this.server.setRequestHandler(
      WatchResourcesRequestSchema,
      async (request: WatchResourcesRequest) => {
        const { resources } = request.params;
        
        for (const resource of resources) {
          if (!this.watchedResources.has(resource)) {
            const resourceInfo = this.parseResourceURI(resource);
            this.watchedResources.set(resource, {
              lastCheck: new Date(),
              lastContent: await this.fetchResourceContent(resourceInfo)
            });
          }
        }

        return { success: true };
      }
    );
  }

  private createResourceMetadata(course: CanvasCourse): ResourceMetadata {
    return {
      code: course.course_code,
      term: course.term?.name,
      startDate: course.start_at,
      endDate: course.end_at,
      students: course.total_students
    };
  }

  private parseResourceURI(uri: string): {
    type: string;
    courseId?: string;
    subType?: string;
    subId?: string;
  } {
    const parts = uri.split('/');
    return {
      type: parts[3],
      courseId: parts[4],
      subType: parts[5],
      subId: parts[6]
    };
  }

  private async fetchResourceContent(resourceInfo: ReturnType<typeof this.parseResourceURI>): Promise<unknown> {
    const { type, courseId, subType, subId } = resourceInfo;

    if (!courseId) {
      throw new Error('Invalid resource URI: missing course ID');
    }

    switch (type) {
      case 'courses': {
        const [course, modules, assignments] = await Promise.all([
          this.canvasAPI.getCourse(courseId, ['term', 'teachers', 'total_students']),
          this.canvasAPI.listModules(courseId),
          this.canvasAPI.listAssignments(courseId, ['submission'])
        ]);

        return { course, modules, assignments };
      }

      case 'assignments': {
        if (subId) {
          if (subType === 'submissions') {
            return await this.canvasAPI.listSubmissions(courseId, subId, ['submission_comments']);
          }
          throw new Error('Unsupported assignment subtype');
        }
        return await this.canvasAPI.listAssignments(courseId, ['submission']);
      }

      default:
        throw new Error(`Unsupported resource type: ${type}`);
    }
  }

  private async startWatchPolling(): Promise<void> {
    setInterval(async () => {
      for (const [uri, data] of this.watchedResources.entries()) {
        try {
          const resourceInfo = this.parseResourceURI(uri);
          const newContent = await this.fetchResourceContent(resourceInfo);

          if (JSON.stringify(newContent) !== JSON.stringify(data.lastContent)) {
            const message = new ResourceUpdateMessage({
              uri,
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(newContent, null, 2)
              }]
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
}

// Environment validation
const canvasURL = process.env.CANVAS_API_URL;
const accessToken = process.env.CANVAS_ACCESS_TOKEN;

if (!canvasURL || !accessToken) {
  console.error('Error: CANVAS_API_URL and CANVAS_ACCESS_TOKEN environment variables are required');
  process.exit(1);
}

// Start server
const server = new CanvasMCPServer(canvasURL, accessToken);
await server.start();