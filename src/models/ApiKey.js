import { DataTypes } from 'sequelize';
import crypto from 'crypto';

/**
 * API Key Model for managing secure API access
 */
export function defineApiKeyModel(sequelize) {
  const ApiKey = sequelize.define('ApiKey', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    keyHash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    keyPrefix: {
      type: DataTypes.STRING(8),
      allowNull: false
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    },
    lastUsed: {
      type: DataTypes.DATE,
      allowNull: true
    },
    usageCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    rateLimit: {
      type: DataTypes.INTEGER,
      defaultValue: 100 // requests per hour
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'ApiKeys',
    timestamps: true,
    indexes: [
      {
        fields: ['keyHash']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['keyPrefix']
      }
    ]
  });

  // Static methods
  ApiKey.generateKey = function() {
    const key = crypto.randomBytes(32).toString('hex');
    const prefix = key.substring(0, 8);
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    
    return {
      key: `ak_${key}`,
      prefix,
      hash
    };
  };

  ApiKey.hashKey = function(key) {
    // Remove ak_ prefix if present
    const cleanKey = key.startsWith('ak_') ? key.substring(3) : key;
    return crypto.createHash('sha256').update(cleanKey).digest('hex');
  };

  // Instance methods
  ApiKey.prototype.isExpired = function() {
    return this.expiresAt && new Date() > this.expiresAt;
  };

  ApiKey.prototype.hasPermission = function(permission) {
    return this.permissions[permission] === true;
  };

  ApiKey.prototype.recordUsage = async function() {
    this.lastUsed = new Date();
    this.usageCount += 1;
    await this.save();
  };

  return ApiKey;
}

// Initialize model when database is ready
let ApiKey;

export async function initializeApiKeyModel(sequelize) {
  if (sequelize && !ApiKey) {
    ApiKey = defineApiKeyModel(sequelize);
  }
  return ApiKey;
}

export function getApiKeyModel() {
  if (global.testModels?.ApiKey) {
    return global.testModels.ApiKey;
  }
  return ApiKey;
}
