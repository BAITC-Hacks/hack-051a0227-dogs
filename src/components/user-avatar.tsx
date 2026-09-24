"use client";
import { useState } from "react";
import { avatarUrl, type AvatarIdentity } from "@/lib/avatar";
export function UserAvatar({
  user = {},
  size = 40,
  name,
  className = "",
}: {
  user?: AvatarIdentity;
  size?: number;
  name?: string;
  className?: string;
}) {
  const src = avatarUrl(user, size > 96);
  const [failed, setFailed] = useState("");
  // Authenticated image route must receive the viewer's cookie; no public image proxy.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`person-avatar ${className}`}
      src={failed === src ? "/avatars/neutral.svg" : src}
      width={size}
      height={size}
      alt={name ? `Аватар: ${name}` : ""}
      onError={() => setFailed(src)}
    />
  );
}
export function VisionMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="vision-mark"
      src="/avatars/vision.svg"
      width={size}
      height={size}
      alt=""
    />
  );
}
