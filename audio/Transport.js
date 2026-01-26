export class Transport {
  constructor() {
    this._isRunning = false;
    this._startedAt = 0;
    this._offset = 0;
  }

  start(ctxTime) {
    if (this._isRunning) return;
    this._isRunning = true;
    this._startedAt = ctxTime;
  }

  stop(ctxTime) {
    if (!this._isRunning) return;
    this._offset += Math.max(0, ctxTime - this._startedAt);
    this._isRunning = false;
  }

  reset() {
    this._isRunning = false;
    this._startedAt = 0;
    this._offset = 0;
  }

  time(ctxTime) {
    if (!this._isRunning) return this._offset;
    return this._offset + Math.max(0, ctxTime - this._startedAt);
  }

  get isRunning() {
    return this._isRunning;
  }
}
