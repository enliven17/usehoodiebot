/** The exact text the owner signs; shared by the browser and the server check. */
export const signInMessage = (address: string, nonce: string) =>
  `Sign in to Hoodie\n\nThis only proves you own this wallet. It costs nothing and sends no transaction.\n\nAddress: ${address}\nNonce: ${nonce}`;
