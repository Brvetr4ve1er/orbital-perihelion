# Insights and Issues

Following the stabilization of the React/TS architecture, the focus shifts from architectural debt to performance scaling and intelligence accuracy.

## Current Intelligence Insights

### 1. The "Canonical Product Object" (CPO) Success
The move to a fact-level observation architecture has significantly hardened data integrity. By tracking multiple sources for the same field (e.g., `brand` from CSV vs `brand` from Regex), we can now compute a consensus score that alerts the user when data is "fuzzy" or contradictory.

### 2. Universal Parsing Robustness
The fuzzy header mapper in `UniversalCSVParser` has successfully handled every inventory sample provided to date (including those with mixed French/English headers). 

---

## Future Scaling Challenges

### 1. IndexedDB Performance at Scale
While IndexedDB is fast, a catalog exceeding 50,000 products with full enrichment metadata (observations, consensus logs) will eventually hit query latency issues.
- **Mitigation**: Implement a secondary search index (e.g., MiniSearch or FlexSearch) that lives in a separate Web Worker.

### 2. LLM Batch Enrichment Latency
The single-queue enrichment model (one product at a time) is safe for local LLMs (preventing VRAM overflow) but slow for massive imports.
- **Optimization**: Implement "Batch Tiers". High-value brands get priority LLM enrichment, while others use rule-based regex fallback until the system is idle.

### 3. Data Persistence Reliability
Currently, the system relies entirely on the browser's local storage/IndexedDB. 
- **Recommendation**: Add a "Cold Storage" export feature that dumps the entire CPO state into a compressed JSON file for backup and portability between machines.

### 4. LLM Extraction Accuracy
Small LLMs (4B-8B parameters) sometimes struggle with the strict JSON formatting required for specification extraction.
- **Refinement**: Implement a "Retry with System Correction" loop where validation errors are fed back to the LLM to self-correct the response.
