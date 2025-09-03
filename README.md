# ALB Flow Analyzer

A web application for analyzing AWS Application Load Balancer (ALB) flow logs to understand traffic patterns and generate realistic load test configurations for AWS Distributed Load Testing.

## Features

- **Log Processing**: Parse ALB flow logs from local files or S3 buckets
- **Traffic Analysis**: Analyze request patterns, response times, and peak periods
- **Advanced Filtering**: Filter by time range, endpoints, status codes, and client IPs
- **Load Test Generation**: Create AWS Distributed Load Testing configurations
- **Export Capabilities**: Export analysis results in multiple formats

## Architecture

- **Frontend**: React with TypeScript, Material-UI, and Vite
- **Backend**: Node.js with Express.js and TypeScript
- **Database**: SQLite (development), PostgreSQL (production)
- **AWS Integration**: S3 for log files, AWS SDK for services

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- AWS credentials (for S3 integration)

### Installation

1. Clone the repository
2. Install dependencies for all components:
   ```bash
   npm run install:all
   ```

3. Set up environment variables:
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your configuration
   ```

### Development

Start both frontend and backend in development mode:
```bash
npm run dev
```

This will start:
- Backend API server on http://localhost:3001
- Frontend development server on http://localhost:3000

### Individual Services

Start backend only:
```bash
npm run dev:backend
```

Start frontend only:
```bash
npm run dev:frontend
```

### Building for Production

Build both frontend and backend:
```bash
npm run build
```

### Testing

Run tests for both frontend and backend:
```bash
npm test
```

## Project Structure

```
alb-flow-analyzer/
├── backend/                 # Node.js Express API
│   ├── src/
│   │   ├── index.ts        # Main server file
│   │   └── ...             # Additional modules (to be implemented)
│   ├── package.json
│   └── tsconfig.json
├── frontend/                # React TypeScript application
│   ├── src/
│   │   ├── main.tsx        # Application entry point
│   │   ├── App.tsx         # Main App component
│   │   └── pages/          # Page components
│   ├── package.json
│   └── vite.config.ts
├── package.json            # Root package.json for scripts
└── README.md
```

## Development Status

- ✅ Project structure and dependencies
- 🔄 Database layer and data models
- 🔄 ALB flow log parsing engine
- 🔄 AWS integration services
- 🔄 Analysis and metrics engine
- 🔄 Frontend components
- 🔄 API endpoints

## Contributing

This project follows a structured development approach with detailed requirements and design specifications. See the `.kiro/specs/alb-flow-analyzer/` directory for detailed documentation.

## License

MIT License