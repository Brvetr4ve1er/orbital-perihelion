# Final Adaptive Product Schema (CPO v4.2)
## Unified Business Intelligence & Inventory Backbone

This document defines the final, adaptive schema used across every product in the Orbital Perihelion (PKOS) inventory. It is designed to handle everything from a "thin" CSV row to a "thick" AI-enriched profile containing deep scraped business intelligence.

---

## 1. Core Structural Logic
The schema uses a **Fact-Level Architecture**. Every critical field (Price, Stock, Brand) is stored as a series of **Observations** from different sources, which are then resolved into a **Consensus** view.

| Layer | Purpose | Example |
| :--- | :--- | :--- |
| **Identity** | Universal product keys | SKU, MPN, Brand, Category |
| **Commercial** | Live inventory state | Stock levels, Purchase price, Retail price |
| **Enrichment** | Deep scraped data | Competitor prices, Sentiment, Marketing hooks |
| **Technical** | Feature data | Adaptive Specs (different for TVs vs Laptops) |
| **Observations** | Raw data history | "Source: CSV says 45k, Source: Web says 42k" |
| **Consensus** | The "Winner" | The final price displayed on the dashboard |

---

## 2. Detailed Variable Breakdown

### A. Business Intelligence & Scraping (`enrichment`)
This section contains all variables retrieved via the local scraping engine and LLM analysis.

*   **`competitorPrices`**: Array of objects containing:
    *   `source`: The name of the scraped retailer (e.g., "Ouedkniss", "Jumia").
    *   `url`: The direct link to the product on that site.
    *   `price`: The numerical price found.
    *   `currency`: Currency of the price (default: DZD).
    *   `availability`: Stock status on the competitor's site.
    *   `lastChecked`: ISO timestamp of the scrape.
*   **`sources`**: Deep links to the product's digital footprint.
    *   `type`: Categorized as `retailer`, `review`, `forum`, `official`, or `news`.
    *   `domain`: The root domain (e.g., "techradar.com").
    *   `snippet`: A brief text context from the site.
*   **`metrics`**: Quantitative intelligence.
    *   **Sentiment**: 
        *   `score`: 0-100 (Overall favorability).
        *   `label`: "Positive", "Mixed", "Negative".
        *   `highlights`: Key phrases from reviews (e.g., "Amazing battery life").
    *   **Reviews**:
        *   `rating`: Global average star rating.
        *   `count`: Total number of reviews found across all sites.
        *   `distribution`: Breakdown of star counts (1-star to 5-star).
    *   **Market Dynamics**:
        *   `meanPrice`: The average market price for this SKU.
        *   `demandLevel`: "Low", "Medium", "High", or "Viral".

### B. Adaptive Specs & Intelligence
*   **`specs`**: A dynamic key-value store. For a **Smartphone**, it contains `RAM`, `Storage`, `CPU`. For a **Refrigerator**, it contains `Volume`, `Energy Class`, `Cooling Type`.
*   **`intelligence`**: Qualitative AI deductions.
    *   `pros` / `cons`: Bullet points for quick decision making.
    *   `buyerFit`: A narrative description of who should buy this (e.g., "Professional photographers").
    *   `pricePosition`: "Budget", "Midrange", or "Premium".
    *   `marketVerdict`: A summary of whether the product is currently a "Good Buy" vs its competitors.
    *   `sellingAngles`: Specific persuasive angles for sales agents.

### C. Media & Marketing (`visual`, `enrichment.images`, `enrichment.videos`)
*   **`images`**: Array of URLs to scraped hero images and gallery assets.
*   **`videos`**: Array of objects:
    *   `url`: Link to the video (YouTube, Vimeo, etc.).
    *   `platform`: Name of the platform.
    *   `thumbnail`: Preview image for the video.
*   **`marketing`**:
    *   `hooks`: Short, catchy phrases for social media ads.
    *   `benefits_dz`: Specific benefits localized for the Algerian market.

---

## 3. Data Integrity & Search
*   **`_meta`**: Tracks the `schemaVersion`, `createdBy` (Import vs AI), and a `score` (0-1) representing how "complete" the data is.
*   **`_searchIndex`**: A pre-flattened string of all variables used for sub-millisecond searching in the UI.
*   **`_analytics`**: Tracks internal metrics like `viewCount` and `relevanceScore` based on user interactions.

---

## 4. Why this is "Adaptive"
Unlike a rigid database table, this schema:
1.  **Grows with Data**: A product can exist with just a `name` and `price`. As you run the "Agentic Scan", the object automatically populates the `enrichment`, `metrics`, and `knowledge` blocks.
2.  **Self-Correcting**: If a scraper finds a new price, it adds a new **Observation**. The **Consensus** algorithm then determines if the new price is trustworthy enough to update the `max` retail price.
3.  **UI Agnostic**: The frontend reads the `featureScore` and `sentiment.label` to color-code product cards automatically, making intelligence visible at a glance.
