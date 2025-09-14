import { DataTypes } from 'sequelize';
import { getDatabase } from '../config/database.js';

/**
 * Cost Usage Model for tracking AI provider usage and costs
 */
export function defineCostUsageModel(sequelize) {
  const CostUsage = sequelize.define('CostUsage', {
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
      onDelete: 'CASCADE',
      comment: 'User who incurred this cost'
    },
    toolContext: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'chat',
      comment: 'Alfred tool that generated this cost (chat, poker, code, voice, etc.)'
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['claude', 'openai', 'copilot', 'github']]
      }
    },
    requests: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    inputTokens: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    outputTokens: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 6),
      defaultValue: 0,
      allowNull: false
    },
    model: {
      type: DataTypes.STRING,
      allowNull: true
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Conversations',
        key: 'id'
      },
      comment: 'Associated conversation if applicable'
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Messages',
        key: 'id'
      },
      comment: 'Associated message if applicable'
    },
    lastReset: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'cost_usage',
    timestamps: true,
    indexes: [
      {
        fields: ['userId', 'toolContext', 'createdAt'],
        name: 'cost_usage_user_tool_time'
      },
      {
        fields: ['provider', 'model'],
        name: 'cost_usage_provider_model'
      },
      {
        fields: ['conversationId'],
        name: 'cost_usage_conversation'
      },
      {
        fields: ['messageId'],
        name: 'cost_usage_message'
      },
      {
        fields: ['createdAt'],
        name: 'cost_usage_created'
      }
    ]
  });

  return CostUsage;
}

// Initialize model when database is ready
let CostUsage;

export async function initializeCostUsageModel(sequelize) {
  if (sequelize && !CostUsage) {
    CostUsage = defineCostUsageModel(sequelize);
  }
  return CostUsage;
}

export function getCostUsageModel() {
  return CostUsage;
}
