# types

Shared TypeScript type definitions — the contract between client and server.

**Convention: when adding a new feature, define types here first, then implement in server + client.**

## Key Files

- `Messages.ts` — Message enum (all client-server message types) and payload types
- `IOfficeState.ts` — Client-side interfaces for Colyseus server state (IPlayer, IMusicBooth, etc.)
- `Dtos.ts` — Wire format DTOs (JukeboxItemDto, etc.)
- `Players.ts` — Player-related types
- `Items.ts` — Item types
- `Rooms.ts` — Room types (IRoomData, RoomType, MusicMode)
- `AnimationCodec.ts` — Animation ID encoding/decoding, texture IDs
- `Mail.ts` — DM message types
- `WallPost.ts` — Wall post types
- `Backgrounds.ts` — Background types

## JS Companions

Some `.ts` files have `.js` counterparts (Messages.js, Dtos.js, Rooms.js, AnimationCodec.js) for use in non-TypeScript contexts (e.g., Nakama ES5 modules). Keep these in sync when modifying the TS versions.

## Package

Published as `@club-mutant/types`. Imported by client-3d, server, and other packages.
