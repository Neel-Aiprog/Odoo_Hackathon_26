from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
from routers import auth, users, organization, assets, allocations_transfers, bookings, maintenance, audits, analytics, notifications

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AssetFlow API",
    description="Backend API Server for AssetFlow Enterprise Asset & Resource Management System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(organization.router)
app.include_router(assets.router)
app.include_router(allocations_transfers.router)
app.include_router(bookings.router)
app.include_router(maintenance.router)
app.include_router(audits.router)
app.include_router(analytics.router)
app.include_router(notifications.router)

@app.get("/")
def get_root():
    return {"status": "online", "service": "AssetFlow API", "documentation": "/docs"}