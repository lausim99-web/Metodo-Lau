import React from "react";

const LOGO = "https://customer-assets-rejwkqb3.emergentagent.net/job_63076ffe-16be-493b-860d-ec786a6fd21a/artifacts/swqgbggz_IMG_2767.jpeg";

export default function Logo({ size = 44, className = "" }) {
  return (
    <div
      className={`lau-logo-crop ${className}`}
      style={{ width: size, height: size }}
      data-testid="lau-logo"
    >
      <img src={LOGO} alt="METODOLAU" />
    </div>
  );
}
