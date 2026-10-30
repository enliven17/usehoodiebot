"use client";

import { useModal } from "connectkit";
import { useEffect, useState } from "react";
import { erc20Abi, parseEther, parseUnits } from "viem";
import { useAccount, useSendTransaction, useSwitchChain, useWriteContract } from "wagmi";

import { robinhood } from "@/lib/chain/robinhood-chain";

import { api, type AccessInfo, type Coin, type Plan } from "./api";
import s from "./app.module.css";

const PENDING = "hoodie-payment";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Books a sent payment, asking again while the chain has not confirmed it yet (about two minutes at most). */
async function book(plan: string, hash: string, coin: Coin) {
  for (let i = 0; ; i++) {
    try {
      return await api.pay(plan, hash, coin);
    } catch (err) {
      if ((err as { status?: number }).status !== 409 || /already used/.test((err as Error).message) || i >= 40) throw err;
      await wait(3000);
    }
  }
}

/**
 * The plans and the pay button: ETH or $WIF from the wallet the owner signed in with, straight to Hoodie on Robinhood
 * Chain, then the server checks the transfer onchain and opens the plan. `wifOnly` is the waitlist's way past it: only
 * $WIF skips the line. A sent payment is kept in the browser until it is booked, so closing the tab mid-way loses nothing.
 */
export function Plans({ info, onPaid, wifOnly }: { info: AccessInfo; onPaid: () => void; wifOnly?: boolean }) {
  const year = info.plans.find((p) => p.id === "year");
  const [pick, setPick] = useState(year?.id ?? info.plans[0]?.id ?? "month");
  const [coin, setCoin] = useState<Coin>("wif");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isConnected, chainId } = useAccount();
  const { setOpen } = useModal();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const unit = (p: Plan, c: Coin) => (c === "wif" ? `${Number(p.wif).toLocaleString("en-US")} $WIF` : `${p.eth} ETH`);

  async function settle(plan: string, hash: string, paid: Coin) {
    setBusy("Confirming payment…");
    try {
      await book(plan, hash, paid);
      localStorage.removeItem(PENDING);
      onPaid();
    } catch (err) {
      // a payment the server turned down is dropped; one still unconfirmed is kept for the next visit
      if ((err as { status?: number }).status !== 409 || /already used/.test((err as Error).message)) localStorage.removeItem(PENDING);
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // a payment sent before a reload is picked up again
  useEffect(() => {
    try {
      const left = JSON.parse(localStorage.getItem(PENDING) ?? "null") as { plan: string; hash: string; coin?: Coin } | null;
      if (left) void settle(left.plan, left.hash, left.coin ?? "eth");
    } catch {
      /* nothing kept */
    }
  }, []);

  async function pay() {
    const plan = info.plans.find((p) => p.id === pick);
    if (!plan) return;
    setError(null);
    if (!isConnected) return setOpen(true);
    try {
      setBusy("Confirm in your wallet…");
      if (chainId !== robinhood.id) await switchChainAsync({ chainId: robinhood.id });
      const to = info.payTo as `0x${string}`;
      const hash =
        coin === "wif"
          ? await writeContractAsync({ chainId: robinhood.id, address: info.wif as `0x${string}`, abi: erc20Abi, functionName: "transfer", args: [to, parseUnits(plan.wif, 18)] })
          : await sendTransactionAsync({ chainId: robinhood.id, to, value: parseEther(plan.eth) });
      try {
        localStorage.setItem(PENDING, JSON.stringify({ plan: plan.id, hash, coin }));
      } catch {
        /* private mode */
      }
      await settle(plan.id, hash, coin);
    } catch (err) {
      const m = (err as { shortMessage?: string; message: string }).shortMessage ?? (err as Error).message;
      setError(/reject|denied/i.test(m) ? "Payment cancelled." : m);
      setBusy(null);
    }
  }

  const month = info.plans.find((p) => p.id === "month");
  const save = month && year ? Math.round((1 - Number(year[coin]) / (Number(month[coin]) * 12)) * 100) : 0;
  const picked = info.plans.find((p) => p.id === pick);
  return (
    <div className={s.plans}>
      {wifOnly ? null : (
        <div className={s.coins} role="radiogroup" aria-label="Pay with">
          {(["wif", "eth"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={coin === c} className={s.option} disabled={!!busy} onClick={() => setCoin(c)}>
              {c === "wif" ? "$WIF · costs less" : "ETH"}
            </button>
          ))}
        </div>
      )}
      <div className={s.options} role="radiogroup" aria-label="Plan">
        {info.plans.map((p: Plan) => (
          <button key={p.id} type="button" role="radio" aria-checked={pick === p.id} className={s.option} disabled={!!busy} onClick={() => setPick(p.id)}>
            <span className={s.planName}>
              {p.name}
              {p.id === "year" && save > 0 ? <span className="faint"> · save {save}%</span> : null}
            </span>
            <span className="num">{unit(p, wifOnly ? "wif" : coin)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary" onClick={pay} disabled={!!busy}>
        {busy ?? (isConnected ? (picked ? `Pay ${unit(picked, coin)}` : "Pay") : "Connect wallet to pay")}
      </button>
      <p className={s.error} role="alert">{error}</p>
      {info.plan ? <p className="faint">Your plan runs until {until(info.plan.until)}. Paying again adds to it.</p> : null}
    </div>
  );
}

/** The plan row in the wallet panel: when it ends, and a way to extend it. */
export function PlanBlock({ info, onPaid }: { info: AccessInfo; onPaid: () => void }) {
  const [open, setOpen] = useState(false);
  if (!info.plan && info.admin) return null;
  const name = info.plans.find((p) => p.id === info.plan?.plan)?.name ?? "Plan";
  return (
    <section className={s.block} aria-labelledby="plan-h">
      <h2 id="plan-h" className={s.blockTitle}>Plan</h2>
      <div className={s.modeRow}>
        <span>
          <strong>{info.plan ? name : "No plan"}</strong>
          <span className="faint">{info.plan ? `Until ${until(info.plan.until)}` : "Admin access"}</span>
        </span>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Extend"}</button>
      </div>
      {open ? <Plans info={info} onPaid={() => (setOpen(false), onPaid())} /> : null}
    </section>
  );
}
