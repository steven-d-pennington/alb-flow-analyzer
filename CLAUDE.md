# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALB Flow Analyzer is a full-stack TypeScript application for analyzing AWS Application Load Balancer flow logs and generating load test configurations. It uses a React frontend with Material-UI and an Express backend with multi-database support.

## Common Commands

### Development
```bash
# Start full application (frontend and backend)
npm run dev

# Start backend only (port 3001)
npm run dev:backend

# Start frontend only (port 3000)
npm run dev:frontend

# Install all dependencies (root, backend, and frontend)
npm run install:all
```

### Building
```bash
# Build both frontend and backend
npm run build

# Build backend only (output to backend/dist/)
npm run build:backend

# Build frontend only (output to frontend/dist/)
npm run build:frontend
```

### Testing
```bash
# Run all tests
npm test

# Backend tests (Jest)
cd backend && npm test
cd backend && npm run test:watch  # Watch mode

# Frontend tests (Vitest)
cd frontend && npm test
cd frontend && npm run test:watch  # Watch mode
```

### Production
```bash
# Start production server (requires build first)
npm start
```

## Architecture

### Tech Stack
- **Backend**: Express.js, TypeScript, multi-database support (SQLite/PostgreSQL/ClickHouse/DuckDB)
- **Frontend**: React 18, TypeScript, Material-UI, Vite
- **Real-time**: WebSocket for progress updates
- **AWS**: SDK integration for S3 and credential management

### Key Directories

**Backend (`/backend/src/`):**
- `auth/`: AWS credential management and validation
- `database/`: Database abstraction layer with multi-db support
- `parser/`: ALB flow log parsing engine
- `ingestion/`: Log processing pipeline
- `s3/`: AWS S3 integration for remote files
- `analysis/`: Traffic pattern analysis and metrics
- `routes/`: REST API endpoints
- `websocket/`: Real-time progress communication
- `config/`: Environment and app configuration

**Frontend (`/frontend/src/`):**
- `pages/`: Main application pages (HomePage, UploadPage, S3BrowsePage)
- `components/`: Reusable UI components
- `services/`: API client services
- `hooks/`: Custom React hooks
- `types/`: TypeScript type definitions

### API Structure
Backend runs on `http://localhost:3001` with these key endpoints:
- `/api/auth`: AWS credential management
- `/api/upload`: File upload handling
- `/api/s3`: S3 browsing and file operations
- `/api/analysis`: Log analysis and metrics
- `/api/export`: Export data in various formats
- WebSocket on same port for real-time updates

### Database Configuration
The system supports multiple databases configured via environment variables:
- Development default: SQLite (`flowlog.db`)
- Production options: PostgreSQL, ClickHouse, DuckDB
- Database layer provides unified interface across all databases

### Key Patterns
1. **Monorepo Structure**: Coordinated frontend/backend with root-level scripts
2. **Type Safety**: Shared TypeScript types between frontend and backend
3. **Error Boundaries**: Comprehensive error handling with user-friendly messages
4. **Progress Tracking**: WebSocket-based real-time updates during log processing
5. **Multi-Format Export**: CSV, JSON, and AWS Distributed Load Testing configurations

## Development Workflow

### Adding New Features
1. Define types in respective `types/` directories
2. Implement backend logic in appropriate service directory
3. Create API endpoint in `backend/src/routes/`
4. Add frontend service in `frontend/src/services/`
5. Build UI components in `frontend/src/components/`
6. Write tests for both backend (Jest) and frontend (Vitest)

### Environment Variables
Backend uses `.env` file (create from `.env.example` if exists):
- `DATABASE_TYPE`: sqlite | postgresql | clickhouse | duckdb
- `DATABASE_URL`: Connection string for production databases
- `PORT`: Backend server port (default: 3001)
- AWS credentials can be provided via environment or through the UI

### Testing Approach
- Backend: Unit tests for parsers, services, and API endpoints
- Frontend: Component tests with React Testing Library
- Both use TypeScript for type-safe testing