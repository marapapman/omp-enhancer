export class SimpleAssistantMessageEventStream {
  constructor() {
    this.queue = [];
    this.waiting = [];
    this.done = false;
    this.resultSettled = false;
    this.failed = false;
    this.error = undefined;
    this.finalResultPromise = new Promise((resolve, reject) => {
      this.resolveFinalResult = resolve;
      this.rejectFinalResult = reject;
    });
    this.finalResultPromise.catch(() => {});
  }

  push(event) {
    if (this.done) return;
    if (event?.type === 'done' || event?.type === 'error') {
      this.done = true;
      this.resultSettled = true;
      this.resolveFinalResult(event.type === 'done' ? event.message : event.error);
    }
    this.deliver(event);
  }

  deliver(event) {
    const waiter = this.waiting.shift();
    if (waiter) waiter.resolve({ value: event, done: false });
    else this.queue.push(event);
  }

  end(result) {
    if (this.done) return;
    this.done = true;
    this.resultSettled = true;
    if (result !== undefined) this.resolveFinalResult(result);
    else this.rejectFinalResult(new Error('Stream ended without a final result'));
    this.endWaiting();
  }

  fail(error) {
    if (this.done) return;
    this.done = true;
    this.failed = true;
    this.error = error;
    this.resultSettled = true;
    this.rejectFinalResult(error);
    while (this.waiting.length > 0) {
      this.waiting.shift().reject(error);
    }
  }

  endWaiting() {
    while (this.waiting.length > 0) {
      this.waiting.shift().resolve({ value: undefined, done: true });
    }
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift();
      } else if (this.failed) {
        throw this.error;
      } else if (this.done) {
        return;
      } else {
        const result = await new Promise((resolve, reject) => {
          this.waiting.push({ resolve, reject });
        });
        if (result.done) return;
        yield result.value;
      }
    }
  }

  result() {
    return this.finalResultPromise;
  }
}
