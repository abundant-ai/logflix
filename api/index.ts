import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../apps/api/vercel';

// Vercel serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Forward the request to the Express app
  return new Promise((resolve, reject) => {
    // @ts-ignore - Express and Vercel types are compatible
    app(req, res, (err: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
}
