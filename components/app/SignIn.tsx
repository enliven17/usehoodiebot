"use client";

import { useModal } from "connectkit";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";

import { Hoodie, type Mood } from "@/components/Hoodie";
import { signInMessage } from "@/lib/sign-in-message";

import { api } from "./api";
import s from "./app.module.css";

type Step = "connect" | "sign" | "team";
const STEPS: Array<[Step, string]> = [["connect", "Connect a wallet"], ["sign", "Sign in, free"], ["team", "Meet your team"]];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Connect with ConnectKit, then one free signature proves the wallet; the server answers with the team, creating its
 * trading wallet on the first visit. The steps show where the owner is and what the wallet will ask for.
 */
export function SignIn({ onDone }: { onDone: () => void }) {
  const { setOpen } = useModal();
  const { address, connector, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState<Step>("connect");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wanted = useRef(false);

  async function signIn(addr: string) {
    setError(null);
    setBusy(true);
    setStep("sign");
    try {
      const owner = getAddress(addr);
      const { nonce } = await api.nonce();
      const signature = await signMessageAsync({ account: owner, message: signInMessage(owner, nonce) });
      await api.verify(owner, signature);
      setStep("team");
      await api.createTeam();
      onDone();
    } catch (err) {
      const e = err as { name?: string; shortMessage?: string; message?: string };
      setError(e.name === "UserRejectedRequestError" || /reject|denied|cancel/i.test(e.message ?? "") ? "Signature cancelled. Nothing was sent." : (e.shortMessage ?? e.message ?? "Sign-in failed."));
      setStep(isConnected ? "sign" : "connect");
    } finally {
      setBusy(false);
    }
  }

  // Once the modal hands back an account the owner asked for, go straight to the signature.
  useEffect(() => {
    if (address && wanted.current && !busy) {
      wanted.current = false;
      void signIn(address);
    }
    if (address && step === "connect") setStep("sign");
    if (!address && step === "sign") setStep("connect");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const mood: Mood = busy ? (step === "team" ? "working" : "listening") : error ? "sad" : address ? "happy" : "idle";
  const at = STEPS.findIndex(([k]) => k === step);

  return (
    <div className={s.signin}>
      <Hoodie size={140} mood={mood} />
      <h1 className={s.signinTitle}>Meet your team</h1>
      <p className={s.signinText}>Your team gets its own trading wallet on Robinhood Chain. It only ever pays out to the wallet you sign in with.</p>

      <ol className={s.steps} aria-label="Sign-in steps">
        {STEPS.map(([k, label], i) => (
          <li key={k} data-state={i < at ? "done" : i === at ? "now" : "next"} aria-current={i === at ? "step" : undefined}>
            <span className={s.stepNum}>{i < at ? <svg className="i i-sm" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={address ? "connected" : "disconnected"} className={s.signinActions} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {address ? (
            <>
              <div className={s.walletChip}>
                {connector?.icon ? <img src={connector.icon} alt="" width={22} height={22} /> : <span className={s.walletDot} aria-hidden />}
                <span>{connector?.name ?? "Wallet"}</span>
                <span className="num faint">{short(address)}</span>
              </div>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => signIn(address)} disabled={busy}>
                {busy ? (step === "team" ? "Setting up your team…" : "Check your wallet…") : "Sign in"}
              </button>
              <button type="button" className={s.linkish} onClick={() => disconnect()} disabled={busy}>Use another wallet</button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                wanted.current = true;
                setError(null);
                setOpen(true);
              }}
            >
              Connect wallet
            </button>
          )}
        </motion.div>
      </AnimatePresence>
      <p className={s.error} role="alert">{error}</p>
    </div>
  );
}
