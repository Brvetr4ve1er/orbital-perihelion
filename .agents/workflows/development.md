---
description: How to develop and build the Orbital Perihelion project
---

# Development Workflow

This project uses **Vite** for a modern development experience.

## Prerequisites
- Node.js installed on your system.
- PowerShell execution policy set to allow scripts (or use the bypass commands below).

## Setup
1. Clone the repository.
2. Install dependencies:
   ```powershell
   powershell -ExecutionPolicy Bypass -Command "npm install"
   ```

## Development
To start the local development server with hot-module replacement:
// turbo
```powershell
powershell -ExecutionPolicy Bypass -Command "npm run dev"
```
The application will be available at `http://localhost:5173`. It will automatically open in your browser.

## Building for Production
To generate a production-ready build in the `dist/` folder:
// turbo
```powershell
powershell -ExecutionPolicy Bypass -Command "npm run build"
```

## Previewing the Build
To preview the production build locally:
// turbo
```powershell
powershell -ExecutionPolicy Bypass -Command "npm run preview"
```

## Project Structure
- `index.html`: Main dashboard entry point.
- `pkos.html`: Visual intelligence dashboard entry point.
- `index.js` & `pkos-app.js`: Main application modules.
- `*.js` (library files): ESM modules containing parsing, schema, and enrichment logic.
