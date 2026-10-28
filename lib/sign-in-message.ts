/**
 * The exact text the owner signs, in the Sign-In with Ethereum format (EIP-4361), shared by the browser and the server
 * check. The domain and URI are the site the owner is on, so a wallet can warn when another site asks them to sign
 * for this one; the server rebuilds the message from the request's own host, so a signature made elsewhere fails.
 */
export const SIGN_IN_TTL_MS = 10 * 60_000;
export const CHAIN_ID = 4663;

export type SignIn = { domain: string; uri: string; address: string; nonce: string; issuedAt: string };

export const signInMessage = (s: SignIn) =>
  [
    `${s.domain} wants you to sign in with your Ethereum account:`,
    s.address,
    "",
    "Sign in to Hoodie. This only proves you own this wallet. It costs nothing and sends no transaction.",
    "",
    `URI: ${s.uri}`,
    "Version: 1",
    `Chain ID: ${CHAIN_ID}`,
    `Nonce: ${s.nonce}`,
    `Issued At: ${s.issuedAt}`,
    `Expiration Time: ${new Date(Date.parse(s.issuedAt) + SIGN_IN_TTL_MS).toISOString()}`,
  ].join("\n");
