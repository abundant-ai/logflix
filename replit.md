# Terminal Bench Viewer

## Overview

A React-based web application for viewing and analyzing terminal benchmarking data stored in AWS S3. The application provides an interface to browse benchmark runs organized by date, task, and AI model, with features to view terminal recordings, task configurations, and performance results. Built as a full-stack application with Express.js backend and React frontend using modern tooling including TypeScript, Tailwind CSS, and shadcn/ui components.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for build tooling
- **UI Framework**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom dark theme configuration
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Terminal Playback**: Asciinema player integration for viewing terminal recordings

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with structured error handling and request/response logging
- **Data Access**: Direct S3 integration without traditional database layer
- **Development**: Vite middleware integration for hot module replacement

### Data Storage Solution
- **Primary Storage**: AWS S3 with hierarchical path structure (`tb-2.0-audit/<date>/<task-id>/<model-name>/`)
- **File Types**: Asciinema recordings (.cast), YAML configurations (task.yaml), JSON results (results.json)
- **Caching**: In-memory caching for S3 hierarchy data to reduce API calls
- **Schema Validation**: Zod schemas for runtime type checking of S3 data structures

### External Dependencies
- **AWS S3**: Primary data storage using AWS SDK v3 with credential-based authentication
- **Neon Database**: PostgreSQL database configuration present but not actively used (application is S3-centric)
- **Drizzle ORM**: Database toolkit configured but not utilized in current S3-based architecture
- **Asciinema Player**: Terminal recording playback functionality
- **React Query**: Server state synchronization and caching
- **shadcn/ui**: Pre-built accessible UI components

### Key Architectural Decisions

**S3-First Architecture**: The application reads directly from S3 without a traditional database, treating S3 as both storage and data source. This simplifies the architecture but may require database integration for advanced querying or caching needs.

**Component-Based UI**: Uses a comprehensive component library (shadcn/ui) for consistent design and accessibility, with custom styling through Tailwind CSS variables for theming.

**Type Safety**: Full TypeScript implementation with Zod schemas for runtime validation, ensuring type safety across the entire stack from S3 data to React components.

**Development Experience**: Integrated Vite development server with Express for seamless full-stack development, including error overlays and hot reload capabilities.