# KareFetih Firestore Security Specification

## 1. Data Invariants
1. **Default-Deny**: Every path not explicitly matched is denied (`allow read, write: if false;`).
2. **Verified Owner Isolation**: Only authenticated users with `email_verified == true` may read or write their own `/profiles/{profileId}` and `/savedMatches/{matchId}` documents where `ownerId == request.auth.uid`.
3. **Strict Key & Size Enforcement**: All incoming documents are validated for exact required keys (`hasAll` and `hasOnly`), bounded string lengths, regex-validated IDs (`^[a-zA-Z0-9_\-]+$`), integer ranges, and server timestamps (`request.time`).
4. **Immutable Ownership & Creation Time**: `ownerId`, `profileId`/`matchId`, and `createdAt` cannot be modified during `update`.
5. **Terminal Match State Locking**: Once a `SavedMatch` has `existing().status == 'completed'`, no further updates are permitted.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` attempting `create` on `/profiles/p1` -> `PERMISSION_DENIED`
2. **Unverified Email Spoof**: `auth.token.email_verified = false` attempting `create` on `/profiles/p1` -> `PERMISSION_DENIED`
3. **Cross-User Owner Spoof**: `auth.uid = 'u1'` writing `ownerId: 'u2'` -> `PERMISSION_DENIED`
4. **Ghost Field Injection (Shadow Update)**: Adding `isAdmin: true` to `/profiles/p1` -> `PERMISSION_DENIED`
5. **Oversized String DoS**: `name` with 500 characters (`> 40`) -> `PERMISSION_DENIED`
6. **ID Poisoning**: `profileId` containing spaces or special characters (`bad/id!`) -> `PERMISSION_DENIED`
7. **Timestamp Forgery**: Client-supplied `createdAt` not matching `request.time` -> `PERMISSION_DENIED`
8. **Immutable Field Mutation**: Changing `ownerId` or `createdAt` on `update` -> `PERMISSION_DENIED`
9. **Terminal State Bypass**: Updating a `/savedMatches/{matchId}` document whose `existing().status == 'completed'` -> `PERMISSION_DENIED`
10. **Negative Statistics Injection**: Setting `wins: -5` or `boardSize: 999` -> `PERMISSION_DENIED`
11. **Blanket List Scraping**: Listing `/profiles` without filtering `resource.data.ownerId == request.auth.uid` -> `PERMISSION_DENIED`
12. **Non-Owner Get**: Reading `/savedMatches/m1` belonging to another `ownerId` -> `PERMISSION_DENIED`
