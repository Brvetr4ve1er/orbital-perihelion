/**
 * Enrichment Queue Service — [PH4-A]
 * 
 * Sequential job queue for batch AI enrichment of all products.
 * Pattern: BullMQ/Celery serial job queue adapted for the browser.
 * 
 * - Processes one product at a time (prevents LLM rate-limiting)
 * - Emits progress events subscribable by any UI component
 * - Writes each result immediately to the store as it completes
 * - Supports pause, resume, and cancel
 */
import { LLMService } from './llm';
import { inventoryStore } from '../state/store';
import { buildSearchIndex } from '../core/search-index';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface EnrichmentJob {
    productId: string;
    productName: string;
    status: JobStatus;
    error?: string;
}

export interface QueueState {
    jobs: EnrichmentJob[];
    isRunning: boolean;
    isPaused: boolean;
    completedCount: number;
    failedCount: number;
    startedAt: number | null;
    lastProcessedMs: number | null; // rolling avg for ETA
}

type QueueListener = (state: QueueState) => void;

class EnrichmentQueueService {
    private state: QueueState = {
        jobs: [],
        isRunning: false,
        isPaused: false,
        completedCount: 0,
        failedCount: 0,
        startedAt: null,
        lastProcessedMs: null,
    };

    private listeners: Set<QueueListener> = new Set();
    private abortController: AbortController | null = null;

    // ── Subscription ──────────────────────────────────────────
    subscribe(listener: QueueListener) {
        this.listeners.add(listener);
        // Immediately emit current state so the UI doesn't need to call getState()
        listener(this.state);
        return () => this.listeners.delete(listener);
    }

    getState(): QueueState {
        return this.state;
    }

    private notify() {
        this.listeners.forEach(l => l(this.state));
    }

    private setState(patch: Partial<QueueState>) {
        this.state = { ...this.state, ...patch };
        this.notify();
    }

    // ── Queue Control ──────────────────────────────────────────

    /**
     * Loads all products from the store into the queue.
     * Skips products that already have LLM-enriched competitor prices.
     */
    enqueueAll() {
        const { products } = inventoryStore.getState();
        const jobs: EnrichmentJob[] = products.map(p => ({
            productId: p.identity.id,
            productName: p.identity.name,
            // Skip products already enriched with real competitor prices
            status: (p.enrichment?.competitorPrices && p.enrichment.competitorPrices.length > 0)
                ? 'skipped'
                : 'pending',
        }));
        this.setState({
            jobs,
            completedCount: jobs.filter(j => j.status === 'skipped').length,
            failedCount: 0,
            isRunning: false,
            isPaused: false,
        });
    }

    /** Start processing the queue from the first pending job. */
    async start() {
        if (this.state.isRunning) return;
        this.abortController = new AbortController();
        this.setState({ isRunning: true, isPaused: false, startedAt: Date.now() });
        await this._processNext(this.abortController.signal);
    }

    /** Pause after the current job finishes. */
    pause() {
        this.setState({ isPaused: true });
    }

    /** Resume from where we left off. */
    async resume() {
        if (!this.state.isRunning || !this.state.isPaused) return;
        this.setState({ isPaused: false });
        await this._processNext(this.abortController!.signal);
    }

    /** Stop the queue entirely and reset. */
    cancel() {
        this.abortController?.abort();
        this.setState({
            isRunning: false,
            isPaused: false,
            jobs: this.state.jobs.map(j =>
                j.status === 'running' ? { ...j, status: 'pending' } : j
            ),
        });
    }

    /** Clear the queue completely. */
    reset() {
        this.abortController?.abort();
        this.setState({
            jobs: [],
            isRunning: false,
            isPaused: false,
            completedCount: 0,
            failedCount: 0,
            startedAt: null,
            lastProcessedMs: null,
        });
    }

    // ── Internal Processing Loop ───────────────────────────────

    private async _processNext(signal: AbortSignal) {
        if (signal.aborted || this.state.isPaused) {
            this.setState({ isRunning: false });
            return;
        }

        const nextIndex = this.state.jobs.findIndex(j => j.status === 'pending');
        if (nextIndex === -1) {
            // Queue exhausted
            this.setState({ isRunning: false });
            return;
        }

        // Mark job as running
        const jobs = [...this.state.jobs];
        jobs[nextIndex] = { ...jobs[nextIndex], status: 'running' };
        this.setState({ jobs });

        const job = jobs[nextIndex];
        const product = inventoryStore.getState().products.find(
            p => p.identity.id === job.productId
        );

        if (!product) {
            jobs[nextIndex] = { ...jobs[nextIndex], status: 'failed', error: 'Product not found in store' };
            this.setState({ jobs, failedCount: this.state.failedCount + 1 });
            return this._processNext(signal);
        }

        const t0 = Date.now();
        try {
            const result = await LLMService.enrichProduct(product);

            // Merge LLM result into the product object
            const updated = { ...product };
            updated.knowledge = updated.knowledge || {};
            updated.knowledge.insights = result.ai_insights || {};
            updated.enrichment = updated.enrichment || {};
            if (result.competitorPrices) updated.enrichment.competitorPrices = result.competitorPrices;
            if (result.description) updated.enrichment.seoDescription = result.description;
            if (result.images && result.images.length) {
                const existing = updated.enrichment.images || [];
                updated.enrichment.images = [...new Set([...existing, ...result.images])].slice(0, 12);
            }
            if (result._sourceLinks && result._sourceLinks.length) {
                updated.enrichment.sources = result._sourceLinks.slice(0, 10);
            }
            if (result.specs) {
                updated.consensus = updated.consensus || {};
                Object.entries(result.specs).forEach(([k, v]) => {
                    updated.consensus![k] = { v, c: 0.9, flag: 'llm_verified' };
                });
            }

            // Rebuild search index with enrichment data included
            updated._searchIndex = buildSearchIndex(updated);

            // Write back to store (which also persists to IDB via Persistence.updateOne)
            inventoryStore.updateProduct(updated);

            const elapsed = Date.now() - t0;
            jobs[nextIndex] = { ...jobs[nextIndex], status: 'done' };
            this.setState({
                jobs,
                completedCount: this.state.completedCount + 1,
                lastProcessedMs: elapsed,
            });
        } catch (err: any) {
            if (signal.aborted) return;
            jobs[nextIndex] = { ...jobs[nextIndex], status: 'failed', error: err.message };
            this.setState({ jobs, failedCount: this.state.failedCount + 1 });
        }

        // Small delay between jobs to avoid hammering the LLM
        await new Promise(r => setTimeout(r, 300));

        return this._processNext(signal);
    }

    // ── Computed Helpers ───────────────────────────────────────

    /** Estimated seconds remaining based on rolling average. */
    getETA(): number | null {
        const { jobs, lastProcessedMs } = this.state;
        if (!lastProcessedMs) return null;
        const remaining = jobs.filter(j => j.status === 'pending').length;
        return Math.round((remaining * lastProcessedMs) / 1000);
    }

    /** Progress as 0–100 percentage. */
    getProgress(): number {
        const { jobs } = this.state;
        if (!jobs.length) return 0;
        const done = jobs.filter(j => j.status === 'done' || j.status === 'skipped' || j.status === 'failed').length;
        return Math.round((done / jobs.length) * 100);
    }
}

export const EnrichmentQueue = new EnrichmentQueueService();
