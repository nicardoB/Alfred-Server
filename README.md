# Alfred MCP Server

A Node.js MCP (Model Context Protocol) server for the Alfred Voice Assistant, providing intelligent AI routing and real-time voice command processing.

## Features

- **Smart AI Router**: Automatically routes requests to Claude Sonnet 4, OpenAI GPT-4o-mini, or GitHub Copilot based on query complexity
- **Real-time Communication**: WebSocket and REST API support for seamless voice assistant integration
- **Session Management**: Secure session-based connections with metadata tracking
- **Audio Streaming**: Chunked audio processing pipeline for voice commands
- **Comprehensive Testing**: 90%+ test coverage with unit and integration tests

## Architecture

```
Alfred Voice App → MCP Client → Alfred MCP Server → Smart AI Router → AI Providers
                                      ↓
                               Session Manager + Audio Pipeline
```

## API Endpoints

### REST API
- `POST /api/v1/mcp/connect` - Establish MCP session
- `POST /api/v1/mcp/disconnect` - End MCP session
- `POST /api/v1/mcp/text` - Send text command
- `POST /api/v1/mcp/metadata` - Send session metadata
- `POST /api/v1/mcp/cancel` - Cancel active request
- `POST /api/v1/audio/stream` - Stream audio chunks
- `GET /api/v1/audio/status/:sessionId` - Get audio status
- `GET /api/v1/session/:sessionId` - Get session info
- `GET /health` - Health check

### WebSocket
- Real-time bidirectional communication
- Session-based message routing
- Live status updates

## Quick Start

### Prerequisites
- Node.js 18+ (recommended: v24.7.0 via nvm)
- npm or yarn

### Installation

```bash
# Clone repository
git clone <repository-url>
cd Alfred-Server

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys and configuration

# Run tests
npm test

# Start development server
npm run dev

# Start production server
npm start
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# AI Provider API Keys
ANTHROPIC_API_KEY=your_claude_api_key
OPENAI_API_KEY=your_openai_api_key
GITHUB_TOKEN=your_github_token

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/alfred_server

# Security
JWT_SECRET=your_jwt_secret
API_KEY_SALT=your_api_key_salt

# Audio Processing
AUDIO_SAMPLE_RATE=16000
AUDIO_CHUNK_SIZE=4096
```

## Smart AI Router Logic

The Smart AI Router intelligently selects the best AI provider:

- **Claude Sonnet 4**: Complex reasoning, analysis, creative tasks
- **OpenAI GPT-4o-mini**: Simple queries, general conversation
- **GitHub Copilot**: Code-related tasks, debugging, programming

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- tests/routes/mcp.test.js

# Run integration tests
npm test -- tests/integration/
```

## Development

```bash
# Start development server with hot reload
npm run dev

# Run linting
npm run lint

# Format code
npm run format
```

## Deployment

### Railway (Recommended)

1. Connect repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push to main branch

### Manual Deployment

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
Alfred-Server/
├── src/
│   ├── ai/
│   │   ├── SmartAIRouter.js
│   │   └── providers/
│   ├── routes/
│   │   ├── mcp.js
│   │   ├── audio.js
│   │   └── session.js
│   ├── session/
│   │   └── SessionManager.js
│   ├── utils/
│   │   └── logger.js
│   ├── websocket/
│   │   └── handler.js
│   └── server.js
├── tests/
│   ├── routes/
│   ├── ai/
│   ├── integration/
│   └── setup.js
├── package.json
├── jest.config.js
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Ensure 90%+ test coverage
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please create an issue in the GitHub repository.
