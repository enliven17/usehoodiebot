import "server-only";

import { getAddress, isAddress, type Address } from "viem";

import { MAX_FEE_WEI } from "../chain/policy";

/**
 * Hoodie's commission: FEE_BPS of the ETH in every buy and every sell (default 0.5%), sent to FEE_WALLET (default the
 * admin wallet) right after the fill, as its own transfer. The wallet policy lets a transfer to FEE_WALLET carry at most
 * MAX_FEE_WEI, so one fee never exceeds that. A transfer that fails is booked as owed and the minute tick collects it.
 */
export const FEE_BPS = BigInt(Math.max(0, Math.min(200, Number(process.env.FEE_BPS ?? 50) || 0)));
const wallet = process.env.FEE_WALLET ?? "0xcc78505FE8707a1D85229BA0E7177aE26cE0f17D";
export const FEE_WALLET: Address = isAddress(wallet) ? getAddress(wallet) : getAddress("0xcc78505FE8707a1D85229BA0E7177aE26cE0f17D");

/** The fee on `wei` of ETH traded, capped at what the policy lets one transfer carry. */
export const feeOf = (wei: bigint) => {
  const fee = (wei * FEE_BPS) / 10_000n;
  return fee > MAX_FEE_WEI ? MAX_FEE_WEI : fee;
};

/** What a buy of `wei` actually swaps once the fee is set aside. */
export const afterFee = (wei: bigint) => wei - feeOf(wei);
