// src/client.ts

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  CanvasCourse,
  CanvasAssignment,
  CanvasSubmission,
  CanvasUser,
  CanvasEnrollment,
  CanvasAPIError,
  CanvasModule,
  CanvasModuleItem,
  CanvasQuiz,
  CanvasAnnouncement,
  CanvasUserProfile,
  CanvasPage,
  CanvasCalendarEvent,
  CanvasAssignmentGroup,
  CanvasNotification,
  CanvasFile,
  CanvasFolder,
  CanvasDashboardCard,
  CanvasSyllabus,
  CanvasErrorResponse,
  FileUploadArgs,
} from './types.js';

interface RetryableConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
}

export class CanvasClient {
  private client: AxiosInstance;
  private baseURL: string;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;

  constructor(
    token: string,
    domain: string,
    options?: { maxRetries?: number; retryDelay?: number }
  ) {
    this.baseURL = `https://${domain}/api/v1`;
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelay = options?.retryDelay ?? 1000;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.error(`[Canvas API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[Canvas API] Request error:', error.message || error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for pagination and retry logic
    this.client.interceptors.response.use(
      async (response) => {
        const { headers, data } = response;
        const linkHeader = headers.link;
        const contentType = headers['content-type'] || '';

        // Only handle pagination for JSON responses
        if (Array.isArray(data) && linkHeader && contentType.includes('application/json')) {
          let allData = [...data];
          let nextUrl = this.getNextPageUrl(linkHeader);
          const seenUrls = new Set<string>();
          const MAX_PAGES = 100;
          let pageCount = 0;

          while (nextUrl && pageCount < MAX_PAGES) {
            if (seenUrls.has(nextUrl)) {
              console.error('[Canvas API] Pagination loop detected, stopping');
              break;
            }
            seenUrls.add(nextUrl);
            pageCount++;

            const nextResponse = await this.client.get(nextUrl);
            if (!Array.isArray(nextResponse.data) || nextResponse.data.length === 0) break;
            allData = [...allData, ...nextResponse.data];
            nextUrl = this.getNextPageUrl(nextResponse.headers.link);
          }

          response.data = allData;
        }

        return response;
      },
      async (error: AxiosError) => {
        const config = error.config as RetryableConfig | undefined;

        // Retry logic for specific errors
        if (this.shouldRetry(error) && config && (config.__retryCount ?? 0) < this.maxRetries) {
          config.__retryCount = (config.__retryCount ?? 0) + 1;

          const delay = this.retryDelay * Math.pow(2, config.__retryCount - 1); // Exponential backoff
          console.error(
            `[Canvas API] Retrying request (${config.__retryCount}/${this.maxRetries}) after ${delay}ms`
          );

          await this.sleep(delay);
          return this.client.request(config);
        }

        // Transform error with better handling for non-JSON responses
        if (error.response) {
          const { status, data, headers } = error.response;
          const contentType = headers?.['content-type'] || 'unknown';
          console.error(
            `[Canvas API] Error response: ${status}, Content-Type: ${contentType}, Data type: ${typeof data}`
          );

          let errorMessage: string;

          try {
            // Check if data is already a string (HTML error pages, plain text, etc.)
            if (typeof data === 'string') {
              errorMessage = data.length > 200 ? data.substring(0, 200) + '...' : data;
            } else if (data && typeof data === 'object') {
              const errorData = data as CanvasErrorResponse;
              if (errorData.message) {
                errorMessage = errorData.message;
              } else if (errorData.errors && Array.isArray(errorData.errors)) {
                errorMessage = errorData.errors.map((err) => err.message || String(err)).join(', ');
              } else {
                errorMessage = JSON.stringify(data);
              }
            } else {
              errorMessage = String(data);
            }
          } catch {
            // Fallback if JSON operations fail
            errorMessage = String(data);
          }

          throw new CanvasAPIError(`Canvas API Error (${status}): ${errorMessage}`, status, data);
        }

        // Handle network errors or other issues
        if (error.request) {
          console.error('[Canvas API] Network error - no response received:', error.message);
          throw new CanvasAPIError(`Network error: ${error.message}`, 0, null);
        }

        console.error('[Canvas API] Unexpected error:', error.message);
        throw error;
      }
    );
  }

  private shouldRetry(error: AxiosError): boolean {
    if (!error.response) return true; // Network errors

    const status = error.response.status;
    return status === 429 || status >= 500; // Rate limit or server errors
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getNextPageUrl(linkHeader: string): string | null {
    const links = linkHeader.split(',');
    const nextLink = links.find((link) => link.includes('rel="next"'));
    if (!nextLink) return null;

    const match = nextLink.match(/<(.+?)>/);
    return match ? match[1] : null;
  }

  // ---------------------
  // HEALTH CHECK
  // ---------------------
  async healthCheck(): Promise<{
    status: 'ok' | 'error';
    timestamp: string;
    user?: { id: number; name: string };
  }> {
    try {
      const user = await this.getUserProfile();
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        user: { id: user.id, name: user.name },
      };
    } catch {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ---------------------
  // COURSES
  // ---------------------
  async listCourses(includeEnded: boolean = false): Promise<CanvasCourse[]> {
    const params: Record<string, unknown> = {
      include: ['total_students', 'teachers', 'term', 'course_progress'],
    };

    if (!includeEnded) {
      params.state = ['available', 'completed'];
    }

    const response = await this.client.get('/courses', { params });
    return response.data;
  }

  async getCourse(courseId: number): Promise<CanvasCourse> {
    const response = await this.client.get(`/courses/${courseId}`, {
      params: {
        include: [
          'total_students',
          'teachers',
          'term',
          'course_progress',
          'sections',
          'syllabus_body',
        ],
      },
    });
    return response.data;
  }

  // ---------------------
  // ASSIGNMENTS
  // ---------------------
  async listAssignments(
    courseId: number,
    includeSubmissions: boolean = false
  ): Promise<CanvasAssignment[]> {
    const include = ['assignment_group', 'rubric', 'due_at'];
    if (includeSubmissions) {
      include.push('submission');
    }

    const response = await this.client.get(`/courses/${courseId}/assignments`, {
      params: { include },
    });
    return response.data;
  }

  async getAssignment(
    courseId: number,
    assignmentId: number,
    includeSubmission: boolean = false
  ): Promise<CanvasAssignment> {
    const include = ['assignment_group', 'rubric'];
    if (includeSubmission) {
      include.push('submission');
    }

    const response = await this.client.get(`/courses/${courseId}/assignments/${assignmentId}`, {
      params: { include },
    });
    return response.data;
  }

  // ---------------------
  // ASSIGNMENT GROUPS
  // ---------------------
  async listAssignmentGroups(courseId: number): Promise<CanvasAssignmentGroup[]> {
    const response = await this.client.get(`/courses/${courseId}/assignment_groups`, {
      params: {
        include: ['assignments'],
      },
    });
    return response.data;
  }

  async getAssignmentGroup(courseId: number, groupId: number): Promise<CanvasAssignmentGroup> {
    const response = await this.client.get(`/courses/${courseId}/assignment_groups/${groupId}`, {
      params: {
        include: ['assignments'],
      },
    });
    return response.data;
  }

  // ---------------------
  // SUBMISSIONS
  // ---------------------
  async getSubmissions(courseId: number, assignmentId: number): Promise<CanvasSubmission[]> {
    const response = await this.client.get(
      `/courses/${courseId}/assignments/${assignmentId}/submissions`,
      {
        params: {
          include: ['submission_comments', 'rubric_assessment', 'assignment'],
        },
      }
    );
    return response.data;
  }

  async getSubmission(
    courseId: number,
    assignmentId: number,
    userId: number | 'self' = 'self'
  ): Promise<CanvasSubmission> {
    const response = await this.client.get(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      {
        params: {
          include: ['submission_comments', 'rubric_assessment', 'assignment'],
        },
      }
    );
    return response.data;
  }

  // ---------------------
  // FILES
  // ---------------------
  async listFiles(courseId: number, folderId?: number): Promise<CanvasFile[]> {
    const endpoint = folderId ? `/folders/${folderId}/files` : `/courses/${courseId}/files`;

    const response = await this.client.get(endpoint);
    return response.data;
  }

  async getFile(fileId: number): Promise<CanvasFile> {
    const response = await this.client.get(`/files/${fileId}`);
    return response.data;
  }

  async uploadFile(args: FileUploadArgs): Promise<CanvasFile> {
    const { course_id, folder_id, name, size } = args;

    // Step 1: Get upload URL
    const uploadEndpoint = folder_id
      ? `/folders/${folder_id}/files`
      : `/courses/${course_id}/files`;

    const uploadResponse = await this.client.post(uploadEndpoint, {
      name,
      size,
      content_type: args.content_type || 'application/octet-stream',
    });

    // Note: Actual file upload would require multipart form data handling
    // This is a simplified version - in practice, you'd need to handle the
    // two-step upload process Canvas uses
    return uploadResponse.data;
  }

  async listFolders(courseId: number): Promise<CanvasFolder[]> {
    const response = await this.client.get(`/courses/${courseId}/folders`);
    return response.data;
  }

  // ---------------------
  // PAGES
  // ---------------------
  async listPages(courseId: number): Promise<CanvasPage[]> {
    const response = await this.client.get(`/courses/${courseId}/pages`);
    return response.data;
  }

  async getPage(courseId: number, pageUrl: string): Promise<CanvasPage> {
    const response = await this.client.get(`/courses/${courseId}/pages/${pageUrl}`);
    return response.data;
  }

  // ---------------------
  // CALENDAR EVENTS
  // ---------------------
  async listCalendarEvents(startDate?: string, endDate?: string): Promise<CanvasCalendarEvent[]> {
    const params: Record<string, unknown> = {
      type: 'event',
      all_events: true,
    };

    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const response = await this.client.get('/calendar_events', { params });
    return response.data;
  }

  async getUpcomingAssignments(limit: number = 10): Promise<CanvasAssignment[]> {
    const response = await this.client.get('/users/self/upcoming_events', {
      params: { limit },
    });
    return response.data.filter((event: CanvasCalendarEvent) => event.assignment);
  }

  // ---------------------
  // DASHBOARD
  // ---------------------
  async getDashboardCards(): Promise<CanvasDashboardCard[]> {
    const response = await this.client.get('/dashboard/dashboard_cards');
    return response.data;
  }

  // ---------------------
  // SYLLABUS
  // ---------------------
  async getSyllabus(courseId: number): Promise<CanvasSyllabus> {
    const response = await this.client.get(`/courses/${courseId}`, {
      params: {
        include: ['syllabus_body'],
      },
    });
    return {
      course_id: courseId,
      syllabus_body: response.data.syllabus_body,
    };
  }

  // ---------------------
  // NOTIFICATIONS
  // ---------------------
  async listNotifications(): Promise<CanvasNotification[]> {
    const response = await this.client.get('/users/self/activity_stream');
    return response.data;
  }

  // ---------------------
  // USERS AND ENROLLMENTS
  // ---------------------
  async listUsers(courseId: number): Promise<CanvasUser[]> {
    const response = await this.client.get(`/courses/${courseId}/users`, {
      params: {
        include: ['email', 'enrollments', 'avatar_url'],
      },
    });
    return response.data;
  }

  async getEnrollments(courseId: number): Promise<CanvasEnrollment[]> {
    const response = await this.client.get(`/courses/${courseId}/enrollments`);
    return response.data;
  }

  // ---------------------
  // GRADES
  // ---------------------
  async getCourseGrades(courseId: number): Promise<CanvasEnrollment[]> {
    const response = await this.client.get(`/courses/${courseId}/enrollments`, {
      params: {
        user_id: 'self',
        include: ['grades', 'current_points'],
      },
    });
    return response.data;
  }

  // ---------------------
  // USER PROFILE
  // ---------------------
  async getUserProfile(): Promise<CanvasUserProfile> {
    const response = await this.client.get('/users/self/profile');
    return response.data;
  }

  // ---------------------
  // STUDENT COURSES
  // ---------------------
  async listStudentCourses(): Promise<CanvasCourse[]> {
    const response = await this.client.get('/courses', {
      params: {
        include: ['enrollments', 'total_students', 'term', 'course_progress'],
        enrollment_state: 'active',
      },
    });
    return response.data;
  }

  // ---------------------
  // MODULES
  // ---------------------
  async listModules(courseId: number): Promise<CanvasModule[]> {
    const response = await this.client.get(`/courses/${courseId}/modules`, {
      params: {
        include: ['items'],
      },
    });
    return response.data;
  }

  async getModule(courseId: number, moduleId: number): Promise<CanvasModule> {
    const response = await this.client.get(`/courses/${courseId}/modules/${moduleId}`, {
      params: {
        include: ['items'],
      },
    });
    return response.data;
  }

  async listModuleItems(courseId: number, moduleId: number): Promise<CanvasModuleItem[]> {
    const response = await this.client.get(`/courses/${courseId}/modules/${moduleId}/items`, {
      params: {
        include: ['content_details'],
      },
    });
    return response.data;
  }

  async getModuleItem(
    courseId: number,
    moduleId: number,
    itemId: number
  ): Promise<CanvasModuleItem> {
    const response = await this.client.get(
      `/courses/${courseId}/modules/${moduleId}/items/${itemId}`,
      {
        params: {
          include: ['content_details'],
        },
      }
    );
    return response.data;
  }

  // ---------------------
  // ANNOUNCEMENTS
  // ---------------------
  async listAnnouncements(courseId: string): Promise<CanvasAnnouncement[]> {
    // Canvas announcements endpoint uses a global /announcements endpoint
    // with context_codes parameter instead of course-specific endpoint
    const response = await this.client.get('/announcements', {
      params: {
        'context_codes[]': `course_${courseId}`,
        include: ['assignment'],
      },
    });
    return response.data;
  }

  // ---------------------
  // QUIZZES
  // ---------------------
  async listQuizzes(courseId: string): Promise<CanvasQuiz[]> {
    const response = await this.client.get(`/courses/${courseId}/quizzes`);
    return response.data;
  }

  async getQuiz(courseId: string, quizId: number): Promise<CanvasQuiz> {
    const response = await this.client.get(`/courses/${courseId}/quizzes/${quizId}`);
    return response.data;
  }
}
