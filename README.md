# AssetFlow — Enterprise Asset & Resource Management System

AssetFlow is a modern, full-screen web application designed to track company assets, manage department allocations, handle resource bookings, coordinate maintenance requests, log physical audits, and export analytics reports.

---

## 🚀 Key Features

* **Real-time Dashboard:** Displays live KPI cards (Assets Available, Allocated, Maintenance Today, Bookings, Pending Transfers, and Overdue Returns) alongside an interactive list of overdue return logs.
* **Asset Directory:** Allows admins and managers to register new assets with auto-generated tags, upload attachment links, search by serial number, and view individual asset allocation and maintenance history.
* **Organization Setup:** Tabbed workspace to view/create Departments, Categories, and Employee directory details. Admins can securely register new employees with emails, passwords, and custom roles.
* **Allocations & Transfers:** Interactive tab to check out assets to employees and request allocations, transfers, or returns.
* **Resource Booking:** Visual calendar booking interface to reserve shared equipment, vehicles, or conference rooms (guards against schedule conflicts).
* **Maintenance Tracker:** Form to submit repair requests, assign technicians, transition repair status (approved, in progress, resolved), and track maintenance logs.
* **Asset Auditing:** Custom log screen to generate physical verification logs, assign verification statuses, and sign off audit cycles.
* **Reports & Analytics:** Dashboard analytics reporting area allowing data exports of current system state.
* **Interactive Notifications:** WebSocket-backed toast system alerting users of status shifts (e.g. transfers approved, assets damaged) and unread notification logs.

---

## 🛠️ Technology Stack

* **Backend:** FastAPI (Python), SQLAlchemy ORM, SQLite database, python-dotenv config, smtplib for SMTP transactional emails.
* **Frontend:** Next.js (React / TypeScript), Tailwind CSS, Lucide React icons.

---

## ⚙️ Configuration & Environment Variables

Configure your outgoing server and database details inside **`backend/.env`**:

```ini
JWT_SECRET=some-long-random-string-for-hackathon
PORT=5000
DATABASE_URL=sqlite:///assetflow.db

# SMTP outgoing mail configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
```

> [!NOTE]
> If SMTP keys are missing or credentials fail, the server automatically prints generated recovery codes directly to the backend terminal output as a failsafe fallback.

---

## 🏃 Setup & Execution

### 1. Prerequisites
Ensure you have **Python 3.11** (or 3.10+) and **Node.js 18+** installed.

### 2. Run the Backend (FastAPI)
Open a terminal in the root folder, navigate to the `backend/` directory, install requirements, and start the Uvicorn server:
```powershell
cd backend
pip install -r requirements.txt
py -3.11 -m uvicorn main:app --reload
```
The API documentation will be available at: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Run the Frontend (Next.js)
Open a second terminal, navigate to the `frontend/` directory, install packages, and start the development server:
```powershell
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Test Credentials (Seeded Accounts)

You can use the following seeded accounts (password: `password123`) to test different role permissions:

* **Admin:** `alice@assetflow.com` (Permission to create users, update roles, register categories/departments).
* **Asset Manager:** `mark@assetflow.com` (Permission to register assets, approve transfers, assign maintenance).
* **Department Head:** `bob@assetflow.com` (Permission to approve team allocations and transfers).
* **Employee:** `raj@assetflow.com` (Standard user view).
