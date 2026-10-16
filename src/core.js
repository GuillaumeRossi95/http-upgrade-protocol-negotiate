/**
 * Core implementation for http-upgrade-protocol-negotiate.
 *
 * Parses an HTTP Upgrade request header and determines whether any of the
 * client's requested protocols intersect with the server's offered list.
 *
 * The Upgrade header grammar (RFC 7230 §6.7) is a comma-separated list of
 * protocol-name tokens, each optionally followed by a slash and version.
 * Example:  websocket, h2c, foo/1.0
 *
 * Per RFC 7230, tokens are case-insensitive and optional whitespace may
 * surround the commas.  A protocol identifier is the name before the slash;
 * the version after the slash is ignored for the purpose of matching the
 * protocol family.
 *
 * Design choices
 * --------------
 * - We intentionally ignore protocol versions.  If a server offers "h2c"
 *   it does not matter whether the client asked for "h2c" or "h2c/1.0";
 *   both match.  This keeps the API simple and matches the common server
 *   behaviour of advertising a protocol rather than a specific version.
 * - Case-insensitive comparison is mandatory because tokens are defined as
 *   case-insensitive by the HTTP grammar.
 * - The parser is defensive: malformed entries (empty tokens, stray slashes)
 *   are dropped rather than throwing.  A bad header should not crash the
 *   server's negotiation logic.
 * - We deliberately do not interpret HTTP/1.1, HTTP/2 etc. specially.
 *   The header is treated purely as a list of opaque protocol names.
 */

/**
 * Trim ASCII whitespace from both ends of a string.
 *
 * HTTP header whitespace is limited to SP and HTAB per RFC 7230 §3.2.3,
 * but in practice implementations also trim other ASCII whitespace.
 * We use a conservative trim that covers SP, HTAB, CR, LF and the usual
 * space-class characters.
 *
 * @param {string} value
 * @returns {string}
 */
function trim(value) {
  // Implement a manual trim so the behaviour is explicit and does not
  // depend on the host's definition of \s (which can include Unicode).
  let start = 0;
  let end = value.length;
  while (start < end && isWhitespace(value.charCodeAt(start))) {
    start += 1;
  }
  while (end > start && isWhitespace(value.charCodeAt(end - 1))) {
    end -= 1;
  }
  return value.slice(start, end);
}

/**
 * @param {number} code
 * @returns {boolean}
 */
function isWhitespace(code) {
  // SP(0x20), HTAB(0x09), CR(0x0D), LF(0x0A), FF(0x0C) cover the HTTP
  // whitespace set and the common ASCII whitespace characters.
  return (
    code === 0x20 ||
    code === 0x09 ||
    code === 0x0d ||
    code === 0x0a ||
    code === 0x0c
  );
}

/**
 * Parse an Upgrade header value into a list of requested protocol names.
 *
 * Only the protocol name (the token before any "/") is returned; versions
 * are discarded by design (see module docstring).  Duplicate names are
 * collapsed in first-seen order.  Malformed fragments are skipped.
 *
 * @param {string} headerValue - raw value of the Upgrade request header.
 * @returns {string[]} lower-cased protocol names, in first-seen order.
 */
export function parseUpgradeHeader(headerValue) {
  if (typeof headerValue !== "string" || headerValue.length === 0) {
    return [];
  }

  /** @type {string[]} */
  const protocols = [];
  /** @type {Set<string>} */
  const seen = new Set();

  // Split on commas; RFC 7230 allows optional surrounding whitespace.
  const fragments = headerValue.split(",");
  for (const fragment of fragments) {
    const token = trim(fragment);
    if (token.length === 0) {
      // Empty fragment (e.g. "a,,b") — skip.
      continue;
    }

    // A token may contain "/version".  Take the name before the first slash.
    // If the token starts with a slash it is malformed; skip it.
    const slashIndex = token.indexOf("/");
    let name;
    if (slashIndex === -1) {
      name = token;
    } else if (slashIndex === 0) {
      // Leading slash — malformed entry, skip.
      continue;
    } else {
      name = token.slice(0, slashIndex);
    }

    name = name.toLowerCase();
    if (name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);
    protocols.push(name);
  }

  return protocols;
}

/**
 * Normalise a list of server-offered protocols into lower-cased strings.
 *
 * Duplicates are removed in first-seen order so callers can pass arrays
 * built from configuration without worrying about duplication.
 *
 * @param {string[]} offered
 * @returns {string[]}
 */
function normaliseOffered(offered) {
  /** @type {string[]} */
  const result = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const raw of offered) {
    if (typeof raw !== "string") {
      continue;
    }
    const name = raw.toLowerCase();
    if (name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);
    result.push(name);
  }
  return result;
}

/**
 * Determine whether any requested protocol is among those the server offers.
 *
 * Returns the single negotiated protocol name (lower-cased) when there is
 * exactly one intersection in the order the client requested them, or
 * `null` when there is no intersection.
 *
 * Why first-match and not "best"?
 *  - The Upgrade header lists protocols in order of client preference
 *    (most preferred first), per RFC 7230 §6.7.  Selecting the first match
 *    honours that ordering without the library needing to know anything
 *    about the relative merits of individual protocols.
 *
 * @param {string} headerValue - raw Upgrade request header value.
 * @param {string[]} offered - protocols the server is willing to upgrade to.
 * @returns {string | null} the negotiated protocol name, or null.
 */
export function negotiateUpgrade(headerValue, offered) {
  const requested = parseUpgradeHeader(headerValue);
  const offeredSet = new Set(normaliseOffered(offered));

  for (const protocol of requested) {
    if (offeredSet.has(protocol)) {
      return protocol;
    }
  }
  return null;
}

/**
 * Select a protocol from a list of client-requested names against an
 * offered set, without re-parsing a header.
 *
 * This is provided for callers that have already split the Upgrade header
 * themselves (for example because they need the versions too).  The
 * selection rule is identical to {@link negotiateUpgrade}: the first
 * requested protocol that appears in the offered set wins.
 *
 * @param {string[]} requested - protocol names the client asked for.
 * @param {string[]} offered - protocol names the server offers.
 * @returns {string | null}
 */
export function selectUpgradeProtocol(requested, offered) {
  const offeredSet = new Set(normaliseOffered(offered));

  for (const raw of requested) {
    if (typeof raw !== "string") {
      continue;
    }
    const name = raw.toLowerCase();
    if (name.length === 0) {
      continue;
    }
    if (offeredSet.has(name)) {
      return name;
    }
  }
  return null;
}
