import { DataTypes } from 'sequelize';

/**
 * Audit Log Model for comprehensive security logging
 */
export function defineAuditLogModel(sequelize) {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false
    },
    resource: {
      type: DataTypes.STRING,
      allowNull: false
    },
    resourceId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    method: {
      type: DataTypes.STRING,
      allowNull: false
    },
    endpoint: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userAgent: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    success: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    requestData: {
      type: DataTypes.JSON,
      allowNull: true
    },
    responseData: {
      type: DataTypes.JSON,
      allowNull: true
    },
    duration: {
      type: DataTypes.INTEGER, // milliseconds
      allowNull: true
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    apiKeyId: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    tableName: 'audit_logs',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['action']
      },
      {
        fields: ['resource']
      },
      {
        fields: ['createdAt']
      },
      {
        fields: ['success']
      },
      {
        fields: ['ipAddress']
      }
    ]
  });

  // Static methods for common log types
  AuditLog.logAuthentication = async function(data) {
    return this.create({
      action: 'authentication',
      resource: 'user',
      method: 'POST',
      endpoint: '/api/v1/auth/login',
      ...data
    });
  };

  AuditLog.logApiAccess = async function(data) {
    return this.create({
      action: 'api_access',
      resource: data.resource || 'unknown',
      method: data.method,
      endpoint: data.endpoint,
      ...data
    });
  };

  AuditLog.logSecurityEvent = async function(data) {
    return this.create({
      action: 'security_event',
      resource: 'system',
      method: data.method || 'SYSTEM',
      endpoint: data.endpoint || '/system',
      ...data
    });
  };

  return AuditLog;
}

// Initialize model when database is ready
let AuditLog;

export async function initializeAuditLogModel(sequelize) {
  if (sequelize && !AuditLog) {
    AuditLog = defineAuditLogModel(sequelize);
  }
  return AuditLog;
}

export function getAuditLogModel() {
  if (global.testModels?.AuditLog) {
    return global.testModels.AuditLog;
  }
  return AuditLog;
}
