# Loup-Garou Online — Stage 1 & 2 (Scaffold + Data Models)

Dark-fantasy real-time multiplayer Werewolf game.

## Stack
- **Server**: Node.js, Express, Socket.io, MongoDB (Mongoose), Passport (Google/Facebook/Apple OAuth + Guest JWT)
- **Client**: React (Vite), Tailwind CSS, Socket.io-client, i18next (EN/AR + RTL)

## Structure

```
loup-garou/
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js              # Mongo connection
│   │   │   └── passport.js        # OAuth strategies (Google/Facebook/Apple) + Guest JWT
│   │   ├── models/
│   │   │   ├── User.js            # profile, XP, rank, friends
│   │   │   ├── Room.js            # lobby state, role config
│   │   │   ├── Match.js           # completed game history
│   │   │   └── FriendRequest.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── user.routes.js
│   │   │   └── room.routes.js
│   │   ├── socket/                # (Stage 5 — payload filtering, chat channels)
│   │   ├── game/                  # (Stage 4 — engine, roles, auto-recommend)
│   │   ├── app.js
│   │   └── server.js
│   ├── package.json
│   └── .env.example
├── client/
│   ├── src/
│   │   ├── components/            # (Stage 6)
│   │   ├── pages/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── i18n/
│   │   └── assets/sounds/
│   ├── package.json
│   ├── tailwind.config.js
│   └── index.html
└── README.md
```

## This delivery covers
1. Runnable Express + Socket.io server skeleton with Mongo connection and health check.
2. Complete Mongoose models: **User**, **Room**, **Match**, **FriendRequest** — profile/XP/rank, room role-config, match history, friend invites.
3. **Full auth**: Google/Facebook/Apple OAuth via Passport + instant Guest login, JWT issuance/verification, `requireAuth` middleware.
4. **Profile & Friends API**: get/update profile, public profile lookup by `userId`, friend requests (send/respond), room-invite persistence.
5. **Game engine** (`server/src/game/`):
   - `roles.js` — registry of all 9 roles (Villageois, Loup-Garou, Loup-Garou Noir, Voyante, Sorcière, Chasseur, Cupidon, Petite Fille, Salvateur) with team + night order.
   - `autoRecommend.js` — Smart Auto-Recommend: computes a balanced role composition for any player count 4-20 (wolf ratio ~25%, power roles gated by lobby size), plus `validateRoleConfig` for host-edited setups.
   - `assignRoles.js` — shuffles and deals roles to seated players, rejecting unbalanced configs.
   - `winConditions.js` — evaluates villager/wolf/lovers/draw win states after every death.
   - `GameEngine.js` — the phase state machine (`night` → `day_discussion` → `day_vote` → `night`...) that resolves night actions in role order (Cupidon night 1 → Voyante → Salvateur → Wolves/Loup-Garou Noir infect-or-kill → Sorcière heal/poison), applies lynch votes, triggers the Chasseur's revenge shot on death, and produces a `Match.results`-ready snapshot. Verified end-to-end with a scripted night/day simulation across an 8-player game.
   - Exposed via `GET /api/rooms/auto-recommend?playerCount=N` and `POST /api/rooms/validate-role-config`.
6. **Room/lobby lifecycle API**: create room (host capacity 4-20), fetch by code, join, host-only manual role edit (`PATCH /:code/roles`), and revert-to-auto (`POST /:code/roles/auto`).
7. **Socket layer** (`server/src/socket/`):
   - `authMiddleware.js` — verifies the JWT on every socket connection (`socket.handshake.auth.token`), attaches `socket.user`; unauthenticated sockets are rejected before any handler runs.
   - `payloadFilter.js` — the single choke point for role privacy. A living player only ever sees their own role; wolves see their packmates' roles/team while alive; a dead player's role becomes public to everyone; spectators (dead players) see the full roster. Verified with a scripted test covering villager view, wolf-pack view, and post-death reveal.
   - `chatChannels.js` — day / wolf / dead channel membership, recomputed from live engine state (not trusted client state) on every phase change and death, plus `prepareChatMessage` which rejects any send to a channel the sender isn't currently allowed to speak in.
   - `sessionRegistry.js` — in-memory map of room code → live `GameEngine` + socket bindings (separate from the Mongo `Room` document, which remains the source of truth for lobby state).
   - `gameHandlers.js` — full event wiring: `lobby:join`, `game:start` (deals roles, starts night), `game:resume` (reconnect support), `game:nightAction` (auto-resolves the night once every active role has submitted), `game:startVote`/`game:vote`/`game:resolveLynch`, `game:chasseurShot`, `chat:send`. On win, persists a `Match` document, awards XP, and marks the `Room` finished.
