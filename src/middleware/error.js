export const errorHandler = async (request, env, ctx) => {
  try {
    return null; // Continue to next middleware
  } catch (error) {
    console.error('Error in middleware:', error);
    
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const createError = (message, status = 400) => {
  return new Response(JSON.stringify({
    error: 'Bad Request',
    message,
    timestamp: new Date().toISOString()
  }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const createSuccess = (data, message = 'Success') => {
  return new Response(JSON.stringify({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}; 