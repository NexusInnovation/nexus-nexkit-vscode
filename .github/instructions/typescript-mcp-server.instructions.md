---
description: Instructions for building Model Context Protocol (MCP) servers using the TypeScript SDK
applyTo: '**/*.ts'
---

## Overview
These instructions provide best practices and implementation guidance for building Model Context Protocol (MCP) servers in TypeScript/Node.js using the official SDK.

## Key Topics
- Project scaffolding and recommended folder structure
- TypeScript configuration for MCP servers
- Using the official MCP TypeScript SDK
- Implementing context endpoints and handlers
- Error handling and validation
- Testing strategies (unit, integration)
- Deployment and CI/CD tips

## Best Practices
- Use strict TypeScript settings (`strict`, `noImplicitAny`, etc.)
- Organize code by feature/domain
- Prefer async/await for all I/O
- Validate all incoming requests
- Write comprehensive tests for endpoints
- Document API endpoints and context schemas
- Use environment variables for secrets/configuration

## Example Project Structure
```
my-mcp-server/
├── src/
│   ├── endpoints/
│   ├── handlers/
│   ├── context/
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## References
## References
MCP TypeScript SDK Documentation
Node.js Best Practices
TypeScript Handbook
