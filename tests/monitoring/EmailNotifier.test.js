import { jest } from '@jest/globals';

// Mock https module
const mockHttps = {
  request: jest.fn()
};
jest.unstable_mockModule('https', () => ({
  default: mockHttps,
  ...mockHttps
}));

// Mock console methods
const originalConsole = console;
const mockConsole = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

beforeAll(() => {
  global.console = mockConsole;
});

afterAll(() => {
  global.console = originalConsole;
});

// Import after mocking
const EmailNotifierModule = await import('../../src/monitoring/EmailNotifier.js');
const EmailNotifier = EmailNotifierModule.default;

describe('EmailNotifier', () => {
  let emailNotifier;
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    emailNotifier = new EmailNotifier();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    test('should initialize with environment variables', () => {
      process.env.SENDGRID_API_KEY = 'SG.test-key';
      process.env.EMAIL_FROM = 'from@test.com';
      process.env.EMAIL_TO = 'to@test.com';
      process.env.DAILY_COST_THRESHOLD = '10.0';
      process.env.WEEKLY_COST_THRESHOLD = '50.0';
      process.env.MONTHLY_COST_THRESHOLD = '200.0';
      
      const notifier = new EmailNotifier();
      
      expect(notifier.sendGridApiKey).toBe('SG.test-key');
      expect(notifier.fromEmail).toBe('from@test.com');
      expect(notifier.toEmail).toBe('to@test.com');
      expect(notifier.thresholds).toEqual({
        daily: 10.0,
        weekly: 50.0,
        monthly: 200.0
      });
      expect(notifier.isInitialized).toBe(false);
    });

    test('should use default values when environment variables are missing', () => {
      delete process.env.SENDGRID_API_KEY;
      delete process.env.EMAIL_FROM;
      delete process.env.EMAIL_TO;
      delete process.env.DAILY_COST_THRESHOLD;
      
      const notifier = new EmailNotifier();
      
      expect(notifier.sendGridApiKey).toBeUndefined();
      expect(notifier.fromEmail).toBe('alfred@example.com');
      expect(notifier.toEmail).toBeUndefined();
      expect(notifier.thresholds).toEqual({
        daily: 5.0,
        weekly: 25.0,
        monthly: 100.0
      });
    });

    test('should fallback to EMAIL_TO for fromEmail when EMAIL_FROM is missing', () => {
      process.env.EMAIL_TO = 'test@example.com';
      delete process.env.EMAIL_FROM;
      
      const notifier = new EmailNotifier();
      
      expect(notifier.fromEmail).toBe('test@example.com');
    });
  });

  describe('initialize', () => {
    test('should initialize successfully with valid configuration', async () => {
      emailNotifier.sendGridApiKey = 'SG.test-key';
      emailNotifier.toEmail = 'test@example.com';
      
      const result = await emailNotifier.initialize();
      
      expect(result).toBe(true);
      expect(emailNotifier.isInitialized).toBe(true);
      expect(mockConsole.log).toHaveBeenCalledWith('Email notifier initialized with SendGrid REST API');
    });

    test('should fail initialization when SendGrid API key is missing', async () => {
      emailNotifier.sendGridApiKey = null;
      emailNotifier.toEmail = 'test@example.com';
      
      const result = await emailNotifier.initialize();
      
      expect(result).toBe(false);
      expect(emailNotifier.isInitialized).toBe(false);
      expect(mockConsole.warn).toHaveBeenCalledWith('SendGrid API key not configured - email notifications disabled');
    });

    test('should fail initialization when recipient email is missing', async () => {
      emailNotifier.sendGridApiKey = 'SG.test-key';
      emailNotifier.toEmail = null;
      
      const result = await emailNotifier.initialize();
      
      expect(result).toBe(false);
      expect(emailNotifier.isInitialized).toBe(false);
      expect(mockConsole.warn).toHaveBeenCalledWith('Recipient email not configured - email notifications disabled');
    });

    test('should log initialization details', async () => {
      emailNotifier.sendGridApiKey = 'SG.test-key-12345';
      emailNotifier.toEmail = 'test@example.com';
      emailNotifier.fromEmail = 'from@example.com';
      
      await emailNotifier.initialize();
      
      expect(mockConsole.log).toHaveBeenCalledWith('Email initialization - SendGrid API key present:', true);
      expect(mockConsole.log).toHaveBeenCalledWith('Email initialization - API key length:', 17);
      expect(mockConsole.log).toHaveBeenCalledWith('Email initialization - API key starts with SG.:', true);
      expect(mockConsole.log).toHaveBeenCalledWith('Email initialization - Recipient email present:', true);
      expect(mockConsole.log).toHaveBeenCalledWith('Email initialization - From email:', 'from@example.com');
    });
  });

  describe('sendEmail', () => {
    beforeEach(() => {
      emailNotifier.isInitialized = true;
      emailNotifier.sendGridApiKey = 'SG.test-key';
      emailNotifier.fromEmail = 'from@test.com';
      emailNotifier.toEmail = 'to@test.com';
    });

    test('should fail when not initialized', async () => {
      emailNotifier.isInitialized = false;
      
      const result = await emailNotifier.sendEmail('Test Subject', 'Test content');
      
      expect(result).toBe(false);
      expect(mockConsole.warn).toHaveBeenCalledWith('Email notifier not initialized - skipping email');
    });

    test('should fail when content is empty', async () => {
      const result = await emailNotifier.sendEmail('Test Subject', '');
      
      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalledWith('Email content cannot be empty');
    });

    test('should fail when content is only whitespace', async () => {
      const result = await emailNotifier.sendEmail('Test Subject', '   \n\t  ');
      
      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalledWith('Email content cannot be empty');
    });

    test('should send email successfully with 200 response', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('{"message":"success"}');
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const result = await emailNotifier.sendEmail('Test Subject', 'Test content');

      expect(result).toBe(true);
      expect(mockHttps.request).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'api.sendgrid.com',
          port: 443,
          path: '/v3/mail/send',
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer SG.test-key',
            'Content-Type': 'application/json'
          })
        }),
        expect.any(Function)
      );
      expect(mockConsole.log).toHaveBeenCalledWith('Email sent successfully:', 'Test Subject');
    });

    test('should send email successfully with 202 response', async () => {
      const mockResponse = {
        statusCode: 202,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('');
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const result = await emailNotifier.sendEmail('Test Subject', 'Test content');

      expect(result).toBe(true);
    });

    test('should handle 400 error response', async () => {
      const errorResponse = '{"errors":[{"message":"Bad Request","field":"from","help":"Please use the SendGrid API"}]}';
      const mockResponse = {
        statusCode: 400,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(errorResponse);
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const result = await emailNotifier.sendEmail('Test Subject', 'Test content');

      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalledWith('SendGrid API Error - Status:', 400);
      expect(mockConsole.error).toHaveBeenCalledWith('SendGrid API Error - Body:', errorResponse);
    });

    test('should handle 401 unauthorized response', async () => {
      const errorResponse = '{"errors":[{"message":"The provided authorization grant is invalid, expired, or revoked"}]}';
      const mockResponse = {
        statusCode: 401,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(errorResponse);
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const result = await emailNotifier.sendEmail('Test Subject', 'Test content');

      expect(result).toBe(false);
    });

    test('should handle malformed JSON error response', async () => {
      const errorResponse = 'Invalid JSON response';
      const mockResponse = {
        statusCode: 500,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(errorResponse);
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const result = await emailNotifier.sendEmail('Test Subject', 'Test content');

      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalledWith('Could not parse SendGrid error response');
    });

    test('should handle network errors', async () => {
      const networkError = new Error('ECONNREFUSED');
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(networkError);
          }
        }),
        write: jest.fn(),
        end: jest.fn()
      };

      mockHttps.request.mockImplementation(() => mockRequest);

      const result = await emailNotifier.sendEmail('Test Subject', 'Test content');

      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalledWith('Email request error:', 'ECONNREFUSED');
      expect(mockConsole.error).toHaveBeenCalledWith('Full error:', networkError);
    });

    test('should generate HTML content from text when HTML not provided', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('{}');
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const textContent = 'Line 1\nLine 2\nLine 3';
      await emailNotifier.sendEmail('Test Subject', textContent);

      const writeCall = mockRequest.write.mock.calls[0][0];
      const emailData = JSON.parse(writeCall);
      
      expect(emailData.content[1].value).toBe('<p>Line 1<br>Line 2<br>Line 3</p>');
    });

    test('should use provided HTML content', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('{}');
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const textContent = 'Plain text';
      const htmlContent = '<h1>HTML Content</h1>';
      await emailNotifier.sendEmail('Test Subject', textContent, htmlContent);

      const writeCall = mockRequest.write.mock.calls[0][0];
      const emailData = JSON.parse(writeCall);
      
      expect(emailData.content[1].value).toBe('<h1>HTML Content</h1>');
    });

    test('should include correct email structure', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('{}');
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      mockHttps.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      await emailNotifier.sendEmail('Test Subject', 'Test content');

      const writeCall = mockRequest.write.mock.calls[0][0];
      const emailData = JSON.parse(writeCall);
      
      expect(emailData.personalizations[0].to[0].email).toBe('to@test.com');
      expect(emailData.from.email).toBe('from@test.com');
      expect(emailData.from.name).toBe('Alfred MCP Server');
      expect(emailData.reply_to.email).toBe('from@test.com');
      expect(emailData.reply_to.name).toBe('Alfred Support');
      expect(emailData.subject).toBe('Test Subject');
      expect(emailData.custom_args.service).toBe('alfred-mcp-server');
      expect(emailData.custom_args.type).toBe('cost-monitoring');
      expect(emailData.categories).toEqual(['cost-alert', 'monitoring']);
    });

    test('should validate email parameters', () => {
      // Test that the EmailNotifier has the required properties for sending emails
      expect(emailNotifier.sendGridApiKey).toBeDefined();
      expect(emailNotifier.fromEmail).toBeDefined();
      expect(emailNotifier.toEmail).toBeDefined();
      expect(emailNotifier.isInitialized).toBe(true);
    });
  });

  describe('sendCostAlert', () => {
    beforeEach(() => {
      emailNotifier.isInitialized = true;
      emailNotifier.thresholds = { daily: 5.0, weekly: 25.0, monthly: 100.0 };
    });

    test('should send cost alert for daily threshold exceeded', async () => {
      const sendEmailSpy = jest.spyOn(emailNotifier, 'sendEmail').mockResolvedValue(true);
      
      const result = await emailNotifier.sendCostAlert('daily', 7.5, 5.0, 'Current day');
      
      expect(result).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        '🚨 Alfred Cost Alert: DAILY threshold exceeded',
        expect.stringContaining('DAILY threshold exceeded'),
        expect.stringContaining('<h2 style="color: #e74c3c;">🚨 Cost Threshold Alert</h2>')
      );
    });

    test('should send cost alert for weekly threshold exceeded', async () => {
      const sendEmailSpy = jest.spyOn(emailNotifier, 'sendEmail').mockResolvedValue(true);
      
      const result = await emailNotifier.sendCostAlert('weekly', 30.0, 25.0, 'Current week');
      
      expect(result).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        '🚨 Alfred Cost Alert: WEEKLY threshold exceeded',
        expect.stringContaining('WEEKLY threshold exceeded'),
        expect.stringContaining('<h2 style="color: #e74c3c;">🚨 Cost Threshold Alert</h2>')
      );
    });

    test('should send cost alert for monthly threshold exceeded', async () => {
      const sendEmailSpy = jest.spyOn(emailNotifier, 'sendEmail').mockResolvedValue(true);
      
      const result = await emailNotifier.sendCostAlert('monthly', 150.0, 100.0, 'Current month');
      
      expect(result).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        '🚨 Alfred Cost Alert: MONTHLY threshold exceeded',
        expect.stringContaining('MONTHLY threshold exceeded'),
        expect.stringContaining('<h2 style="color: #e74c3c;">🚨 Cost Threshold Alert</h2>')
      );
    });

    test('should send cost alert for any type', async () => {
      const sendEmailSpy = jest.spyOn(emailNotifier, 'sendEmail').mockResolvedValue(true);
      
      const result = await emailNotifier.sendCostAlert('custom', 10.0, 5.0, 'Custom period');
      
      expect(result).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        '🚨 Alfred Cost Alert: CUSTOM threshold exceeded',
        expect.stringContaining('CUSTOM threshold exceeded'),
        expect.stringContaining('<h2 style="color: #e74c3c;">🚨 Cost Threshold Alert</h2>')
      );
    });
  });

  describe('sendTestEmail', () => {
    beforeEach(() => {
      emailNotifier.isInitialized = true;
    });

    test('should send test email successfully', async () => {
      const sendEmailSpy = jest.spyOn(emailNotifier, 'sendEmail').mockResolvedValue(true);
      
      const result = await emailNotifier.sendTestEmail();
      
      expect(result).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        'Alfred Test Email',
        'This is a simple test email from Alfred cost monitoring system.'
      );
    });

    test('should fail when not initialized', async () => {
      emailNotifier.isInitialized = false;
      
      const result = await emailNotifier.sendTestEmail();
      
      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalledWith('EmailNotifier not initialized');
    });
  });

  describe('checkThresholds', () => {
    beforeEach(() => {
      emailNotifier.isInitialized = true;
      emailNotifier.thresholds = { daily: 5.0, weekly: 25.0, monthly: 100.0 };
    });

    test('should send alert when daily threshold exceeded', async () => {
      const sendCostAlertSpy = jest.spyOn(emailNotifier, 'sendCostAlert').mockResolvedValue(true);
      const costData = {
        summary: { totalCost: 7.5 }
      };
      
      await emailNotifier.checkThresholds(costData);
      
      expect(sendCostAlertSpy).toHaveBeenCalledWith('daily', 7.5, 5.0, 'Current day');
    });

    test('should not send alert when threshold not exceeded', async () => {
      const sendCostAlertSpy = jest.spyOn(emailNotifier, 'sendCostAlert').mockResolvedValue(true);
      const costData = {
        summary: { totalCost: 3.0 }
      };
      
      await emailNotifier.checkThresholds(costData);
      
      expect(sendCostAlertSpy).not.toHaveBeenCalled();
    });

    test('should not check thresholds when not initialized', async () => {
      emailNotifier.isInitialized = false;
      const sendCostAlertSpy = jest.spyOn(emailNotifier, 'sendCostAlert').mockResolvedValue(true);
      const costData = {
        summary: { totalCost: 10.0 }
      };
      
      const result = await emailNotifier.checkThresholds(costData);
      
      expect(result).toBeUndefined();
      expect(sendCostAlertSpy).not.toHaveBeenCalled();
    });
  });

  describe('startThresholdMonitoring', () => {
    let originalSetInterval;
    let mockSetInterval;

    beforeAll(() => {
      originalSetInterval = global.setInterval;
      mockSetInterval = jest.fn();
      global.setInterval = mockSetInterval;
    });

    afterAll(() => {
      global.setInterval = originalSetInterval;
    });

    beforeEach(() => {
      emailNotifier.isInitialized = true;
      emailNotifier.thresholds = { daily: 5.0, weekly: 25.0, monthly: 100.0 };
    });

    test('should start threshold monitoring when initialized', async () => {
      const mockCostTracker = {
        getUsageStats: jest.fn().mockResolvedValue({
          summary: { totalCost: 3.0 }
        })
      };

      await emailNotifier.startThresholdMonitoring(mockCostTracker);

      expect(mockConsole.log).toHaveBeenCalledWith('Starting cost threshold monitoring...');
      expect(mockConsole.log).toHaveBeenCalledWith('Thresholds:', emailNotifier.thresholds);
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
    });

    test('should not start monitoring when not initialized', async () => {
      emailNotifier.isInitialized = false;
      const mockCostTracker = {
        getUsageStats: jest.fn()
      };

      await emailNotifier.startThresholdMonitoring(mockCostTracker);

      expect(mockConsole.log).toHaveBeenCalledWith('Email notifier not initialized - threshold monitoring disabled');
      expect(mockSetInterval).not.toHaveBeenCalled();
    });

    test('should handle errors in monitoring interval', async () => {
      const mockCostTracker = {
        getUsageStats: jest.fn().mockRejectedValue(new Error('Cost tracker error'))
      };

      await emailNotifier.startThresholdMonitoring(mockCostTracker);

      // Get the interval callback function
      const intervalCallback = mockSetInterval.mock.calls[0][0];
      
      // Execute the callback to test error handling
      await intervalCallback();

      expect(mockConsole.error).toHaveBeenCalledWith('Error checking cost thresholds:', expect.any(Error));
    });

    test('should call checkThresholds in monitoring interval', async () => {
      const mockCostData = {
        summary: { totalCost: 3.0 }
      };
      const mockCostTracker = {
        getUsageStats: jest.fn().mockResolvedValue(mockCostData)
      };

      const checkThresholdsSpy = jest.spyOn(emailNotifier, 'checkThresholds').mockResolvedValue();

      await emailNotifier.startThresholdMonitoring(mockCostTracker);

      // Get the interval callback function
      const intervalCallback = mockSetInterval.mock.calls[0][0];
      
      // Execute the callback
      await intervalCallback();

      expect(mockCostTracker.getUsageStats).toHaveBeenCalled();
      expect(checkThresholdsSpy).toHaveBeenCalledWith(mockCostData);
    });
  });


  describe('Edge Cases and Error Handling', () => {
    test('should handle missing cost data in checkThresholds', async () => {
      emailNotifier.isInitialized = true;
      const sendCostAlertSpy = jest.spyOn(emailNotifier, 'sendCostAlert').mockResolvedValue(true);
      
      // Test with undefined costData
      await expect(emailNotifier.checkThresholds(undefined)).rejects.toThrow();
      
      // Test with null costData
      await expect(emailNotifier.checkThresholds(null)).rejects.toThrow();
      
      expect(sendCostAlertSpy).not.toHaveBeenCalled();
    });

    test('should handle missing summary in cost data', async () => {
      emailNotifier.isInitialized = true;
      const sendCostAlertSpy = jest.spyOn(emailNotifier, 'sendCostAlert').mockResolvedValue(true);
      const costData = {};
      
      await expect(emailNotifier.checkThresholds(costData)).rejects.toThrow();
      expect(sendCostAlertSpy).not.toHaveBeenCalled();
    });

    test('should handle zero cost thresholds', async () => {
      emailNotifier.isInitialized = true;
      emailNotifier.thresholds = { daily: 0, weekly: 0, monthly: 0 };
      const sendCostAlertSpy = jest.spyOn(emailNotifier, 'sendCostAlert').mockResolvedValue(true);
      const costData = {
        summary: { totalCost: 0.01 }
      };
      
      await emailNotifier.checkThresholds(costData);
      
      expect(sendCostAlertSpy).toHaveBeenCalledWith('daily', 0.01, 0, 'Current day');
    });

    test('should handle negative cost values', async () => {
      emailNotifier.isInitialized = true;
      emailNotifier.thresholds = { daily: 5.0, weekly: 25.0, monthly: 100.0 };
      const sendCostAlertSpy = jest.spyOn(emailNotifier, 'sendCostAlert').mockResolvedValue(true);
      const costData = {
        summary: { totalCost: -1.0 }
      };
      
      await emailNotifier.checkThresholds(costData);
      
      expect(sendCostAlertSpy).not.toHaveBeenCalled();
    });

    test('should handle very large cost values', async () => {
      emailNotifier.isInitialized = true;
      emailNotifier.thresholds = { daily: 5.0, weekly: 25.0, monthly: 100.0 };
      const sendCostAlertSpy = jest.spyOn(emailNotifier, 'sendCostAlert').mockResolvedValue(true);
      const costData = {
        summary: { totalCost: 999999.99 }
      };
      
      await emailNotifier.checkThresholds(costData);
      
      expect(sendCostAlertSpy).toHaveBeenCalledWith('daily', 999999.99, 5.0, 'Current day');
    });

    test('should handle invalid threshold values', () => {
      process.env.DAILY_COST_THRESHOLD = 'invalid';
      process.env.WEEKLY_COST_THRESHOLD = 'NaN';
      process.env.MONTHLY_COST_THRESHOLD = '';
      
      const notifier = new EmailNotifier();
      
      expect(notifier.thresholds.daily).toBe(5.0); // fallback to default
      expect(notifier.thresholds.weekly).toBe(25.0); // fallback to default
      expect(notifier.thresholds.monthly).toBe(100.0); // fallback to default
    });

    test('should handle empty environment variables', () => {
      process.env.SENDGRID_API_KEY = '';
      process.env.EMAIL_FROM = '';
      process.env.EMAIL_TO = '';
      
      const notifier = new EmailNotifier();
      
      expect(notifier.sendGridApiKey).toBe('');
      expect(notifier.fromEmail).toBe('alfred@example.com');
      expect(notifier.toEmail).toBe('');
    });

    test('should handle sendCostAlert errors', async () => {
      emailNotifier.isInitialized = true;
      const sendEmailSpy = jest.spyOn(emailNotifier, 'sendEmail').mockRejectedValue(new Error('Send failed'));
      
      await expect(emailNotifier.sendCostAlert('daily', 10.0, 5.0, 'Current day')).rejects.toThrow('Send failed');
      expect(sendEmailSpy).toHaveBeenCalled();
    });

    test('should handle sendTestEmail logging', async () => {
      emailNotifier.isInitialized = true;
      emailNotifier.sendGridApiKey = 'SG.test-key';
      emailNotifier.toEmail = 'test@example.com';
      emailNotifier.fromEmail = 'from@example.com';
      
      const sendEmailSpy = jest.spyOn(emailNotifier, 'sendEmail').mockResolvedValue(true);
      
      await emailNotifier.sendTestEmail();
      
      expect(mockConsole.log).toHaveBeenCalledWith('Sending test email with config:', {
        hasApiKey: true,
        hasToEmail: true,
        fromEmail: 'from@example.com'
      });
      expect(sendEmailSpy).toHaveBeenCalledWith(
        'Alfred Test Email',
        'This is a simple test email from Alfred cost monitoring system.'
      );
    });
  });
});
