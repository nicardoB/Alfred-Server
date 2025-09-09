import { Router } from 'express';

export function healthRoutes() {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime()
    });
  });

  return router;
}
