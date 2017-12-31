"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Count down to zero and invoke cb finally.
 */
class CountDownLatch {
    constructor(count, cb) {
        this.count = count;
        this.cb = cb;
    }
    /**
     * Call when a task finish to count down.
     *
     * @api public
     */
    done() {
        if (this.count <= 0) {
            throw new Error("illegal state.");
        }
        this.count--;
        if (this.count === 0) {
            this.cb();
        }
    }
}
exports.CountDownLatch = CountDownLatch;
/**
 * create a count down latch
 *
 * @api public
 */
function createCountDownLatch(count, cb) {
    if (!count || count <= 0) {
        throw new Error("count should be positive.");
    }
    if (typeof cb !== "function") {
        throw new Error("cb should be a function.");
    }
    return new CountDownLatch(count, cb);
}
exports.createCountDownLatch = createCountDownLatch;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY291bnREb3duTGF0Y2guanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb3VudERvd25MYXRjaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBOztHQUVHO0FBQ0g7SUFDQyxZQUFvQixLQUFhLEVBQVUsRUFBWTtRQUFuQyxVQUFLLEdBQUwsS0FBSyxDQUFRO1FBQVUsT0FBRSxHQUFGLEVBQUUsQ0FBVTtJQUFHLENBQUM7SUFFM0Q7Ozs7T0FJRztJQUNILElBQUk7UUFDSCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ25DLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDYixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEIsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ1gsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQWxCRCx3Q0FrQkM7QUFDRDs7OztHQUlHO0FBQ0gsOEJBQXFDLEtBQWEsRUFBRSxFQUFZO0lBQy9ELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFCLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBQ0QsRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztRQUM5QixNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFJLGNBQWMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDdEMsQ0FBQztBQVRELG9EQVNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDb3VudCBkb3duIHRvIHplcm8gYW5kIGludm9rZSBjYiBmaW5hbGx5LlxuICovXG5leHBvcnQgY2xhc3MgQ291bnREb3duTGF0Y2gge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGNvdW50OiBudW1iZXIsIHByaXZhdGUgY2I6IEZ1bmN0aW9uKSB7fVxuXG5cdC8qKlxuXHQgKiBDYWxsIHdoZW4gYSB0YXNrIGZpbmlzaCB0byBjb3VudCBkb3duLlxuXHQgKlxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0ZG9uZSgpIHtcblx0XHRpZiAodGhpcy5jb3VudCA8PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJpbGxlZ2FsIHN0YXRlLlwiKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvdW50LS07XG5cdFx0aWYgKHRoaXMuY291bnQgPT09IDApIHtcblx0XHRcdHRoaXMuY2IoKTtcblx0XHR9XG5cdH1cbn1cbi8qKlxuICogY3JlYXRlIGEgY291bnQgZG93biBsYXRjaFxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDb3VudERvd25MYXRjaChjb3VudDogbnVtYmVyLCBjYjogRnVuY3Rpb24pIHtcblx0aWYgKCFjb3VudCB8fCBjb3VudCA8PSAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiY291bnQgc2hvdWxkIGJlIHBvc2l0aXZlLlwiKTtcblx0fVxuXHRpZiAodHlwZW9mIGNiICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJjYiBzaG91bGQgYmUgYSBmdW5jdGlvbi5cIik7XG5cdH1cblxuXHRyZXR1cm4gbmV3IENvdW50RG93bkxhdGNoKGNvdW50LCBjYik7XG59XG4iXX0=