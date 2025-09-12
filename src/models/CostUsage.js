import { DataTypes } from 'sequelize';
import { getDatabase } from '../config/database.js';

/**
 * Cost Usage Model for tracking AI provider usage and costs
 */
export function defineCostUsageModel(sequelize) {
  const CostUsage = sequelize.define('CostUsage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['claude', 'openai', 'copilot']]
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
    lastReset: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'cost_usage',
    timestamps: true,
    indexes: [
      {
        fields: ['provider']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  return CostUsage;
}

// Initialize model when database is ready
let CostUsage;

export async function initializeCostUsageModel() {
  const sequelize = getDatabase();
  if (sequelize && !CostUsage) {
    CostUsage = defineCostUsageModel(sequelize);
  }
  return CostUsage;
}

export function getCostUsageModel() {
  return CostUsage;
}
