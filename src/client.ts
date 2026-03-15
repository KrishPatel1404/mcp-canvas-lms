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

// ---------------------
// TTL tiers (milliseconds)
// ---------------------
const TTL_LONG = 10 * 60 * 1000; // 10 min: profile, courses, dashboard, syllabus
const TTL_MEDIUM = 5 * 60 * 1000; // 5 min: assignments, modules, pages, files, quizzes
const TTL_SHORT = 1 * 60 * 1000; // 1 min: submissions, grades, calendar, notifications

// ---------------------
// In-memory TTL cache with LRU eviction
// ---------------------
interface CacheEntry {
  data: unknown;
  expiresAt: number;
  lastAccessed: number;
}

class ResponseCache {
  private store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    entry.lastAccessed = Date.now();
    return entry.data as T;
  }

  set(key: string, data: unknown, ttlMs: number): void {
    if (this.store.size >= this.maxEntries) {
      this.evictOldest();
    }
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      lastAccessed: Date.now(),
    });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}

export class CanvasClient {
  private client: AxiosInstance;
  private baseURL: string;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private readonly cache = new ResponseCache();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    token: string,
    domain: string,
    options?: { maxRetries?: number; retryDelay?: number; timeout?: number }
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
      timeout: options?.timeout ?? 30000,
      params: { per_page: 100 },
    });

    this.setupInterceptors();
  }

  // ---------------------
  // CACHE HELPERS
  // ---------------------
  private buildCacheKey(url: string, params?: Record<string, unknown>): string {
    const sorted = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    return `${url}?${sorted}`;
  }

  /**
   * Cached GET with in-flight deduplication.
   * Concurrent calls for the same key share a single HTTP request.
   */
  private async cachedGet<T>(
    url: string,
    params: Record<string, unknown> | undefined,
    ttlMs: number
  ): Promise<T> {
    const key = this.buildCacheKey(url, params);

    const cached = this.cache.get<T>(key);
    if (cached !== undefined) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = this.client
      .get(url, params ? { params } : undefined)
      .then((response) => {
        const data = response.data as T;
        this.cache.set(key, data, ttlMs);
        this.inflight.delete(key);
        return data;
      })
      .catch((err: unknown) => {
        this.inflight.delete(key);
        throw err;
      });

    this.inflight.set(key, promise);
    return promise;
  }

  clearCache(): void {
    this.cache.clear();
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

          const delay = this.retryDelay * Math.pow(2, config.__retryCount - 1);
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
            errorMessage = String(data);
          }

          throw new CanvasAPIError(`Canvas API Error (${status}): ${errorMessage}`, status, data);
        }

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
    if (!error.response) return true;
    const status = error.response.status;
    return status === 429 || status >= 500;
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
  // HEALTH CHECK (uncached -- used to verify connectivity)
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
  // COURSES (TTL_LONG)
  // ---------------------
  async listCourses(includeEnded: boolean = false): Promise<CanvasCourse[]> {
    const params: Record<string, unknown> = {
      include: ['total_students', 'teachers', 'term', 'course_progress'],
    };
    if (!includeEnded) {
      params.state = ['available', 'completed'];
    }
    return this.cachedGet('/courses', params, TTL_LONG);
  }

  async getCourse(courseId: number): Promise<CanvasCourse> {
    return this.cachedGet(
      `/courses/${courseId}`,
      {
        include: [
          'total_students',
          'teachers',
          'term',
          'course_progress',
          'sections',
          'syllabus_body',
        ],
      },
      TTL_MEDIUM
    );
  }

  // ---------------------
  // ASSIGNMENTS (TTL_MEDIUM)
  // ---------------------
  async listAssignments(
    courseId: number,
    includeSubmissions: boolean = false
  ): Promise<CanvasAssignment[]> {
    const include = ['assignment_group', 'rubric', 'due_at'];
    if (includeSubmissions) {
      include.push('submission');
    }
    return this.cachedGet(`/courses/${courseId}/assignments`, { include }, TTL_MEDIUM);
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
    return this.cachedGet(
      `/courses/${courseId}/assignments/${assignmentId}`,
      { include },
      TTL_MEDIUM
    );
  }

  // ---------------------
  // ASSIGNMENT GROUPS (TTL_MEDIUM)
  // ---------------------
  async listAssignmentGroups(courseId: number): Promise<CanvasAssignmentGroup[]> {
    return this.cachedGet(
      `/courses/${courseId}/assignment_groups`,
      { include: ['assignments'] },
      TTL_MEDIUM
    );
  }

  async getAssignmentGroup(courseId: number, groupId: number): Promise<CanvasAssignmentGroup> {
    return this.cachedGet(
      `/courses/${courseId}/assignment_groups/${groupId}`,
      { include: ['assignments'] },
      TTL_MEDIUM
    );
  }

  // ---------------------
  // SUBMISSIONS (TTL_SHORT)
  // ---------------------
  async getSubmissions(courseId: number, assignmentId: number): Promise<CanvasSubmission[]> {
    return this.cachedGet(
      `/courses/${courseId}/assignments/${assignmentId}/submissions`,
      { include: ['submission_comments', 'rubric_assessment', 'assignment'] },
      TTL_SHORT
    );
  }

  async getSubmission(
    courseId: number,
    assignmentId: number,
    userId: number | 'self' = 'self'
  ): Promise<CanvasSubmission> {
    return this.cachedGet(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      { include: ['submission_comments', 'rubric_assessment', 'assignment'] },
      TTL_SHORT
    );
  }

  // ---------------------
  // FILES (TTL_MEDIUM)
  // ---------------------
  async listFiles(courseId: number, folderId?: number): Promise<CanvasFile[]> {
    const endpoint = folderId ? `/folders/${folderId}/files` : `/courses/${courseId}/files`;
    return this.cachedGet(endpoint, undefined, TTL_MEDIUM);
  }

  async getFile(fileId: number): Promise<CanvasFile> {
    return this.cachedGet(`/files/${fileId}`, undefined, TTL_MEDIUM);
  }

  async uploadFile(args: FileUploadArgs): Promise<CanvasFile> {
    const { course_id, folder_id, name, size } = args;

    const uploadEndpoint = folder_id
      ? `/folders/${folder_id}/files`
      : `/courses/${course_id}/files`;

    const uploadResponse = await this.client.post(uploadEndpoint, {
      name,
      size,
      content_type: args.content_type || 'application/octet-stream',
    });

    return uploadResponse.data;
  }

  async listFolders(courseId: number): Promise<CanvasFolder[]> {
    return this.cachedGet(`/courses/${courseId}/folders`, undefined, TTL_MEDIUM);
  }

  // ---------------------
  // PAGES (TTL_MEDIUM)
  // ---------------------
  async listPages(courseId: number): Promise<CanvasPage[]> {
    return this.cachedGet(`/courses/${courseId}/pages`, undefined, TTL_MEDIUM);
  }

  async getPage(courseId: number, pageUrl: string): Promise<CanvasPage> {
    return this.cachedGet(`/courses/${courseId}/pages/${pageUrl}`, undefined, TTL_MEDIUM);
  }

  // ---------------------
  // CALENDAR EVENTS (TTL_SHORT)
  // ---------------------
  async listCalendarEvents(startDate?: string, endDate?: string): Promise<CanvasCalendarEvent[]> {
    const params: Record<string, unknown> = {
      type: 'event',
      all_events: true,
    };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.cachedGet('/calendar_events', params, TTL_SHORT);
  }

  async getUpcomingAssignments(limit: number = 10): Promise<CanvasAssignment[]> {
    const key = this.buildCacheKey('/users/self/upcoming_events', { limit });
    const cached = this.cache.get<CanvasAssignment[]>(key);
    if (cached !== undefined) return cached;

    const response = await this.client.get('/users/self/upcoming_events', {
      params: { limit },
    });
    const result = response.data.filter((event: CanvasCalendarEvent) => event.assignment);
    this.cache.set(key, result, TTL_SHORT);
    return result;
  }

  // ---------------------
  // DASHBOARD (TTL_LONG)
  // ---------------------
  async getDashboardCards(): Promise<CanvasDashboardCard[]> {
    return this.cachedGet('/dashboard/dashboard_cards', undefined, TTL_LONG);
  }

  // ---------------------
  // SYLLABUS (TTL_LONG)
  // ---------------------
  async getSyllabus(courseId: number): Promise<CanvasSyllabus> {
    const key = this.buildCacheKey(`/courses/${courseId}/_syllabus`, undefined);
    const cached = this.cache.get<CanvasSyllabus>(key);
    if (cached !== undefined) return cached;

    const response = await this.client.get(`/courses/${courseId}`, {
      params: { include: ['syllabus_body'] },
    });
    const result: CanvasSyllabus = {
      course_id: courseId,
      syllabus_body: response.data.syllabus_body,
    };
    this.cache.set(key, result, TTL_LONG);
    return result;
  }

  // ---------------------
  // NOTIFICATIONS (TTL_SHORT)
  // ---------------------
  async listNotifications(): Promise<CanvasNotification[]> {
    return this.cachedGet('/users/self/activity_stream', undefined, TTL_SHORT);
  }

  // ---------------------
  // USERS AND ENROLLMENTS
  // ---------------------
  async listUsers(courseId: number): Promise<CanvasUser[]> {
    return this.cachedGet(
      `/courses/${courseId}/users`,
      { include: ['email', 'enrollments', 'avatar_url'] },
      TTL_MEDIUM
    );
  }

  async getEnrollments(courseId: number): Promise<CanvasEnrollment[]> {
    return this.cachedGet(`/courses/${courseId}/enrollments`, undefined, TTL_SHORT);
  }

  // ---------------------
  // GRADES (TTL_SHORT)
  // ---------------------
  async getCourseGrades(courseId: number): Promise<CanvasEnrollment[]> {
    return this.cachedGet(
      `/courses/${courseId}/enrollments`,
      { user_id: 'self', include: ['grades', 'current_points'] },
      TTL_SHORT
    );
  }

  // ---------------------
  // USER PROFILE (TTL_LONG)
  // ---------------------
  async getUserProfile(): Promise<CanvasUserProfile> {
    return this.cachedGet('/users/self/profile', undefined, TTL_LONG);
  }

  // ---------------------
  // STUDENT COURSES (TTL_LONG)
  // ---------------------
  async listStudentCourses(): Promise<CanvasCourse[]> {
    return this.cachedGet(
      '/courses',
      {
        include: ['enrollments', 'total_students', 'term', 'course_progress'],
        enrollment_state: 'active',
      },
      TTL_LONG
    );
  }

  // ---------------------
  // MODULES (TTL_MEDIUM)
  // ---------------------
  async listModules(courseId: number): Promise<CanvasModule[]> {
    return this.cachedGet(`/courses/${courseId}/modules`, { include: ['items'] }, TTL_MEDIUM);
  }

  async getModule(courseId: number, moduleId: number): Promise<CanvasModule> {
    return this.cachedGet(
      `/courses/${courseId}/modules/${moduleId}`,
      { include: ['items'] },
      TTL_MEDIUM
    );
  }

  async listModuleItems(courseId: number, moduleId: number): Promise<CanvasModuleItem[]> {
    return this.cachedGet(
      `/courses/${courseId}/modules/${moduleId}/items`,
      { include: ['content_details'] },
      TTL_MEDIUM
    );
  }

  async getModuleItem(
    courseId: number,
    moduleId: number,
    itemId: number
  ): Promise<CanvasModuleItem> {
    return this.cachedGet(
      `/courses/${courseId}/modules/${moduleId}/items/${itemId}`,
      { include: ['content_details'] },
      TTL_MEDIUM
    );
  }

  // ---------------------
  // ANNOUNCEMENTS (TTL_SHORT)
  // ---------------------
  async listAnnouncements(courseId: string): Promise<CanvasAnnouncement[]> {
    return this.cachedGet(
      '/announcements',
      { 'context_codes[]': `course_${courseId}`, include: ['assignment'] },
      TTL_SHORT
    );
  }

  // ---------------------
  // QUIZZES (TTL_MEDIUM)
  // ---------------------
  async listQuizzes(courseId: string): Promise<CanvasQuiz[]> {
    return this.cachedGet(`/courses/${courseId}/quizzes`, undefined, TTL_MEDIUM);
  }

  async getQuiz(courseId: string, quizId: number): Promise<CanvasQuiz> {
    return this.cachedGet(`/courses/${courseId}/quizzes/${quizId}`, undefined, TTL_MEDIUM);
  }
}
