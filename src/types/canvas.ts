export interface CanvasConfig {
    baseURL: string;
    accessToken: string;
  }
  
  export interface CanvasCourse {
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
  
  export interface CanvasModule {
    id: number;
    name: string;
    position: number;
    unlock_at?: string;
    require_sequential_progress: boolean;
    items_count: number;
    items_url: string;
    items?: CanvasModuleItem[];
  }
  
  export interface CanvasModuleItem {
    id: number;
    module_id: number;
    position: number;
    title: string;
    type: string;
    content_id: number;
    html_url: string;
    url: string;
    completion_requirement?: {
      type: string;
      min_score?: number;
      completed?: boolean;
    };
  }
  
  export interface CanvasAssignment {
    id: number;
    name: string;
    description: string;
    due_at?: string;
    unlock_at?: string;
    lock_at?: string;
    points_possible: number;
    submission_types: string[];
    has_submitted_submissions: boolean;
    published: boolean;
    html_url: string;
  }
  
  export interface CanvasSubmission {
    id: number;
    assignment_id: number;
    user_id: number;
    submitted_at?: string;
    score?: number;
    grade?: string;
    submission_type?: string;
    url?: string;
    late: boolean;
    missing: boolean;
    submission_comments?: CanvasSubmissionComment[];
  }
  
  export interface CanvasSubmissionComment {
    id: number;
    comment: string;
    author_id: number;
    author_name: string;
    created_at: string;
    edited_at?: string;
  }
  
  export interface WatchedResource {
    lastCheck: Date;
    lastContent: unknown;
  }
  
  export interface ResourceMetadata {
    code?: string;
    term?: string;
    startDate?: string;
    endDate?: string;
    students?: number;
  }