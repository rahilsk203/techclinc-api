export class Router {
  constructor() {
    this.routes = [];
    this.middleware = [];
  }

  use(path, ...handlers) {
    if (typeof path === 'function') {
      // Global middleware
      this.middleware.push(path);
    } else {
      // Route-specific middleware
      const route = {
        path: path === '/' ? '' : path,
        handlers: handlers
      };
      this.routes.push(route);
    }
  }

  get(path, handler) {
    this.addRoute('GET', path, handler);
  }

  post(path, handler) {
    this.addRoute('POST', path, handler);
  }

  put(path, handler) {
    this.addRoute('PUT', path, handler);
  }

  delete(path, handler) {
    this.addRoute('DELETE', path, handler);
  }

  patch(path, handler) {
    this.addRoute('PATCH', path, handler);
  }

  addRoute(method, path, handler) {
    this.routes.push({
      method,
      path: path === '/' ? '' : path,
      handlers: [handler]
    });
  }

  async handle(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Apply global middleware
      let response = null;
      for (const middleware of this.middleware) {
        response = await middleware(request, env, ctx);
        if (response) break;
      }

      if (response) {
        return response;
      }

      // Find matching route
      const route = this.findRoute(method, path);
      if (!route) {
        return new Response(JSON.stringify({ 
          error: 'Not Found',
          message: `Route ${method} ${path} not found` 
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Execute route handlers
      for (const handler of route.handlers) {
        response = await handler(request, env, ctx);
        if (response) break;
      }

      return response || new Response('No response', { status: 500 });

    } catch (error) {
      console.error('Router error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error',
        message: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  findRoute(method, path) {
    for (const route of this.routes) {
      if (route.method === method && this.matchPath(route.path, path)) {
        return route;
      }
    }
    return null;
  }

  matchPath(routePath, requestPath) {
    if (routePath === '') {
      return requestPath === '/' || requestPath === '';
    }
    
    const routeSegments = routePath.split('/').filter(Boolean);
    const requestSegments = requestPath.split('/').filter(Boolean);
    
    if (routeSegments.length !== requestSegments.length) {
      return false;
    }
    
    for (let i = 0; i < routeSegments.length; i++) {
      if (routeSegments[i] !== requestSegments[i] && !routeSegments[i].startsWith(':')) {
        return false;
      }
    }
    
    return true;
  }
} 