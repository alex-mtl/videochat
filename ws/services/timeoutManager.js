// timeout-manager.js
class TimeoutManager {
    constructor() {
        this.timeouts = new Map(); // Map<timeoutId, metadata>
        this.timeoutCounter = 0;
    }

    /**
     * Set a timeout with tracking
     * @param {Function} callback - Function to execute
     * @param {number} delay - Delay in milliseconds
     * @param {Object} metadata - Additional info about the timeout
     * @returns {number} - Timeout ID
     */
    set(callback, delay, metadata = {}) {
        const id = ++this.timeoutCounter;

        const timeoutHandle = setTimeout(async () => {
            try {
                await callback();
            } finally {
                this.clear(id);
            }
        }, delay);

        const now = Date.now();

        this.timeouts.set(id, {
            timeoutHandle,
            id,
            callback,
            delay,
            metadata,
            createdAt: now,
            scheduledAt: now + delay
        });

        return id;
    }

    /**
     * Clear a specific timeout by our internal ID
     * @param {number} id - Internal timeout ID
     */
    clear(id) {
        console.log('Clearing timeout with ID:', id);
        const timeout = this.timeouts.get(id);
        if (timeout) {
            clearTimeout(timeout.timeoutHandle);
            this.timeouts.delete(id);
        }
    }

    clearPrevious(id) {
        console.log('Clearing timeout less than ID:', id);
        const timeouts = this.getLessThan(id)
        if (timeouts) {
            timeouts.forEach(timeout => {
                clearTimeout(timeout.timeoutHandle);
                this.timeouts.delete(timeout.id);
            })

        }
    }

    /**
     * Clear all tracked timeouts
     */
    clearAll() {
        for (const [id, timeout] of this.timeouts) {
            clearTimeout(timeout.timeoutHandle);
        }
        this.timeouts.clear();
    }

    /**
     * Get all active timeouts
     * @returns {Array} - List of timeout metadata
     */
    getAll() {
        return Array.from(this.timeouts.values()).map(({ timeoutId, ...rest }) => rest);
    }

    getLessThan(maxId) {
        const result = [];

        for (const [id, timeout] of this.timeouts) {
            if (id < maxId) {
                result.push({
                    id, // Include the timeout ID
                    callback: timeout.callback,
                    delay: timeout.delay,
                    metadata: timeout.metadata,
                    createdAt: timeout.createdAt,
                    scheduledAt: timeout.scheduledAt
                    // Note: timeoutId is intentionally excluded as it's the internal setTimeout ID
                });
            }
        }

        return result;
    }

    /**
     * Get timeouts filtered by metadata
     * @param {Object} filter - Key-value pairs to filter by
     * @returns {Array} - Filtered timeouts
     */
    getByMetadata(filter) {
        return this.getAll().filter(timeout => {
            return Object.entries(filter).every(([key, value]) =>
                timeout.metadata[key] === value
            );
        });
    }

    /**
     * Get timeout by internal ID
     * @param {number} id - Internal timeout ID
     * @returns {Object|null} - Timeout metadata
     */
    getById(id) {
        const timeout = this.timeouts.get(id);
        if (!timeout) return null;

        const { timeoutId, ...rest } = timeout;
        return rest;
    }

    /**
     * Get count of active timeouts
     * @returns {number} - Count of active timeouts
     */
    getCount() {
        return this.timeouts.size;
    }

    hhmmss() {
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        return time;
    }
}

// Singleton instance
const timeoutManager = new TimeoutManager();
module.exports =  { timeoutManager };