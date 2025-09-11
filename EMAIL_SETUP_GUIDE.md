# 📧 Alfred MCP Email Notification Setup Guide

## Overview

The Alfred MCP Server includes a comprehensive email notification system that provides:
- **Monthly cost reports** with detailed usage statistics
- **Cost threshold alerts** when spending exceeds predefined limits
- **Real-time monitoring** with customizable thresholds
- **Beautiful HTML emails** with charts and breakdowns

## 🚀 Quick Access

### Cost Dashboard
**URL**: `https://alfred-server-production.up.railway.app/api/v1/monitoring/dashboard`

This provides a real-time web dashboard with:
- Total cost summary with beautiful charts
- Provider breakdown (Claude, OpenAI, GitHub Copilot)
- Cost projections (daily, weekly, monthly)
- Auto-refresh every 30 seconds

### API Endpoints
- **Dashboard**: `GET /api/v1/monitoring/dashboard`
- **Cost Stats**: `GET /api/v1/monitoring/costs`
- **Test Email**: `POST /api/v1/monitoring/email/test`
- **Monthly Report**: `POST /api/v1/monitoring/email/monthly-report`
- **Thresholds**: `GET /api/v1/monitoring/email/thresholds`

## 📧 Email Configuration

### Option 1: SendGrid (Recommended)
1. Sign up at [SendGrid](https://sendgrid.com)
2. Create an API key with full permissions
3. Add to Railway environment variables:
```bash
SENDGRID_API_KEY=your_sendgrid_api_key_here
NOTIFICATION_EMAIL=your-email@example.com
FROM_EMAIL=alfred-mcp@yourdomain.com
```

### Option 2: Custom SMTP
For Gmail, Outlook, or custom SMTP servers:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
NOTIFICATION_EMAIL=your-email@example.com
FROM_EMAIL=alfred-mcp@yourdomain.com
```

## 🎯 Recommended Cost Thresholds

Based on typical AI usage patterns, here are smart threshold recommendations:

### Conservative (Personal Use)
```bash
DAILY_COST_THRESHOLD=0.50    # $0.50/day
WEEKLY_COST_THRESHOLD=2.50   # $2.50/week
MONTHLY_COST_THRESHOLD=10.00 # $10/month
TOTAL_COST_THRESHOLD=25.00   # $25 total
```

### Moderate (Development/Testing)
```bash
DAILY_COST_THRESHOLD=1.00    # $1.00/day
WEEKLY_COST_THRESHOLD=5.00   # $5.00/week
MONTHLY_COST_THRESHOLD=20.00 # $20/month
TOTAL_COST_THRESHOLD=50.00   # $50 total
```

### Production (Heavy Usage)
```bash
DAILY_COST_THRESHOLD=5.00    # $5.00/day
WEEKLY_COST_THRESHOLD=25.00  # $25/week
MONTHLY_COST_THRESHOLD=100.00 # $100/month
TOTAL_COST_THRESHOLD=250.00  # $250 total
```

## 🔧 Setup Instructions

### 1. Add Environment Variables to Railway

Go to your Railway project settings and add:

```bash
# Email Provider (choose one)
SENDGRID_API_KEY=your_sendgrid_key
# OR
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Email Configuration
NOTIFICATION_EMAIL=your-email@example.com
FROM_EMAIL=alfred-mcp@yourdomain.com

# Cost Thresholds (customize as needed)
DAILY_COST_THRESHOLD=1.00
WEEKLY_COST_THRESHOLD=5.00
MONTHLY_COST_THRESHOLD=20.00
TOTAL_COST_THRESHOLD=50.00
```

### 2. Install Dependencies

```bash
npm install nodemailer
```

### 3. Test Email Configuration

```bash
curl -X POST "https://alfred-server-production.up.railway.app/api/v1/monitoring/email/test"
```

### 4. Deploy and Verify

The system automatically:
- ✅ Checks thresholds every hour
- ✅ Sends monthly reports on the 1st of each month
- ✅ Prevents spam with intelligent alert timing
- ✅ Provides beautiful HTML emails with cost breakdowns

## 📊 Email Features

### Monthly Reports Include:
- 💰 Total monthly cost with visual breakdown
- 🔧 Provider performance comparison
- 📈 Cost projections for next period
- 📊 Usage statistics and trends
- 🔗 Direct link to live dashboard

### Threshold Alerts Include:
- 🚨 Which threshold was exceeded
- 💸 Current vs. threshold costs
- 📋 Complete usage summary
- 🔧 Provider breakdown
- 🔗 Dashboard link for real-time monitoring

## 🧪 Testing Commands

```bash
# Test email configuration
curl -X POST "https://alfred-server-production.up.railway.app/api/v1/monitoring/email/test"

# Send manual monthly report
curl -X POST "https://alfred-server-production.up.railway.app/api/v1/monitoring/email/monthly-report"

# Check current thresholds
curl "https://alfred-server-production.up.railway.app/api/v1/monitoring/email/thresholds"

# Manually check thresholds
curl -X POST "https://alfred-server-production.up.railway.app/api/v1/monitoring/email/check-thresholds"
```

## 🎨 Dashboard Features

The web dashboard provides:
- **Real-time cost tracking** with auto-refresh
- **Beautiful charts** showing usage by provider
- **Cost projections** for planning
- **Provider performance** comparison
- **Mobile-responsive design** for viewing anywhere

## 🔒 Security Notes

- API keys are never logged in full (only partial for debugging)
- Email credentials are stored securely in Railway environment variables
- All email content is generated server-side for security
- Rate limiting prevents abuse of email endpoints

## 📱 Mobile Access

The dashboard is fully responsive and works great on:
- 📱 Mobile phones
- 📱 Tablets  
- 💻 Desktop browsers
- 🖥️ Large displays

## 🚀 Next Steps

1. **Set up email configuration** using SendGrid or SMTP
2. **Configure cost thresholds** based on your usage patterns
3. **Test the system** with the provided curl commands
4. **Bookmark the dashboard** for easy access
5. **Monitor your first month** and adjust thresholds as needed

The system is now ready to keep you informed about your AI costs and help you stay within budget!
