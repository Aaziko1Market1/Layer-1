import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  const statusCode = (err as any).statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error',
  });
}
