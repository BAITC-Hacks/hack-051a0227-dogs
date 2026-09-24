/** Display-only data. Never include these fields in assessment or provider context. */
export type AvatarIdentity = {
  id?: string;
  avatarRevision?: number;
  avatarPhoto?: boolean;
  avatarCharacter?: string | null;
};
export const avatarSelect = {
  id: true,
  avatarRevision: true,
  avatarPhoto: true,
  avatarCharacter: true,
} as const;
export function avatarIdentity(u: AvatarIdentity): AvatarIdentity {
  return {
    id: u.id,
    avatarRevision: u.avatarRevision,
    avatarPhoto: u.avatarPhoto,
    avatarCharacter: u.avatarCharacter,
  };
}
export function avatarUrl(u: AvatarIdentity, large = false) {
  if (u.avatarPhoto && u.id)
    return `/api/avatars/${encodeURIComponent(u.id)}?v=${u.avatarRevision ?? 0}&size=${large ? "large" : "small"}`;
  if (u.avatarCharacter && /^(?:[1-9]|1[0-2])$/.test(u.avatarCharacter))
    return `/avatars/character-${u.avatarCharacter}.webp`;
  return "/avatars/neutral.svg";
}
