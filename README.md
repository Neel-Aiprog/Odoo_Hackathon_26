# AssetFlow 📦

**AssetFlow** is a modern, premium Enterprise Asset & Resource Management system designed to track physical assets, coordinate allocations, schedule shared bookable resources, manage maintenance lifecycles, and facilitate structured physical audit verification cycles.

---

## Key Features

- 🔐 **Global Authentication Gate**: Bulletproof global session state with automatic redirection to a beautiful Neo-Brutalist Sign In portal.
- 📂 **Interactive Asset Directory**: Track physical items with metadata, serial numbers, real-time lifecycle status (Available, Allocated, Under Maintenance), and complete history cards.
- 📆 **Conflict-Free Bookings**: Interactive timeline scheduler for reserving conference rooms, company vehicles, and equipment, with automatic overlap prevention.
- 🔧 **Maintenance Ticket Kanban**: Column-based workflow tracking repair tickets from pending, approved, assigned technicians, to resolved states, with status cascades.
- 🔄 **Asset Allocations & Transfers**: Streamlined checkout system with double-allocation prevention and peer-to-peer asset transfer requests.
- 📊 **Audits & Compliance**: Initiate audit cycles, assign auditors, flag item conditions (verified, missing, damaged), and close cycles with automated cascades.
- 📈 **SVG Analytics Reports**: Live data visualization charting department utilization, maintenance frequency, idle assets, and one-click CSV reports export.

---

## Technology Stack

- **Backend**: FastAPI, SQLAlchemy, SQLite, Uvicorn, Python
- **Frontend**: Next.js, React, TailwindCSS, TypeScript

---

## Getting Started

### 1. Prerequisite Setup

Ensure you have Python 3.10+ and Node.js 18+ installed on your machine.

---

### 2. Running the Backend API Server

Navigate to the `backend` directory, install Python dependencies, seed the database, and run the FastAPI server:

```bash
# Navigate to backend folder
cd backend

# Install dependencies
pip install -r requirements.txt

# Seed the SQLite database with default users, departments, and assets
python seed.py

# Start the FastAPI dev server (runs on port 8000)
python -m uvicorn main:app --reload --port 8000
```

*The API documentation will be available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).*

---

### 3. Running the Frontend Server

Navigate to the `frontend` directory, install packages, and start the Next.js development server:

```bash
# Navigate to frontend folder
cd frontend

# Install Node modules
npm install

# Start Next.js dev server with Webpack (runs on port 3000)
npx next dev --webpack
```

*Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to access the application.*

---

## Default Seed Credentials

For manual testing, log in with one of the following pre-seeded administrative/operational accounts:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `alice@assetflow.com` | `password123` |
| **Asset Manager** | `raj@assetflow.com` | `password123` |
| **Employee** | `john@assetflow.com` | `password123` |
| **Employee** | `jane@assetflow.com` | `password123` |

---

## Running Integration Tests

AssetFlow comes equipped with an end-to-end integration workflow test suite to verify allocations, double-booking blocks, transfer requests, and status cascades:

```bash
cd backend
python test_e2e_workflow.py
```
