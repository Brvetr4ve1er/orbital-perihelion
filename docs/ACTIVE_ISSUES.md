# PKOS Active Issues & Fix Queue

> Priority: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## 🔴 P0 — Critical & Hardening (In Progress)

### [P0-4] ✅ RESOLVED — Runtime Schema Validation
**Fixed:** Implemented Zod schemas in `schema.ts` and integrated `safeParse` in `ProductAdapter.normalize()`.

### [P0-5] ✅ RESOLVED — Parser Verification Suite
**Fixed:** Created `src/core/verify-parser.ts` utility to test multi-dialect CSV parsing.

---

## 🟠 P1 — High Priority

### [P1-3] ✅ RESOLVED — Category Patterns (Small Appliances)
**Fixed:** Added 18+ new patterns in `enrichment.ts` covering kitchen and beauty appliances.

### [P1-4] ✅ RESOLVED — Brand detection priority
**Fixed:** Implemented source confidence tiers. Explicit CSV column gets 1.0 confidence.

### [P1-1] ✅ RESOLVED — Margin calculation
**Fixed:** `ProductAdapter.toLegacy()` computes margin directly from prices.

### [P1-2] ✅ RESOLVED — Stock status & quantity
**Fixed:** Stock read from observations, status normalized from CSV column.

---

## 🟡 P2 — Medium Priority

### [P2-5] ✅ RESOLVED — Search Performance for large catalogs
**Fixed:** Search index is now pre-computed using a centralized builder and stamped on the product object (`_searchIndex`) during import and after enrichment, eliminating per-keystroke string allocation.

### [P2-4] ✅ RESOLVED — Curated DB integration
**Fixed:** Loaded in `EnrichmentService.enrich()`. High-value products overriden with 1.0 confidence.

---

## 🟢 P3 — Low Priority / Polish

### [P3-3] ⬜ OPEN — Export CSV Dialect
**Issue:** `Parser.export()` uses `PKOSCsvParser` which might not be compatible with the user's original dialect.
**Idea:** Support "Export as Original" keeping the same headers and delimiter.
