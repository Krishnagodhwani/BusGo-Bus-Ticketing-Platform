# BusGo Bus Ticketing Platform

A full-stack bus ticketing and transport operations platform built for three core user groups:

- `Admin` for platform governance, operator onboarding, analytics, refunds, finance visibility, support, and configuration
- `Operator` for fleet, trips, routes, company operations, crew, and seat controls
- `Passenger` for bus search, booking, and ticketing flows

The project combines a FastAPI backend with a React + Vite frontend and focuses on a clean operational dashboard experience across booking management, operator workflows, and platform administration.

## Highlights

- Multi-role platform with `ADMIN`, `OPERATOR`, and `USER` authentication flows
- Admin command center for analytics, onboarding, booking monitoring, refunds, support, and policy settings
- Operator workspace for buses, routes, trips, manifests, company profile, crew assignments, and blocked seats
- Booking engine with intermediate-stop support and segment-aware seat booking APIs
- Financial and business controls including cancellation policy, revenue config, fare templates, ledger visibility, and CSV exports
- Audit logs, alerts, document verification, and support ticket desk for operational oversight

## Core Features

### Admin
- Admin login and protected dashboard access
- Operator onboarding queue with approve/reject workflow
- Operator document verification
- Operator account and commercial profile management
- Master management for cities and bus types
- Platform analytics for operators, users, bookings, revenue, cancellations, and refund load
- Booking monitoring and refund issue controls
- Payment ledger and refund audit visibility
- Cancellation policy management
- Commission and revenue configuration
- Global inventory rules
- Fare template management
- Support ticket desk
- CSV exports for operator, booking, and support reporting
- Admin alerts and audit logs
- Platform settings management

### Operator
- Operator authentication and protected workspace
- Bus and fleet management
- Route and trip management
- Boarding manifest and passenger visibility
- Company profile management
- Driver and crew assignment workflow
- Blocked seat controls
- Real-time trip status and operations support

### Passenger / Booking
- Search and booking flows
- Segment/intermediate-stop ticket booking support
- Ticket and booking record handling
- Refund-aware booking state management

## Tech Stack

### Frontend
- React 19
- Vite
- React Router
- Axios
- Custom CSS design system

### Backend
- FastAPI
- SQLAlchemy
- PyMySQL
- Pydantic
- JWT authentication
- Bcrypt password hashing

### Database
- MySQL

## Project Structure

```text
bus-ticketing-platform/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── modules/
│   │       ├── admin/
│   │       ├── auth/
│   │       ├── booking/
│   │       └── operator/
│   ├── alembic/
│   ├── create_admin.py
│   ├── seed_masters.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── layouts/
│   │   ├── modules/
│   │   └── router/
│   └── package.json
└── README.md
```

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/bus-ticketing-platform.git
cd bus-ticketing-platform
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create your backend `.env` with your MySQL connection details before starting the API.

Run the backend:

```bash
uvicorn app.main:app --reload
```

Backend base URL:

```text
http://127.0.0.1:8000
```

### 3. Create admin account

```bash
python create_admin.py
```

Default development admin credentials created by the script:

```text
Phone: 9999999999
Password: admin123
Role: ADMIN
```

### 4. Seed master data

```bash
python seed_masters.py
```

### 5. Frontend setup

```bash
cd ../frontend
npm install
npm run dev
```

Frontend base URL:

```text
http://localhost:5173
```

## Available Scripts

### Frontend

```bash
npm run dev
npm run build
npm run preview
```

### Backend

```bash
uvicorn app.main:app --reload
python create_admin.py
python seed_masters.py
```

## API Overview

The FastAPI app mounts module routers under:

```text
/api/v1
```

Main backend modules:

- `auth` for login, registration, and operator creation
- `admin` for platform governance and analytics
- `operator` for operator workflows
- `booking` for reservation and seat-booking logic

Health check endpoint:

```text
GET /health
```

## Product Direction

This project is designed as an operations-heavy bus travel platform, not just a basic booking UI. The emphasis is on:

- admin governance
- operator onboarding
- route and trip operations
- refund and financial visibility
- business rule configuration
- support and operational workflows

## Resume-Ready Summary

Built a full-stack bus ticketing and transport operations platform with separate admin, operator, and passenger workflows. Implemented authentication, operator onboarding, document verification, analytics dashboards, booking monitoring, refund processing, support ticketing, audit logs, fleet and trip operations, company and crew management, fare and inventory controls, and configurable platform settings using React, Vite, FastAPI, SQLAlchemy, and MySQL.

## Current Status

Implemented and actively available in the project:

- Admin dashboard and platform controls
- Operator management and onboarding workflows
- Booking monitor and refund controls
- Support ticket desk
- Fare templates and inventory rules
- Company profile, crew, and blocked seat workflows
- CSV report exports
- Audit logs and alerts

## Notes

- The frontend uses a custom CSS-based design system rather than Tailwind CSS.
- SQLAlchemy tables are synced on backend startup through `Base.metadata.create_all(...)`.
- This repository is structured for active feature expansion across admin, operator, and booking modules.

## License

This project is currently shared as a portfolio/demo codebase unless a separate license is added.
