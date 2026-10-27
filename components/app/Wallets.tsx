"use client";

/**
 * Wallet connect through Family's ConnectKit: injected wallets (Robinhood Wallet, MetaMask, Rabby…), Coinbase Wallet
 * and WalletConnect (QR and mobile) behind one modal, dressed in the Kurage tokens. Mounted only in /app, so the
 * landing page never loads wagmi. The connected wallet only signs the sign-in message; it never sends a transaction.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import type { ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";

import { robinhood } from "@/lib/chain/robinhood-chain";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://usehoodiebot.com";

const config = createConfig(
  getDefaultConfig({
    chains: [robinhood],
    transports: { [robinhood.id]: http() },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
    appName: "HOODIEBOT",
    appDescription: "Your private trading team on Robinhood Chain",
    appUrl: SITE,
    appIcon: `${SITE}/apple-icon.png`,
    // ConnectKit's own "Continue with Aave" account sign-up: off, the team wallet is ours
    enableAaveAccount: false,
    ssr: true,
  }),
);
const queryClient = new QueryClient();

/** ConnectKit's theme variables, from the Kurage tokens (app/globals.css). */
const THEME = {
  "--ck-font-family": "var(--font-sans)",
  "--ck-border-radius": "18px",
  "--ck-overlay-background": "rgba(1, 2, 4, .66)",
  "--ck-overlay-backdrop-filter": "blur(4px)",
  "--ck-modal-box-shadow": "0 40px 120px -24px rgba(0, 0, 0, .9), inset 0 0 0 1px rgba(255, 255, 255, .14)",
  "--ck-body-background": "#090c12",
  "--ck-body-background-secondary": "#0e131c",
  "--ck-body-background-tertiary": "#151b26",
  "--ck-body-color": "#f1f4f8",
  "--ck-body-color-muted": "#9aa4b4",
  "--ck-body-color-muted-hover": "#c9d0db",
  "--ck-body-action-color": "#9aa4b4",
  "--ck-body-divider": "rgba(255, 255, 255, .09)",
  "--ck-body-color-danger": "#fca5a5",
  "--ck-body-color-valid": "#9fe8b5",
  "--ck-primary-button-background": "rgba(255, 255, 255, .04)",
  "--ck-primary-button-hover-background": "rgba(255, 255, 255, .08)",
  "--ck-primary-button-color": "#f1f4f8",
  "--ck-primary-button-border-radius": "14px",
  "--ck-primary-button-box-shadow": "inset 0 0 0 1px rgba(255, 255, 255, .09)",
  "--ck-primary-button-hover-box-shadow": "inset 0 0 0 1px rgba(124, 232, 242, .45)",
  "--ck-secondary-button-background": "#0e131c",
  "--ck-secondary-button-hover-background": "#151b26",
  "--ck-secondary-button-color": "#f1f4f8",
  "--ck-secondary-button-border-radius": "14px",
  "--ck-focus-color": "#8eeaf5",
  "--ck-spinner-color": "#7ce8f2",
  "--ck-qr-dot-color": "#f1f4f8",
  "--ck-qr-background": "#090c12",
  "--ck-qr-border-color": "rgba(255, 255, 255, .09)",
  "--ck-qr-border-radius": "14px",
  "--ck-tooltip-background": "#151b26",
  "--ck-tooltip-color": "#f1f4f8",
  "--ck-tooltip-border-radius": "10px",
  "--ck-dropdown-button-background": "#0e131c",
  "--ck-recent-badge-color": "#7ce8f2",
  "--ck-recent-badge-background": "rgba(124, 232, 242, .1)",
  "--ck-recent-badge-border-radius": "8px",
};

export function Wallets({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          customTheme={THEME}
          options={{ initialChainId: robinhood.id, enforceSupportedChains: false, hideNoWalletCTA: false, embedGoogleFonts: false, disclaimer: <>Signing in costs nothing and sends no transaction.</> }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
