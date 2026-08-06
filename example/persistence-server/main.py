"""Aspen persistence server — reference implementation.

A minimal FastAPI backend for Aspen's remote persistence. The frontend
configures a persistence URL such as ``/state/{user_id}`` and calls
``pushPersistent()`` / ``pullPersistent()``:

- ``pushPersistent()`` sends ``PUT <persistenceUrl>`` with the exported
  state as a JSON object of ``{storageKey: serializedValue}``.
- ``pullPersistent()`` sends ``GET <persistenceUrl>`` and expects that same
  JSON object back, or HTTP 404 when no state has been saved yet.

Run it:

    pip install fastapi uvicorn
    uvicorn main:app --reload

This stores state in an in-memory dict, which resets on restart — swap the
``states`` dict for a real database in production. It also trusts the caller
about who they are; a real deployment must authenticate requests and derive
the user id from the session, NOT from the URL.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Aspen persistence server")

# Allow browser apps served from other origins to call this API during
# development. Tighten allow_origins for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "PUT"],
    allow_headers=["*"],
)

# user_id -> {storageKey: serializedValue}
states: dict[str, dict[str, str]] = {}


@app.get("/state/{user_id}")
def pull_state(user_id: str) -> dict[str, str]:
    """Return the saved state for a user, or 404 if none exists yet.

    Aspen's pullPersistent() treats 404 as "no remote state" and resolves
    false instead of raising.
    """
    if user_id not in states:
        raise HTTPException(status_code=404, detail="No saved state")
    return states[user_id]


@app.put("/state/{user_id}")
def push_state(user_id: str, state: dict[str, str]) -> dict[str, str]:
    """Replace the saved state for a user with the pushed snapshot."""
    states[user_id] = state
    return state
