import { DataTypes } from 'sequelize';
import { logger } from '../utils/logger.js';

let MessageModel = null;

/**
 * Message model for individual chat messages
 * Implements row-level security through conversation ownership
 */
export async function initializeMessageModel(sequelize) {
  try {
    MessageModel = sequelize.define('Message', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      conversationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Conversations',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      role: {
        type: DataTypes.ENUM('user', 'assistant', 'system'),
        allowNull: false,
        comment: 'Message sender role'
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Message content'
      },
      toolContext: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Alfred tool context for this message (inherited from conversation)'
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Message metadata (model used, tokens, cost, etc.)'
      },
      aiProvider: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'AI provider used (claude, openai, github)'
      },
      aiModel: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Specific AI model used'
      },
      tokenCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Token count for this message'
      },
      cost: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        comment: 'Cost for this message in USD'
      },
      processingTime: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Processing time in milliseconds'
      },
      isStreaming: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether message is currently streaming'
      },
      isComplete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether message is complete or partial'
      },
      parentMessageId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'Messages',
          key: 'id'
        },
        comment: 'Parent message for threaded conversations'
      },
      editedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When message was last edited'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    }, {
      tableName: 'Messages',
      timestamps: true,
      indexes: [
        {
          fields: ['conversationId', 'createdAt'],
          name: 'messages_conversation_order'
        },
        {
          fields: ['role', 'createdAt'],
          name: 'messages_role_time'
        },
        {
          fields: ['aiProvider', 'aiModel'],
          name: 'messages_ai_provider'
        },
        {
          fields: ['toolContext', 'createdAt'],
          name: 'messages_tool_time'
        },
        {
          fields: ['parentMessageId'],
          name: 'messages_parent'
        }
      ],
      hooks: {
        afterCreate: async (message) => {
          // Update conversation's message count and last message time
          const { getConversationModel } = await import('./Conversation.js');
          const Conversation = getConversationModel();
          const conversation = await Conversation.findByPk(message.conversationId);
          if (conversation) {
            await conversation.updateLastMessage();
            if (message.cost) {
              await conversation.addCost(message.cost);
            }
          }
        },
        afterUpdate: async (message) => {
          // Update conversation cost if message cost changed
          if (message.changed('cost') && message.cost) {
            const { getConversationModel } = await import('./Conversation.js');
            const Conversation = getConversationModel();
            const conversation = await Conversation.findByPk(message.conversationId);
            if (conversation) {
              // Recalculate total cost from all messages
              const totalCost = await MessageModel.sum('cost', {
                where: { conversationId: message.conversationId }
              });
              conversation.totalCost = totalCost || 0;
              await conversation.save();
            }
          }
        }
      }
    });

    // Instance methods
    MessageModel.prototype.markComplete = async function() {
      this.isComplete = true;
      this.isStreaming = false;
      return this.save();
    };

    MessageModel.prototype.updateContent = async function(content, metadata = {}) {
      this.content = content;
      this.metadata = { ...this.metadata, ...metadata };
      this.editedAt = new Date();
      return this.save();
    };

    MessageModel.prototype.addCostInfo = async function(cost, tokenCount, processingTime) {
      this.cost = cost;
      this.tokenCount = tokenCount;
      this.processingTime = processingTime;
      return this.save();
    };

    // Class methods for conversation-scoped queries
    MessageModel.findByConversation = function(conversationId, options = {}) {
      return this.findAll({
        where: { conversationId },
        order: [['createdAt', 'ASC']],
        limit: options.limit || 100,
        ...options
      });
    };

    MessageModel.findRecentByConversation = function(conversationId, limit = 50) {
      return this.findAll({
        where: { conversationId },
        order: [['createdAt', 'DESC']],
        limit
      });
    };

    MessageModel.findByProvider = function(aiProvider, options = {}) {
      return this.findAll({
        where: { aiProvider },
        order: [['createdAt', 'DESC']],
        ...options
      });
    };

    // Get conversation context (recent messages for AI)
    MessageModel.getConversationContext = async function(conversationId, maxMessages = 20) {
      const messages = await this.findAll({
        where: { 
          conversationId,
          isComplete: true 
        },
        order: [['createdAt', 'DESC']],
        limit: maxMessages
      });
      
      return messages.reverse().map(msg => ({
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata
      }));
    };

    logger.info('Message model initialized successfully');
    return MessageModel;

  } catch (error) {
    logger.error('Failed to initialize Message model:', error);
    throw error;
  }
}

export function getMessageModel() {
  if (!MessageModel) {
    throw new Error('Message model not initialized. Call initializeMessageModel first.');
  }
  return MessageModel;
}

export default MessageModel;
