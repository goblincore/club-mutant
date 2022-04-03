class Queue {
    constructor() {
        this.items = [];
    }

    isEmpty() {
        return (this.items.length === 0);
    }

    enqueue(item) {
        this.items.unshift(item);
    }

    dequeue() {
        return this.items.pop();
    }

    size() {
        return this.items.length;
    }
}

export default Queue;