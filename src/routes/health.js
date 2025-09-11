import { Router } from 'express';

export function healthRoutes() {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0-DEPLOYMENT-TEST',
      uptime: process.uptime()
    });
  });

  return router;
}
