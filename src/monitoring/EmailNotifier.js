import https from 'https';

function EmailNotifier() {
  this.sendGridApiKey = process.env.SENDGRID_API_KEY;
  this.fromEmail = process.env.EMAIL_FROM || 'alfred@yourdomain.com';
  this.toEmail = process.env.EMAIL_TO;
  this.thresholds = {
    daily: parseFloat(process.env.DAILY_COST_THRESHOLD) || 5.0,
    weekly: parseFloat(process.env.WEEKLY_COST_THRESHOLD) || 25.0,
    monthly: parseFloat(process.env.MONTHLY_COST_THRESHOLD) || 100.0
  };
  this.isInitialized = false;
}

EmailNotifier.prototype.initialize = async function() {
  if (!this.sendGridApiKey) {
    console.warn('SendGrid API key not configured - email notifications disabled');
    return false;
  }
  
  if (!this.toEmail) {
    console.warn('Recipient email not configured - email notifications disabled');
    return false;
  }

  this.isInitialized = true;
  console.log('Email notifier initialized with SendGrid REST API');
  return true;
};

EmailNotifier.prototype.sendEmail = async function(to, subject, htmlContent, textContent) {
  if (!this.isInitialized) {
    console.warn('Email notifier not initialized - skipping email');
    return false;
  }

  const emailData = {
    personalizations: [{
      to: [{ email: to }],
      subject: subject
    }],
    from: { email: this.fromEmail },
    content: [
      {
        type: 'text/plain',
        value: textContent
      },
      {
        type: 'text/html',
        value: htmlContent
      }
    ]
  };

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(emailData);
    
    const options = {
      hostname: 'api.sendgrid.com',
      port: 443,
      path: '/v3/mail/send',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.sendGridApiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('Email sent successfully:', subject);
          resolve(true);
        } else {
          console.error('Failed to send email:', res.statusCode, data);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Email request error:', error.message);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
};

EmailNotifier.prototype.sendTestEmail = async function() {
  if (!this.isInitialized) {
    await this.initialize();
  }

  const subject = '✅ Alfred Email System Test';
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #28a745;">✅ Email System Working!</h2>
      <p>This is a test email to verify that the Alfred email notification system is working correctly.</p>
      <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      <p>If you received this email, the Railway-compatible email system is functioning properly.</p>
    </div>
  `;
  const textContent = `✅ ALFRED EMAIL SYSTEM TEST\n\nThis is a test email to verify that the Alfred email notification system is working correctly.\n\nTimestamp: ${new Date().toISOString()}\n\nIf you received this email, the Railway-compatible email system is functioning properly.`;

  return await this.sendEmail(this.toEmail, subject, htmlContent, textContent);
};

EmailNotifier.prototype.sendCostAlert = async function(type, currentCost, threshold, period) {
  const subject = `🚨 Alfred Cost Alert: ${type.toUpperCase()} threshold exceeded`;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #e74c3c;">🚨 Cost Threshold Alert</h2>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3>Alert Details</h3>
        <p><strong>Alert Type:</strong> ${type.toUpperCase()} threshold exceeded</p>
        <p><strong>Current Cost:</strong> $${currentCost.toFixed(4)} USD</p>
        <p><strong>Threshold:</strong> $${threshold.toFixed(2)} USD</p>
        <p><strong>Period:</strong> ${period}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      </div>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
        <h4>Recommended Actions:</h4>
        <ul>
          <li>Review recent AI provider usage in the dashboard</li>
          <li>Check for unexpected high-volume requests</li>
          <li>Consider adjusting usage patterns if needed</li>
          <li>Monitor the cost dashboard: <a href="https://alfred-server-production.up.railway.app/api/v1/monitoring/dashboard">View Dashboard</a></li>
        </ul>
      </div>
      
      <p style="margin-top: 30px; color: #6c757d; font-size: 14px;">
        This is an automated alert from your Alfred AI Assistant cost monitoring system.
      </p>
    </div>
  `;

  const textContent = `
🚨 ALFRED COST ALERT

Alert Type: ${type.toUpperCase()} threshold exceeded
Current Cost: $${currentCost.toFixed(4)} USD
Threshold: $${threshold.toFixed(2)} USD
Period: ${period}
Timestamp: ${new Date().toISOString()}

Recommended Actions:
- Review recent AI provider usage in the dashboard
- Check for unexpected high-volume requests
- Consider adjusting usage patterns if needed
- Monitor the cost dashboard: https://alfred-server-production.up.railway.app/api/v1/monitoring/dashboard

This is an automated alert from your Alfred AI Assistant cost monitoring system.
  `;

  return await this.sendEmail(this.toEmail, subject, htmlContent, textContent);
};

EmailNotifier.prototype.checkThresholds = async function(costData) {
  if (!this.isInitialized) {
    return;
  }

  const currentCost = costData.summary.totalCost;
  
  // Simple daily threshold check
  if (currentCost >= this.thresholds.daily) {
    console.log(`Daily cost threshold exceeded: $${currentCost} >= $${this.thresholds.daily}`);
    await this.sendCostAlert('daily', currentCost, this.thresholds.daily, 'Current day');
  }
};

EmailNotifier.prototype.startThresholdMonitoring = async function(costTracker) {
  if (!this.isInitialized) {
    console.log('Email notifier not initialized - threshold monitoring disabled');
    return;
  }

  console.log('Starting cost threshold monitoring...');
  console.log('Thresholds:', this.thresholds);

  const self = this;
  
  // Check thresholds every 5 minutes
  setInterval(async () => {
    try {
      const costData = await costTracker.getUsageStats();
      await self.checkThresholds(costData);
    } catch (error) {
      console.error('Error checking cost thresholds:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
};

export default EmailNotifier;
