"use client";

import { useState } from "react";

import { Hoodie } from "@/components/Hoodie";
import { signInMessage } from "@/lib/sign-in-message";

import { api } from "./api";
import s from "./app.module.css";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

/** Sign in with any injected EVM wallet (Robinhood Wallet, MetaMask, Rabby…): one free signature, no transaction. */
export function SignIn({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setError(null);
    const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (!eth) return setError("No wallet found in this browser. Open this page in Robinhood Wallet or a browser with MetaMask.");
    setBusy(true);
    try {
      const [address] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (!address) throw new Error("No account selected.");
      const { nonce } = await api.nonce();
      const { getAddress } = await import("viem");
      const checksummed = getAddress(address);
      const signature = (await eth.request({ method: "personal_sign", params: [signInMessage(checksummed, nonce), address] })) as string;
      await api.verify(checksummed, signature);
      await api.createTeam();
      onDone();
    } catch (err) {
      const e = err as { code?: number; message?: string };
      setError(e.code === 4001 ? "Signature cancelled." : (e.message ?? "Sign-in failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.signin}>
      <Hoodie size={140} mood={busy ? "thinking" : "idle"} />
      <h1 className={s.signinTitle}>Meet your team</h1>
      <p className={s.signinText}>Sign in with your wallet. It proves you own it and costs nothing. Your team gets its own trading wallet on Robinhood Chain that only pays out to you.</p>
      <button type="button" className="btn btn-primary btn-lg" onClick={go} disabled={busy}>
        {busy ? "Waiting for your wallet…" : "Sign in with wallet"}
      </button>
      <p className={s.error} role="alert">{error}</p>
    </div>
  );
}