8. Vite + React + Tailwind client scaffold with dark-fantasy theme tokens and i18n (EN/AR) wired.

## Auth flow summary
- `POST /api/auth/guest` — instant guest profile + JWT, no provider needed.
- `GET /api/auth/google`, `/api/auth/facebook`, `/api/auth/apple` — kick off OAuth; callbacks issue a JWT and redirect to `${CLIENT_URL}/auth/callback?token=...`.
- `GET /api/auth/me` — current user from JWT.
- All `/api/users/*` friend/profile endpoints require `Authorization: Bearer <token>`.

8. **Client UI** (`client/src/`) — full React app wired to the backend:
   - `context/AuthContext.jsx`, `context/SocketContext.jsx` — session + authenticated socket.io connection.
   - `hooks/useGameState.js` — subscribes to all game/chat socket events, exposes action dispatchers (night action, vote, lynch resolve, Chasseur shot, chat send).
   - `hooks/useSoundManager.js` — wolf howl (night), morning bell (day), timer tick (vote countdown), victory/defeat/lynch cues; silently no-ops if an asset file is missing (see `assets/sounds/README.md` for the manifest — audio files themselves are licensed assets not included here).
   - `components/DayNightBackdrop.jsx` — animated crossfade starfield/moon at night, sun at day.
   - `components/RoleCard.jsx`, `PlayerRoster.jsx`, `ChatPanel.jsx` — role reveal, alive/dead roster with role-filtered display (trusts only what the server sent), and the day/wolf/dead chat UI.
   - `pages/LoginPage.jsx` (OAuth buttons + guest), `AuthCallbackPage.jsx`, `LobbyPage.jsx` (host capacity, manual role +/- toggles, Smart Auto-Recommend badge/revert), `GamePage.jsx` (ties backdrop, roster, role card, chat, and sound cues to live game state).
   - Bilingual EN/AR via `i18n/`, toggled from both the login and home screens, flipping `dir` for RTL.

9. **Real-time friends & invites** (final stage):
   - `server/src/socket/friendHandlers.js` — online-presence map (userId → socket.id), live `friend:request` / `friend:respond` (persists to `FriendRequest`, pushes instantly to the recipient if online), and `invite:room` (persists a 10-minute-TTL `RoomInvite` and pushes a live join prompt).
   - `client/src/hooks/useFriends.js` + `components/FriendsPanel.jsx` — friends list, add-by-`userId`, incoming friend-request accept/decline, incoming room-invite join/dismiss.
   - `components/ProfileBadge.jsx` — UserID, level, XP, rank badge, shown on the home screen.
   - Wired into `HomePage` (friends list) and `LobbyPage` (invite-a-friend-to-this-room).

## Project status
All 7 stages described in this README are implemented and internally consistent — every server file passes `node --check`, the game engine and privacy/chat-filtering logic were exercised with scripted simulations (see stage 4/5 notes above), and every client file passes a structural balance check. That is **not** the same as a QA'd, production-verified app: nobody has run `npm install` against a live MongoDB instance, opened it in a browser, or exercised the OAuth redirect flows against real Google/Facebook/Apple credentials in this environment (no network access here). Treat this as a strong, working scaffold to `npm install`, connect to Mongo, add real OAuth credentials and sound assets to, and then test end-to-end — not as something to deploy sight-unseen.

## Setup
```bash
# server
cd server && cp .env.example .env && npm install && npm run dev

# client
cd client && npm install && npm run dev
```
