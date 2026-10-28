import type { NextConfig } from "next";

/**
 * Headers on every response: no framing (clickjacking on the trade and approval buttons), no MIME sniffing, no
 * referrer to other sites, no camera or microphone, HTTPS only. The CSP stays narrow to what framing needs: wallets
 * (ConnectKit, WalletConnect) load scripts and frames a full script policy would have to track release by release.
 */
const security = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: security }];
  },
};
export default config;
