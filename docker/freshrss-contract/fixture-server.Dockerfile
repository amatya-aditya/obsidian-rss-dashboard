# Deterministic RSS/Atom fixture HTTP server for the FreshRSS Docker read
# contract. This container is contract-harness infrastructure, not the
# audited subject of the contract (that is the pinned freshrss/freshrss
# image referenced in docker-compose.yml) — it exists only to give the
# FreshRSS container something deterministic to subscribe to.
#
# Pinned by tag and digest for build reproducibility, resolved from the
# Docker Hub registry API on 2026-09-09 (see docs/development/freshrss-docker-contract.md).
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

WORKDIR /fixture-server
COPY fixtures ./fixtures
COPY fixture-server.mjs ./fixture-server.mjs

EXPOSE 8081
ENV PORT=8081
CMD ["node", "fixture-server.mjs"]
