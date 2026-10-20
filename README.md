# http-upgrade-protocol-negotiate

Parses the HTTP Upgrade request header and determines whether any of the
client's requested protocols are present in the server's offered list.

```js
import { negotiateUpgrade, parseUpgradeHeader, selectUpgradeProtocol } from "http-upgrade-protocol-negotiate";

// Returns "websocket" (the first requested protocol the server offers).
negotiateUpgrade("websocket, h2c/1.0", ["h2c", "websocket"]);

// Returns ["websocket", "h2c"] — versions after a slash are discarded.
parseUpgradeHeader("WebSocket, h2c/1.0");

// For callers that split the header themselves.
selectUpgradeProtocol(["websocket", "h2c"], ["h2c"]);
```

## Why this exists

Negotiating an HTTP Upgrade involves a small amount of grammar and a
comparison rule.  Doing it inline tends to produce the same bugs:
case-sensitive matches, ignored whitespace around commas, and crashes on
malformed fragments.  This library isolates that logic so servers and
proxies can call a single function instead of re-implementing RFC 7230
§6.7 each time.

The deliberate trade-off is that protocol versions are ignored.  A request
for `h2c/1.0` matches an offer of `h2c`.  This matches the behaviour of
most real servers, which advertise a protocol family rather than a
specific version, and keeps the API to a single return value.

## Awkward edge

The Upgrade header is a comma-separated list with optional whitespace
around each item and an optional `/version` suffix on each token.  Empty
fragments (from double commas) and leading-slash fragments (malformed)
are silently skipped rather than raising; a bad header should not break
negotiation.  If you need strict validation that rejects malformed
headers, this library is not it.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

