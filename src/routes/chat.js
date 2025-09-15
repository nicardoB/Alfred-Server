import express from 'express';
import { authenticate, requireRole } from '../middleware/authentication.js';
import { getConversationModel } from '../models/Conversation.js';
import { getMessageModel } from '../models/Message.js';
import { logger } from '../utils/logger.js';
import { TOOL_CONTEXTS, isValidToolContext } from '../ai/enums.js';

const router = express.Router();

/**
 * Chat Routes - Unified conversation management for all Alfred tools
 */

// Get user's conversations with optional tool filtering
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const { toolContext, limit = 50, includeArchived = false } = req.query;
    const Conversation = getConversationModel();
    
    const whereClause = {
      userId: req.user.id,
      ...(toolContext && { toolContext }),
      ...(includeArchived === 'false' && { isArchived: false })
    };

    const conversations = await Conversation.findAll({
      where: whereClause,
      order: [['lastMessageAt', 'DESC']],
      limit: parseInt(limit),
      attributes: [
        'id', 'title', 'toolContext', 'totalCost', 
        'messageCount', 'lastMessageAt', 'createdAt'
      ]
    });

    res.json({
      conversations,
      total: conversations.length
    });

  } catch (error) {
    logger.error('Failed to fetch conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Create new conversation
router.post('/conversations', authenticate, async (req, res) => {
  try {
    const { title, toolContext = TOOL_CONTEXTS.CHAT, context } = req.body;
    const Conversation = getConversationModel();

    // Validate tool context using enum
    if (!isValidToolContext(toolContext)) {
      return res.status(400).json({ 
        error: `Invalid tool context: ${toolContext}`,
        validContexts: Object.values(TOOL_CONTEXTS)
      });
    }

    // Validate tool context permission
    const hasPermission = req.user.permissions?.[toolContext] || 
                         (toolContext === TOOL_CONTEXTS.CHAT && req.user.permissions['ai.chat']);
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: `Insufficient permissions for ${toolContext} tool` 
      });
    }

    const conversation = await Conversation.create({
      userId: req.user.id,
      title: title || `New ${toolContext} conversation`,
      toolContext,
      context
    });

    res.status(201).json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        toolContext: conversation.toolContext,
        totalCost: conversation.totalCost,
        messageCount: conversation.messageCount,
        createdAt: conversation.createdAt
      }
    });

  } catch (error) {
    logger.error('Failed to create conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get conversation by ID with messages
router.get('/conversations/:conversationId', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { includeMessages = true } = req.query;
    const Conversation = getConversationModel();
    const Message = getMessageModel();

    const conversation = await Conversation.findOne({
      where: { 
        id: conversationId, 
        userId: req.user.id 
      },
      ...(includeMessages === 'true' && {
        include: [{
          model: Message,
          as: 'messages',
          order: [['createdAt', 'ASC']],
          attributes: [
            'id', 'role', 'content', 'toolContext', 'aiProvider', 
            'aiModel', 'cost', 'createdAt', 'isStreaming'
          ]
        }]
      })
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ conversation });

  } catch (error) {
    logger.error('Failed to fetch conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Update conversation (title, archive status)
router.patch('/conversations/:conversationId', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { title, isArchived } = req.body;
    const Conversation = getConversationModel();

    const conversation = await Conversation.findOne({
      where: { 
        id: conversationId, 
        userId: req.user.id 
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (title !== undefined) conversation.title = title;
    if (isArchived !== undefined) conversation.isArchived = isArchived;

    await conversation.save();

    res.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        isArchived: conversation.isArchived,
        updatedAt: conversation.updatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to update conversation:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// Delete conversation
router.delete('/conversations/:conversationId', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const Conversation = getConversationModel();

    const deleted = await Conversation.destroy({
      where: { 
        id: conversationId, 
        userId: req.user.id 
      }
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ message: 'Conversation deleted successfully' });

  } catch (error) {
    logger.error('Failed to delete conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Get messages for a conversation
router.get('/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    const Conversation = getConversationModel();
    const Message = getMessageModel();

    // Verify conversation ownership
    const conversation = await Conversation.findOne({
      where: { 
        id: conversationId, 
        userId: req.user.id 
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await Message.findAll({
      where: { conversationId },
      order: [['createdAt', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: [
        'id', 'role', 'content', 'toolContext', 'aiProvider', 
        'aiModel', 'cost', 'tokenCount', 'createdAt', 'isStreaming'
      ]
    });

    res.json({
      messages,
      conversationId,
      total: messages.length
    });

  } catch (error) {
    logger.error('Failed to fetch messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get cost breakdown by tool context
router.get('/costs/breakdown', authenticate, async (req, res) => {
  try {
    const { getCostUsageModel } = await import('../models/CostUsage.js');
    const CostUsage = getCostUsageModel();
    
    if (!CostUsage) {
      return res.status(500).json({ error: 'Cost tracking not available' });
    }

    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
      case '1d':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    const costBreakdown = await CostUsage.findAll({
      where: {
        userId: req.user.id,
        createdAt: {
          [require('sequelize').Op.gte]: startDate
        }
      },
      attributes: [
        'toolContext',
        'provider',
        [require('sequelize').fn('SUM', require('sequelize').col('totalCost')), 'totalCost'],
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'requestCount'],
        [require('sequelize').fn('SUM', require('sequelize').col('inputTokens')), 'inputTokens'],
        [require('sequelize').fn('SUM', require('sequelize').col('outputTokens')), 'outputTokens']
      ],
      group: ['toolContext', 'provider'],
      order: [[require('sequelize').fn('SUM', require('sequelize').col('totalCost')), 'DESC']]
    });

    res.json({
      timeframe,
      breakdown: costBreakdown,
      totalCost: costBreakdown.reduce((sum, item) => sum + parseFloat(item.dataValues.totalCost || 0), 0)
    });

  } catch (error) {
    logger.error('Failed to fetch cost breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch cost breakdown' });
  }
});

export default router;
