import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../apps/api/vercel';

// Vercel serverless function handler
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Forward the request to the Express app
  return new Promise((resolve, reject) => {
    (app as import('express').Handler)(req, res, (err: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
}
