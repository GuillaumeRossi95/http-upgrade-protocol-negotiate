/**
 * Public entry point for http-upgrade-protocol-negotiate.
 *
 * Re-exports the negotiation logic from ./core so consumers can import a
 * single module without reaching into internals.
 */
export { negotiateUpgrade, parseUpgradeHeader, selectUpgradeProtocol } from "./core.js";
