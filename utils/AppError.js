// Custom error class for handling application errors
class AppError extends Error {
  constructor(message, statusCode, data = null) {
    const errorMessage = typeof message === 'object' ? message.message : message;
    super(errorMessage);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.data = typeof message === 'object' ? message : data;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;