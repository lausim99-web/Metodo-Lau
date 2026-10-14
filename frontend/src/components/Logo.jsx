import React from "react";

// Emblema (vichingo) con sfondo trasparente — generato da /logo-full.png
export default function Logo({ size = 44, className = "" }) {
  return (
    <img src="/logo-emblem.png" alt="METODOLAU" width={size} height={size} data-testid="lau-logo"
         className={`object-contain drop-shadow-[0_2px_8px_rgba(245,197,24,0.35)] ${className}`}
         style={{ width: size, height: size }} />
  );
}
