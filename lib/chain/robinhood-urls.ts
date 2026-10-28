/** Explorer links, safe to import in the browser. */
export const EXPLORER = "https://robinhoodchain.blockscout.com";
/** A paper fill's id starts with "paper:": it never went on chain, so it has no explorer page. */
export const isPaper = (hash: string) => hash.startsWith("paper:");
export const txUrl = (hash: string) => (isPaper(hash) ? undefined : `${EXPLORER}/tx/${hash}`);
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;
