import { DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';

/**
 * User Model for authentication and role-based access control
 */
export function defineUserModel(sequelize) {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    hashedPassword: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'demo',
      validate: {
        isIn: [['owner', 'family', 'friend', 'demo']]
      }
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    },
    approved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    monthlyBudget: {
      type: DataTypes.DECIMAL(8, 2),
      defaultValue: 35.00
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true
    },
    failedLoginAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lockedUntil: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'users',
    timestamps: true,
    indexes: [
      {
        fields: ['email']
      },
      {
        fields: ['role']
      }
    ],
    hooks: {
      beforeCreate: async (user) => {
        if (user.hashedPassword) {
          user.hashedPassword = await bcrypt.hash(user.hashedPassword, 12);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('hashedPassword')) {
          user.hashedPassword = await bcrypt.hash(user.hashedPassword, 12);
        }
      }
    }
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    return bcrypt.compare(password, this.hashedPassword);
  };

  User.prototype.hasPermission = function(permission) {
    return this.permissions[permission] === true;
  };

  User.prototype.isLocked = function() {
    return !!(this.lockedUntil && new Date() < this.lockedUntil);
  };

  return User;
}

// Initialize model when database is ready
let User;

export async function initializeUserModel(sequelize) {
  if (sequelize && !User) {
    User = defineUserModel(sequelize);
  }
  return User;
}

export function getUserModel() {
  if (global.testModels?.User) {
    return global.testModels.User;
  }
  return User;
}
