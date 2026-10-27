/** Explorer links, safe to import in the browser. */
export const EXPLORER = "https://robinhoodchain.blockscout.com";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;
