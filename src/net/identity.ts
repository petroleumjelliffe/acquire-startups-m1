import { createIdentityStore } from '../lobby/identity';
export type { RoomIdentity } from '../lobby/identity';

/** This game's identity store. The appId is the localStorage namespace —
 * changing it logs every player out of every room. */
const store = createIdentityStore('acquire');
export const { loadIdentity, saveIdentity, clearIdentity, rememberedName, rememberName } = store;
export const acquireIdentity = store;
