// Event bus for gesture events with subscription management
import {
  GestureEvent,
  GestureEventType,
  GestureEventListener,
  GestureType,
  GesturePhase,
  GestureEventSubscription,
} from "./gesture-engine-types";

export class GestureEventBus {
  private listeners: Map<GestureEventType, GestureEventListener[]> = new Map();
  private wildcardListeners: GestureEventListener[] = [];
  private onceListeners: Map<GestureEventType, GestureEventListener[]> =
    new Map();
  private debugEnabled: boolean = false;

  constructor(debugEnabled: boolean = false) {
    this.debugEnabled = debugEnabled;
  }

  /**
   * Subscribe to specific gesture events
   */
  on(eventType: GestureEventType, listener: GestureEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);

    if (this.debugEnabled) {
      console.log(`[GestureEventBus] Subscribed to ${eventType}`);
    }
  }

  /**
   * Subscribe to specific gesture events (one-time only)
   */
  once(eventType: GestureEventType, listener: GestureEventListener): void {
    if (!this.onceListeners.has(eventType)) {
      this.onceListeners.set(eventType, []);
    }
    this.onceListeners.get(eventType)!.push(listener);

    if (this.debugEnabled) {
      console.log(`[GestureEventBus] Subscribed once to ${eventType}`);
    }
  }

  /**
   * Subscribe to all gesture events
   */
  onAny(listener: GestureEventListener): void {
    this.wildcardListeners.push(listener);

    if (this.debugEnabled) {
      console.log(`[GestureEventBus] Subscribed to all events`);
    }
  }

  /**
   * Remove specific event listener
   */
  off(eventType: GestureEventType, listener: GestureEventListener): void {
    // Remove from regular listeners
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
        if (listeners.length === 0) {
          this.listeners.delete(eventType);
        }
      }
    }

    // Remove from once listeners
    const onceListeners = this.onceListeners.get(eventType);
    if (onceListeners) {
      const index = onceListeners.indexOf(listener);
      if (index !== -1) {
        onceListeners.splice(index, 1);
        if (onceListeners.length === 0) {
          this.onceListeners.delete(eventType);
        }
      }
    }

    if (this.debugEnabled) {
      console.log(`[GestureEventBus] Unsubscribed from ${eventType}`);
    }
  }

  /**
   * Remove wildcard listener
   */
  offAny(listener: GestureEventListener): void {
    const index = this.wildcardListeners.indexOf(listener);
    if (index !== -1) {
      this.wildcardListeners.splice(index, 1);
    }

    if (this.debugEnabled) {
      console.log(`[GestureEventBus] Unsubscribed from all events`);
    }
  }

  /**
   * Convenience method: Subscribe to gesture start events
   */
  onGestureStart(
    gestureType: GestureType,
    listener: GestureEventListener
  ): void {
    this.on(`${gestureType}-start`, listener);
  }

  /**
   * Convenience method: Subscribe to gesture end events
   */
  onGestureEnd(gestureType: GestureType, listener: GestureEventListener): void {
    this.on(`${gestureType}-released`, listener);
  }

  /**
   * Convenience method: Subscribe to gesture held events
   */
  onGestureHeld(
    gestureType: GestureType,
    listener: GestureEventListener
  ): void {
    this.on(`${gestureType}-held`, listener);
  }

  /**
   * Convenience method: Subscribe to gesture move events
   */
  onGestureMove(
    gestureType: GestureType,
    listener: GestureEventListener
  ): void {
    this.on(`${gestureType}-move`, listener);
  }

  /**
   * Convenience method: Subscribe to all phases of a specific gesture
   */
  onGestureAll(gestureType: GestureType, listener: GestureEventListener): void {
    const phases: GesturePhase[] = ["start", "held", "move", "released"];
    phases.forEach((phase) => {
      this.on(`${gestureType}-${phase}`, listener);
    });
  }

  /**
   * Emit events with error handling and debugging
   */
  emit(event: GestureEvent): void {
    const eventType: GestureEventType = `${event.type}-${event.phase}`;

    if (this.debugEnabled) {
      console.log(`[GestureEventBus] Emitting ${eventType}:`, {
        hand: event.hand,
        position: event.position,
        confidence: event.confidence,
        duration: event.duration,
      });
    }

    // Emit to specific listeners
    const specificListeners = this.listeners.get(eventType) || [];
    specificListeners.forEach((listener) =>
      this.safeCall(listener, event, eventType)
    );

    // Emit to once listeners and remove them
    const onceListeners = this.onceListeners.get(eventType) || [];
    if (onceListeners.length > 0) {
      onceListeners.forEach((listener) =>
        this.safeCall(listener, event, eventType)
      );
      this.onceListeners.delete(eventType); // Remove all once listeners after emission
    }

    // Emit to wildcard listeners
    this.wildcardListeners.forEach((listener) =>
      this.safeCall(listener, event, eventType)
    );

    // Log listener counts for debugging
    if (this.debugEnabled) {
      const totalListeners =
        specificListeners.length +
        onceListeners.length +
        this.wildcardListeners.length;
      console.log(
        `[GestureEventBus] Notified ${totalListeners} listeners for ${eventType}`
      );
    }
  }

  /**
   * Safely call listener with error handling
   */
  private safeCall(
    listener: GestureEventListener,
    event: GestureEvent,
    eventType: string
  ): void {
    try {
      listener(event);
    } catch (error) {
      console.error(
        `[GestureEventBus] Listener error for ${eventType}:`,
        error
      );
      console.error(`[GestureEventBus] Event data:`, event);
      console.error(`[GestureEventBus] Listener:`, listener);
    }
  }

  /**
   * Get current listener counts for debugging
   */
  getListenerCounts(): Record<string, number> {
    const counts: Record<string, number> = {};

    // Count specific listeners
    this.listeners.forEach((listeners, eventType) => {
      counts[eventType] = listeners.length;
    });

    // Count once listeners
    this.onceListeners.forEach((listeners, eventType) => {
      const key = `${eventType} (once)`;
      counts[key] = listeners.length;
    });

    // Count wildcard listeners
    if (this.wildcardListeners.length > 0) {
      counts["*"] = this.wildcardListeners.length;
    }

    return counts;
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
    this.onceListeners.clear();
    this.wildcardListeners = [];

    if (this.debugEnabled) {
      console.log(`[GestureEventBus] Cleared all listeners`);
    }
  }

  /**
   * Enable or disable debug logging
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Check if there are any listeners for a specific event type
   */
  hasListeners(eventType: GestureEventType): boolean {
    const specificListeners = this.listeners.get(eventType)?.length || 0;
    const onceListeners = this.onceListeners.get(eventType)?.length || 0;
    const wildcardListeners = this.wildcardListeners.length;

    return specificListeners > 0 || onceListeners > 0 || wildcardListeners > 0;
  }
}
