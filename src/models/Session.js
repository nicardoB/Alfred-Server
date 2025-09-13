import { DataTypes } from 'sequelize';

/**
 * Session Model for managing user authentication sessions
 */
export function defineSessionModel(sequelize) {
  const Session = sequelize.define('Session', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    token: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true
    },
    deviceInfo: {
      type: DataTypes.JSON,
      allowNull: true
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userAgent: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    lastActivity: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'sessions',
    timestamps: true,
    indexes: [
      {
        fields: ['token']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['expiresAt']
      }
    ]
  });

  // Instance methods
  Session.prototype.isExpired = function() {
    return new Date() > this.expiresAt;
  };

  Session.prototype.updateActivity = async function() {
    this.lastActivity = new Date();
    await this.save();
  };

  return Session;
}

// Initialize model when database is ready
let Session;

export async function initializeSessionModel(sequelize) {
  if (sequelize && !Session) {
    Session = defineSessionModel(sequelize);
  }
  return Session;
}

export function getSessionModel() {
  return Session;
}
