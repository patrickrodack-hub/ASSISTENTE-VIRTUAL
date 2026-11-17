# Security Specification — RODACK SISTEMA DE IA (Firestore Zero-Trust ABAC)

## 1. Data Invariants & Relationship Mapping
- **Master Source of Truth**:
  - `/users/{userId}`: A user profile document where `userId == request.auth.uid` and `incoming().ownerUid == request.auth.uid`.
  - `/users/{userId}/private/{infoId}`: Split-collection PII storage (`email`) belonging strictly to parent `/users/{userId}`. Requires parent `/users/{userId}` to exist (`exists(...)`) and `get(...).data.ownerUid == request.auth.uid`.
  - `/system_records/{recordId}`: Operational records (synced users, memories, tasks, agenda, routines, alerts, conversations, dossier) owned by `ownerUid == request.auth.uid` and requiring an existing parent user profile at `/users/$(request.auth.uid)`.
- **Bootstrapped Sovereign Admin**:
  - Creator email `patrickrodack@gmail.com` with `request.auth.token.email_verified == true` or document existence in `/admins/$(request.auth.uid)`.
- **Terminal State Lock**:
  - When a `SystemRecord` reaches `status == 'arquivado'`, non-admin users cannot mutate it further.
- **Temporal & Identity Immutability**:
  - `createdAt == request.time` on `create`; `updatedAt == request.time` on `create` and `update`.
  - `id`, `ownerUid`, and `createdAt` are strictly immutable on `update`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing (`ownerUid` mismatch)**: Creating `/users/uid_1` with `ownerUid: "uid_2"`. -> `PERMISSION_DENIED`.
2. **Self-Assigned Sovereign Creator Privilege**: Non-admin user creating `/users/uid_2` with `isCreator: true`. -> `PERMISSION_DENIED`.
3. **Shadow Field Injection (Ghost Key)**: Updating `/users/uid_1` with an extra key `isAdmin: true`. -> `PERMISSION_DENIED`.
4. **Unverified Email Spoofing**: Token has `email: "patrickrodack@gmail.com"` but `email_verified: false`. -> `PERMISSION_DENIED`.
5. **PII Blanket Read Leak**: User `uid_2` attempting `get` on `/users/uid_1/private/contact`. -> `PERMISSION_DENIED`.
6. **Orphaned Subcollection Write**: Creating `/users/uid_1/private/contact` when `/users/uid_1` does not exist. -> `PERMISSION_DENIED`.
7. **ID Poisoning Attack**: Document ID containing invalid characters or exceeding 128 chars. -> `PERMISSION_DENIED`.
8. **Value Poisoning (Oversized String)**: Setting `summary` to a 10,000-character string (`> 4000`). -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Providing a past or future `createdAt` instead of `request.time`. -> `PERMISSION_DENIED`.
10. **Immortal Field Mutation**: Attempting to change `createdAt` or `ownerUid` during `update`. -> `PERMISSION_DENIED`.
11. **Terminal State Bypass**: Attempting to update a `SystemRecord` whose `existing().status == 'arquivado'` as a regular user. -> `PERMISSION_DENIED`.
12. **Unfiltered List Query Scraping**: Executing `list` on `/system_records` without filtering by `resource.data.ownerUid == request.auth.uid`. -> `PERMISSION_DENIED`.
