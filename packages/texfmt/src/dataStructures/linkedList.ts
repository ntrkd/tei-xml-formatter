export class ChainNode<T> {
    previous: ChainNode<T> | null;
    next: ChainNode<T> | null;
    data: T;

    constructor(
        data: T,
        previous: ChainNode<T> | null,
        next: ChainNode<T> | null
    ) {
        this.data = data;
        this.previous = previous;
        this.next = next;
    }
}

/**
 * There can only exist two possibilities
 * 1. Size is 0, and all is nul
 * 2. Size is not 0, and all is populated
 */
type ListState<T> = 
  | { head: null; tail: null; size: 0 }
  | { head: ChainNode<T>; tail: ChainNode<T>; size: number };

export class LinkedList<T> {
    private state: ListState<T> = { head: null, tail: null, size: 0};
    private nullSurpriseError = "Expected non-null reference in LinkedList but got null reference";

    append(data: T): void {
        if (this.state.size === 0) {
            let node = new ChainNode<T>(data, null, null);
            this.state = { head: node, tail: node, size: 1 };
        } else {
            if (this.state.tail === null) {
                throw new Error(this.nullSurpriseError);
            }

            let currentTail = this.state.tail;
            let node = new ChainNode<T>(data, currentTail, null);
            this.state.tail = node;
            currentTail.next = node;
            this.state.size++;
        }
    }

    prepend(data: T): void {
        if (this.state.size === 0) {
            let node = new ChainNode<T>(data, null, null);
            this.state = { head: node, tail: node, size: 1 };
        } else {
            if (this.state.head === null) {
                throw new Error(this.nullSurpriseError);
            }

            let currentHead = this.state.head;
            let node = new ChainNode<T>(data, null, currentHead);
            this.state.head = node;
            currentHead.previous = node;
            this.state.size++;
        }
    }

    /**
     * Find and delete node from LinkedList using a reference node
     */
    deleteRef(ref: ChainNode<T>) {
        if (this.state.head === null) { return; }

        let current: ChainNode<T> | null = this.state.head;
        while (current !== null) {
            if (current === ref) {
                if (this.state.size === 1) {
                    this.sizeOneDeleteHelper();
                } else if (current === this.state.head) {
                    this.deleteHead();
                } else if (current === this.state.tail) {
                    this.deleteTail();
                } else {
                    let prev = current.previous;
                    let next = current.next;
                    if (prev === null || next === null) {
                        throw new Error(this.nullSurpriseError);
                    }

                    prev.next = next;
                    next.previous = prev;
                    this.state.size--;
                }

                // For extra memory saftey null out-bound reference
                current.next = null;
                current.previous = null;
            }

            current = current.next;
        }
    }

    deleteHead(): ChainNode<T> | null {
        if (this.state.size === 1) {
            return this.sizeOneDeleteHelper();
        } else if (this.state.size < 1) {
            return null;
        }

        let current: ChainNode<T> | null = this.state.head;
        if (current === null) { return null; }

        let next = current.next;
        if (next === null) {
            throw new Error(this.nullSurpriseError);
        }

        this.state.head = next;
        next.previous = null;
        this.state.size--;
        return current;
    }

    deleteTail(): ChainNode<T> | null {
        if (this.state.size === 1) {
            return this.sizeOneDeleteHelper();
        } else if (this.state.size < 1) {
            return null;
        }

        let current: ChainNode<T> | null = this.state.tail;
        if (current === null) { return null; }

        let prev = current.previous;
        if (prev === null) {
            throw new Error(this.nullSurpriseError);
        }

        this.state.tail = prev;
        prev.next = null;
        this.state.size--;
        return current;
    }

    private sizeOneDeleteHelper(): ChainNode<T> | null {
        if (this.state.head === null) { return null; }

        let deleted = this.state.head;
        this.state = { head: null, tail: null, size: 0};
        return deleted;
    }

    getHead(): ChainNode<T> | null {
        return this.state.head;
    }

    getTail(): ChainNode<T> | null {
        return this.state.tail;
    }

    getSize(): number {
        return this.state.size;
    }

    /**
     * Serializes the list into a string format.
     * Example output: [val1] <-> [val2] <-> [val3]
     */
    toString(): string {
        const parts: string[] = [];
        let current = this.state.head;

        while (current !== null) {
            parts.push(`[${String(current.data)}]`);
            current = current.next;
        }

        return parts.length > 0 ? parts.join(" <-> ") : "Empty List";
    }
}