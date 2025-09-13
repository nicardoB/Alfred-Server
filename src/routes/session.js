import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { authenticate, requireFriend, rateLimit } from '../middleware/authentication.js';

export function sessionRoutes(sessionManager) {
  const router = Router();

  // Apply authentication and rate limiting to all session routes
  router.use(authenticate);
  router.use(requireFriend);
  router.use(rateLimit(50)); // 50 requests per hour for session operations

  // Get session info
  router.get('/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await sessionManager.getSession(sessionId);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      res.json({
        success: true,
        session
      });
    } catch (error) {
      logger.error('Failed to get session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get session'
      });
    }
  });

  return router;
}
