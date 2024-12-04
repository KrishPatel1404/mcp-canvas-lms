import axios, { AxiosInstance, AxiosError } from 'axios';
import type { 
  CanvasConfig,
  CanvasCourse,
  CanvasModule,
  CanvasAssignment,
  CanvasSubmission
} from '../types/canvas.js';

export class CanvasAPI {
  private api: AxiosInstance;

  constructor(config: CanvasConfig) {
    this.api = axios.create({
      baseURL: config.baseURL,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
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
    const errorData = error.response?.data as { errors?: Array<{ message: string }> };
    return new Error(
      `${message}: ${errorData?.errors?.[0]?.message || error.message}`
    );
  }
}