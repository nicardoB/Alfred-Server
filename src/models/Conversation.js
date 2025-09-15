import { DataTypes } from 'sequelize';
import { logger } from '../utils/logger.js';

let ConversationModel = null;

/**
 * Conversation model for chat sessions
 * Implements row-level security for user data isolation
 */
export async function initializeConversationModel(sequelize) {
  try {
    ConversationModel = sequelize.define('Conversation', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: 'New Conversation'
      },
      context: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Conversation context and system prompts'
      },
      toolContext: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'chat',
        comment: 'Alfred tool that created this conversation (chat, poker, code, voice, etc.)'
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional conversation metadata (model preferences, settings)'
      },
      totalCost: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: false,
        defaultValue: 0.000000,
        comment: 'Total cost for this conversation in USD'
      },
      messageCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of messages in conversation'
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp of last message for sorting'
      },
      isArchived: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether conversation is archived'
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
      tableName: 'Conversations',
      timestamps: true,
      indexes: [
        {
          fields: ['userId', 'lastMessageAt'],
          name: 'conversations_user_recent'
        },
        {
          fields: ['userId', 'isArchived'],
          name: 'conversations_user_archived'
        },
        {
          fields: ['userId', 'toolContext'],
          name: 'conversations_user_tool'
        },
        {
          fields: ['toolContext', 'createdAt'],
          name: 'conversations_tool_created'
        },
        {
          fields: ['createdAt'],
          name: 'conversations_created'
        }
      ],
      hooks: {
        beforeCreate: (conversation) => {
          // Set initial lastMessageAt to creation time
          if (!conversation.lastMessageAt) {
            conversation.lastMessageAt = new Date();
          }
        },
        beforeUpdate: (conversation) => {
          // Update lastMessageAt when conversation is modified
          conversation.updatedAt = new Date();
        }
      }
    });

    // Instance methods
    ConversationModel.prototype.updateLastMessage = async function() {
      this.lastMessageAt = new Date();
      this.messageCount = await this.countMessages();
      return this.save();
    };

    ConversationModel.prototype.addCost = async function(cost) {
      this.totalCost = parseFloat(this.totalCost) + parseFloat(cost);
      return this.save();
    };

    ConversationModel.prototype.archive = async function() {
      this.isArchived = true;
      return this.save();
    };

    ConversationModel.prototype.unarchive = async function() {
      this.isArchived = false;
      return this.save();
    };

    // Class methods for user-scoped queries
    ConversationModel.findByUser = function(userId, options = {}) {
      return this.findAll({
        where: {
          userId,
          isArchived: options.includeArchived ? undefined : false
        },
        order: [['lastMessageAt', 'DESC']],
        limit: options.limit || 50,
        ...options
      });
    };

    ConversationModel.findRecentByUser = function(userId, limit = 10) {
      return this.findAll({
        where: {
          userId,
          isArchived: false
        },
        order: [['lastMessageAt', 'DESC']],
        limit
      });
    };

    logger.info('Conversation model initialized successfully');
    return ConversationModel;

  } catch (error) {
    logger.error('Failed to initialize Conversation model:', error);
    throw error;
  }
}

export function getConversationModel() {
  if (!ConversationModel) {
    throw new Error('Conversation model not initialized. Call initializeConversationModel first.');
  }
  return ConversationModel;
}

export default ConversationModel;
