# Obelisco Manager - PRD

## Problem Statement
Build "Obelisco Manager" - an internal management panel for Obelisco Radical (electrical services company in Grande Lisboa). Features: Dashboard, Budgeting with margin calculation, Proposal generation (3 tiers) with PDF export, Works management, Calendar/Agenda, WhatsApp integration.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI (port 3000)
- **Backend**: FastAPI + MongoDB (port 8001)
- **Auth**: JWT cookie-based (httpOnly cookies)
- **PDF**: jsPDF + jspdf-autotable (frontend generation)
- **Design**: Dark theme (zinc-950 bg, yellow-400 accent) matching obeliscoradical.pt

## User Personas
- Admin/Owner: Manages budgets, proposals, works, and appointments
- Team members: View and manage assigned works

## Core Requirements
- [x] JWT login with email/password
- [x] Dashboard with KPIs (total obras, lucro estimado, obras em andamento, etc)
- [x] Budget CRUD with dynamic items table (category, item, qty, cost, margin)
- [x] Auto-calculate margins and totals
- [x] Generate 3 proposals (Básico 1.0x, Profissional 1.15x, Premium 1.30x)
- [x] PDF export with company logo, items table, values
- [x] WhatsApp send button (opens wa.me with message)
- [x] Works management with status tracking (orçamento/em execução/finalizado)
- [x] Real cost vs predicted cost comparison
- [x] Calendar/Agenda with appointments and duplicate prevention
- [x] Sidebar navigation

## What's Been Implemented (April 17, 2026)
- Full backend API (21 endpoints)
- All 6 frontend pages (Login, Dashboard, Orçamentos, Propostas, Obras, Agenda)
- Auth system with admin seeding
- PDF generation with jsPDF
- WhatsApp integration (simple wa.me link)
- Calendar with overlap detection
- Dark theme matching obeliscoradical.pt

## Prioritized Backlog
### P0 (Critical) - Done
- All core features implemented

### P1 (Important)
- Multi-user support (register team members)
- Budget templates for common services
- Proposal status tracking (sent/approved/rejected flow)

### P2 (Nice to have)
- Dashboard charts (monthly revenue, works by status)
- Email notifications for appointments
- Client database/CRM
- Photo upload for works (before/after)
- Export financial reports

## Next Tasks
1. Add budget templates for common electrical services
2. Dashboard charts with Recharts
3. Multi-user team management
4. Client database linked to budgets/works
