import type { 
    ListResourcesRequest,
    ReadResourceRequest,
    SearchResourcesRequest,
    WatchResourcesRequest
} from "@modelcontextprotocol/sdk/schema/index.js";
import type { CanvasAPI } from '../services/canvasAPI.js';
import type { ResourceMetadata, CanvasCourse } from '../types/canvas.js';
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

  
        let content: unknown;
  
        switch (type) {
          case 'courses': {
            const [course, modules, assignments] = await Promise.all([
              canvasAPI.getCourse(courseId, ['term', 'teachers', 'total_students']),
              CanvasAPI.listModules(courseId),
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
  
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2)
          }]
        };
      },
  
      async handleSearchResources(request: SearchResourcesRequest) {
        const query = request.params.query.toLowerCase();
        const courses = await canvasAPI.listCourses(['term']);
        
        const matchingCourses = courses.filter(course => 
          course.name.toLowerCase().includes(query) ||
          course.course_code.toLowerCase().includes(query)
        );
  
        return {
          resources: matchingCourses.map(course => ({
            uri: `canvas:///courses/${course.id}`,
            name: course.name,
            metadata: createResourceMetadata(course)
          }))
        };
      },
  
      async handleWatchResources(request: WatchResourcesRequest) {
        return { success: true };
      }
    },
  }