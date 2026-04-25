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
 * - Circuit breaker: auto-pauses after consecutive failures
 */
import { LLMService } from './llm';
import { SchemaMapper } from './schema-mapper';
import { inventoryStore } from '../state/store';

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
    circuitBroken: boolean;         // true when auto-paused by circuit breaker
}

type QueueListener = (state: QueueState) => void;

// ── Circuit Breaker Configuration ────────────────────────────────────────────
const CIRCUIT_BREAKER_THRESHOLD = 3;     // consecutive failures to trigger
const CIRCUIT_BREAKER_WINDOW_MS = 120000; // 2 minutes

class EnrichmentQueueService {
    private state: QueueState = {
        jobs: [],
        isRunning: false,
        isPaused: false,
        completedCount: 0,
        failedCount: 0,
        startedAt: null,
        lastProcessedMs: null,
        circuitBroken: false,
    };

    private listeners: Set<QueueListener> = new Set();
    private abortController: AbortController | null = null;

    // Circuit breaker state
    private _consecutiveFailures = 0;
    private _firstFailureAt: number | null = null;

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

    // ── Circuit Breaker ───────────────────────────────────────
    private _recordSuccess() {
        this._consecutiveFailures = 0;
        this._firstFailureAt = null;
    }

    /**
     * Records a failure. Distinguishes between fatal errors (trip immediately)
     * and transient errors (trip after threshold).
     */
    private _recordFailure(err?: any): boolean {
        const now = Date.now();
        const errMsg = err?.message?.toLowerCase() || '';

        // Fatal errors: Model misconfigured, Auth failed, Invalid JSON (hallucination loop)
        const isFatal = errMsg.includes('unauthorized') || 
                        errMsg.includes('401') || 
                        errMsg.includes('json') || 
                        errMsg.includes('parse');

        if (isFatal) {
            console.error(`[EnrichmentQueue] Fatal error detected: "${err?.message}". Auto-pausing immediately.`);
            this.setState({ isPaused: true, circuitBroken: true });
            this._consecutiveFailures = 0;
            this._firstFailureAt = null;
            return true;
        }

        // Transient errors (network, timeouts) follow the rolling window threshold
        if (this._firstFailureAt && (now - this._firstFailureAt) > CIRCUIT_BREAKER_WINDOW_MS) {
            this._consecutiveFailures = 0;
            this._firstFailureAt = null;
        }

        if (!this._firstFailureAt) this._firstFailureAt = now;
        this._consecutiveFailures++;

        if (this._consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            console.error(
                `[EnrichmentQueue] Circuit breaker tripped: ${CIRCUIT_BREAKER_THRESHOLD} consecutive transient failures ` +
                `in ${Math.round((now - this._firstFailureAt) / 1000)}s. Auto-pausing queue.`
            );
            this.setState({ isPaused: true, circuitBroken: true });
            this._consecutiveFailures = 0;
            this._firstFailureAt = null;
            return true;
        }

        return false;
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
            circuitBroken: false,
        });
    }

    /** Start processing the queue from the first pending job. */
    async start() {
        if (this.state.isRunning) return;
        this.abortController = new AbortController();
        this.setState({ isRunning: true, isPaused: false, startedAt: Date.now(), circuitBroken: false });
        this._consecutiveFailures = 0;
        this._firstFailureAt = null;
        await this._processNext(this.abortController.signal);
    }

    /** Pause after the current job finishes. */
    pause() {
        this.setState({ isPaused: true });
    }

    /** Resume from where we left off. */
    async resume() {
        if (!this.state.isRunning || !this.state.isPaused) return;
        this.setState({ isPaused: false, circuitBroken: false });
        this._consecutiveFailures = 0;
        this._firstFailureAt = null;
        await this._processNext(this.abortController!.signal);
    }

    /** Stop the queue entirely and reset. */
    cancel() {
        this.abortController?.abort();
        this.setState({
            isRunning: false,
            isPaused: false,
            circuitBroken: false,
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
            circuitBroken: false,
        });
    }

    // ── Internal Processing Loop ───────────────────────────────

    private async _processNext(signal: AbortSignal) {
        while (true) {
            if (signal.aborted || this.state.isPaused) {
                this.setState({ isRunning: !this.state.isPaused ? false : this.state.isRunning });
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
                continue;
            }

            const t0 = Date.now();
            try {
                const result = await LLMService.enrichProduct(product);

                // Use SchemaMapper for deep CPO v4.2 merge with Observation/Consensus
                const updated = SchemaMapper.mergeIntoProduct(product, result);

                // Write back to store (which also persists to IDB via Persistence.updateOne)
                inventoryStore.updateProduct(updated);

                const elapsed = Date.now() - t0;
                jobs[nextIndex] = { ...jobs[nextIndex], status: 'done' };
                this.setState({
                    jobs,
                    completedCount: this.state.completedCount + 1,
                    lastProcessedMs: elapsed,
                });

                // Circuit breaker: reset on success
                this._recordSuccess();
            } catch (err: any) {
                if (signal.aborted) return;
                jobs[nextIndex] = { ...jobs[nextIndex], status: 'failed', error: err.message };
                this.setState({ jobs, failedCount: this.state.failedCount + 1 });

                // Circuit breaker: record failure and potentially trip
                if (this._recordFailure(err)) {
                    // Circuit tripped — _recordFailure already set isPaused and circuitBroken.
                    // The loop will halt on the next iteration.
                    return;
                }
            }

            // Small delay between jobs to avoid hammering the LLM
            await new Promise(r => setTimeout(r, 300));
        }
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
